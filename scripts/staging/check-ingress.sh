#!/usr/bin/env bash
# Actual Caddy transport checks with synthetic upstreams on egress-isolated Docker networks.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker-path.sh
node scripts/local-docker.mjs
staging_smoke="flare-staging-smoke-$$-$RANDOM"
cleanup_resources() {
  docker rm -f "$staging_smoke-ingress" "$staging_smoke-fixture" >/dev/null 2>&1 || true
  docker network rm "$staging_smoke" >/dev/null 2>&1 || true
}
cleanup() {
  staging_smoke_status=$?
  if [[ "$staging_smoke_status" -ne 0 ]]; then
    # Synthetic data only; never mount deployment credentials in these fixtures.
    docker logs --tail 25 "$staging_smoke-ingress" >&2 || true
    docker logs --tail 10 "$staging_smoke-fixture" >&2 || true
  fi
  cleanup_resources
}
trap cleanup EXIT
for web_mode in compose vercel; do
  caddyfile=Caddyfile
  if [[ "$web_mode" == vercel ]]; then caddyfile=Caddyfile.split-web; fi
  docker network create --internal "$staging_smoke" >/dev/null
  docker run -d --rm --name "$staging_smoke-fixture" --network "$staging_smoke" \
    --network-alias flare-web --network-alias flare-api --network-alias novu-ws \
    --read-only --user node --cap-drop ALL --security-opt no-new-privileges \
    -v "$PWD/scripts/staging/fixture-server.mjs:/fixture-server.mjs:ro" \
    -v "$PWD/scripts/staging/fixture-client.mjs:/fixture-client.mjs:ro" \
    node:22.23.3-bookworm-slim node /fixture-server.mjs >/dev/null
  # HTTP origins suppress ACME only for this isolated test; production syntax is validated separately.
  docker run -d --rm --name "$staging_smoke-ingress" --network "$staging_smoke" --network-alias ingress \
    --tmpfs /data --tmpfs /config \
    -e STAGING_DASHBOARD_HOST=http://dashboard.staging.example.com \
    -e STAGING_API_HOST=http://api.staging.example.com \
    -e STAGING_WS_HOST=http://ws.staging.example.com \
    -e STAGING_TRACKING_HOST=http://track.staging.example.com \
    -e STAGING_ACME_EMAIL=operator@example.com \
    -v "$PWD/ops/staging/$caddyfile:/etc/caddy/Caddyfile:ro" \
    caddy:2.10.2-alpine caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  docker exec "$staging_smoke-fixture" node /fixture-client.mjs "$web_mode"
  docker logs "$staging_smoke-ingress" 2>&1 | node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const logs = readFileSync(0, "utf8");
    if (/fixture-private-(?:query|header|inbox)-marker/.test(logs)) {
      console.error("Ingress runtime logs leaked a synthetic credential; details withheld.");
      process.exit(1);
    }
    if (!logs.includes("http.log.error")) {
      console.error("Expected proxy failure was not logged; privacy check is inconclusive.");
      process.exit(1);
    }
    console.log("Ingress runtime error logs retained diagnostics without request credentials.");'
  cleanup_resources
done
