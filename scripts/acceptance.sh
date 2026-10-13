#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .tools/node/bin/node ]]; then export PATH="$PWD/.tools/node/bin:$PWD/.tools/pnpm/node_modules/.bin:$PWD/.tools/bin:$PATH"; fi
command -v docker >/dev/null || { echo 'Docker is required for full-stack acceptance.' >&2; exit 1; }
docker info >/dev/null
acceptance_dir=$(node scripts/acceptance/prepare.mjs)
project="flare-acceptance-$(date +%s)-$$"
compose=(docker compose --project-name "$project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/docker-compose.yml" -f "$acceptance_dir/docker-compose.acceptance.yml")
cleanup() {
  result=$?
  if [[ $result -ne 0 ]]; then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --no-color --tail 80 flare-migrate flare-api flare-worker flare-smtp-relay novu-api novu-worker postal-init 2>/dev/null | node scripts/acceptance/diagnostics.mjs "$acceptance_dir/.env" || true
    echo 'Acceptance failed. Only filtered, redacted error diagnostics are shown.' >&2
  fi
  "${compose[@]}" down -v --remove-orphans || true
  case "$acceptance_dir" in */flare-acceptance-*) rm -rf -- "$acceptance_dir";; esac
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" build
# This job owns an ephemeral GitHub-hosted Docker daemon. Never prune a local user's cache.
if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then docker builder prune --force; fi
"${compose[@]}" up -d --wait --wait-timeout 600
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs
"${compose[@]}" exec -T flare-api pnpm --filter @flare/db seed
"${compose[@]}" exec -T flare-api node scripts/acceptance/bootstrap.mjs
"${compose[@]}" exec -T flare-api pnpm seed
"${compose[@]}" exec -T flare-api pnpm seed
"${compose[@]}" exec -T flare-api node scripts/acceptance/scenarios.mjs
# Execute browsers on the host; credentials are read from the private generated env file.
node scripts/acceptance/browser.mjs "$acceptance_dir/.env"
"${compose[@]}" stop flare-worker
"${compose[@]}" exec -T flare-api node scripts/acceptance/load.mjs accept
"${compose[@]}" exec -T redis redis-cli FLUSHDB
"${compose[@]}" start --wait --wait-timeout 120 flare-worker
"${compose[@]}" exec -T flare-api node scripts/acceptance/load.mjs verify
printf 'Pinned full-stack acceptance passed (simulated local DNS/providers; external checks remain separate).\n'
