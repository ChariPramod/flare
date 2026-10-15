#!/usr/bin/env bash
# Actual Caddy routing with synthetic upstreams on an egress-isolated Docker network.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker-path.sh
node scripts/local-docker.mjs
staging_smoke="flare-staging-smoke-$$-$RANDOM"
cleanup() {
  staging_smoke_status=$?
  if [[ "$staging_smoke_status" -ne 0 ]]; then
    # These containers contain synthetic data only; no deployment secrets are mounted.
    docker logs --tail 25 "$staging_smoke-ingress" >&2 || true
    docker logs --tail 10 "$staging_smoke-fixture" >&2 || true
  fi
  docker rm -f "$staging_smoke-ingress" "$staging_smoke-fixture" >/dev/null 2>&1 || true
  docker network rm "$staging_smoke" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create --internal "$staging_smoke" >/dev/null
docker run -d --rm --name "$staging_smoke-fixture" --network "$staging_smoke" \
  --network-alias flare-web --network-alias flare-api --network-alias novu-ws \
  --read-only --user node --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/scripts/staging/fixture-server.mjs:/fixture-server.mjs:ro" \
  -v "$PWD/scripts/staging/fixture-client.mjs:/fixture-client.mjs:ro" \
  node:22.23.3-bookworm-slim node /fixture-server.mjs >/dev/null
# HTTP origins suppress ACME for this isolated route test; production config is validated separately.
docker run -d --rm --name "$staging_smoke-ingress" --network "$staging_smoke" --network-alias ingress \
  --tmpfs /data --tmpfs /config \
  -e STAGING_DASHBOARD_HOST=http://dashboard.staging.example.com \
  -e STAGING_API_HOST=http://api.staging.example.com \
  -e STAGING_WS_HOST=http://ws.staging.example.com \
  -e STAGING_TRACKING_HOST=http://track.staging.example.com \
  -e STAGING_ACME_EMAIL=operator@example.com \
  -v "$PWD/ops/staging/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.2-alpine caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
docker exec "$staging_smoke-fixture" node /fixture-client.mjs
