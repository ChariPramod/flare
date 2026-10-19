#!/usr/bin/env bash
# CI-only configuration validation with synthetic values; no application services or ACME.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker-path.sh
node scripts/local-docker.mjs
umask 077
staging_fixture=$(mktemp -d "${TMPDIR:-/tmp}/flare-staging-config-XXXXXX")
trap 'rm -rf -- "$staging_fixture"' EXIT
mkdir -p "$staging_fixture/ops/staging"
cp docker-compose.yml docker-compose.staging.yml docker-compose.staging-split-web.yml "$staging_fixture/"
cp ops/staging/Caddyfile ops/staging/Caddyfile.split-web ops/staging/postal-inbound.yml "$staging_fixture/ops/staging/"
cp .env.example "$staging_fixture/.env"
# Reserved example hostnames and fake credentials, never a deployment's .env.
cat >>"$staging_fixture/.env" <<'ENV'
STAGING_DASHBOARD_HOST=dashboard.staging.example.com
STAGING_API_HOST=api.staging.example.com
STAGING_WS_HOST=ws.staging.example.com
STAGING_TRACKING_HOST=track.staging.example.com
STAGING_ACME_EMAIL=operator@example.com
ENV
# Replace the optional blank development value only inside this disposable fixture.
node --input-type=module - "$staging_fixture/.env" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2];
const source = readFileSync(path, 'utf8').replace(/^FLARE_DASHBOARD_PROXY_SECRET=.*\n?/gm, '');
writeFileSync(path, `${source}\nFLARE_DASHBOARD_PROXY_SECRET=fdp_${Buffer.alloc(32, 27).toString('base64')}\n`);
NODE
compose=(docker compose --project-name "flare-staging-config-$$" --project-directory "$staging_fixture" --env-file "$staging_fixture/.env" -f "$staging_fixture/docker-compose.yml" -f "$staging_fixture/docker-compose.staging.yml")
for web_mode in compose vercel; do
  selected_compose=("${compose[@]}")
  validate_model=(node scripts/staging/validate-model.mjs)
  caddyfile=Caddyfile
  if [[ "$web_mode" == vercel ]]; then
    selected_compose+=(-f "$staging_fixture/docker-compose.staging-split-web.yml")
    validate_model+=(--split-web)
    caddyfile=Caddyfile.split-web
  fi
  "${selected_compose[@]}" config --quiet
  "${selected_compose[@]}" config --format json | "${validate_model[@]}"
  "${selected_compose[@]}" -f "$staging_fixture/ops/staging/postal-inbound.yml" config --quiet
  "${selected_compose[@]}" -f "$staging_fixture/ops/staging/postal-inbound.yml" config --format json | "${validate_model[@]}" --postal-inbound
  # No external network, published port, persistent volume, or application container is created.
  docker run --rm --network none \
    -e STAGING_DASHBOARD_HOST=dashboard.staging.example.com \
    -e STAGING_API_HOST=api.staging.example.com \
    -e STAGING_WS_HOST=ws.staging.example.com \
    -e STAGING_TRACKING_HOST=track.staging.example.com \
    -e STAGING_ACME_EMAIL=operator@example.com \
    -v "$staging_fixture/ops/staging/$caddyfile:/etc/caddy/Caddyfile:ro" \
    caddy:2.10.2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
done
printf 'Both staging web modes and optional Postal inbound boundaries validated with isolated synthetic configuration.\n'
bash scripts/staging/check-ingress.sh
