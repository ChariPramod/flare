#!/usr/bin/env bash
# CI-only configuration validation with synthetic values; no application services or ACME.
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077
staging_fixture=$(mktemp -d "${TMPDIR:-/tmp}/flare-staging-config-XXXXXX")
trap 'rm -rf -- "$staging_fixture"' EXIT
mkdir -p "$staging_fixture/ops/staging"
cp docker-compose.yml docker-compose.staging.yml "$staging_fixture/"
cp ops/staging/Caddyfile ops/staging/postal-inbound.yml "$staging_fixture/ops/staging/"
cp .env.example "$staging_fixture/.env"
# These are reserved example hostnames and fake credentials, never a deployment's .env.
cat >>"$staging_fixture/.env" <<'ENV'
STAGING_DASHBOARD_HOST=dashboard.staging.example.com
STAGING_API_HOST=api.staging.example.com
STAGING_WS_HOST=ws.staging.example.com
STAGING_TRACKING_HOST=track.staging.example.com
STAGING_ACME_EMAIL=operator@example.com
ENV
compose=(docker compose --project-name "flare-staging-config-$$" --project-directory "$staging_fixture" --env-file "$staging_fixture/.env" -f "$staging_fixture/docker-compose.yml" -f "$staging_fixture/docker-compose.staging.yml")
"${compose[@]}" config --quiet
"${compose[@]}" config --format json | node scripts/staging/validate-model.mjs
"${compose[@]}" -f "$staging_fixture/ops/staging/postal-inbound.yml" config --quiet
"${compose[@]}" -f "$staging_fixture/ops/staging/postal-inbound.yml" config --format json | node scripts/staging/validate-model.mjs --postal-inbound
# No external network, published port, persistent volume, or application container is created.
docker run --rm --network none \
  -e STAGING_DASHBOARD_HOST=dashboard.staging.example.com \
  -e STAGING_API_HOST=api.staging.example.com \
  -e STAGING_WS_HOST=ws.staging.example.com \
  -e STAGING_TRACKING_HOST=track.staging.example.com \
  -e STAGING_ACME_EMAIL=operator@example.com \
  -v "$staging_fixture/ops/staging/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
printf 'Staging Compose boundaries and pinned Caddy configuration validated with isolated synthetic configuration.\n'
bash scripts/staging/check-ingress.sh
