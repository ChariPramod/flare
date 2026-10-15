#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .tools/node/bin/node ]]; then export PATH="$PWD/.tools/node/bin:$PWD/.tools/pnpm/node_modules/.bin:$PWD/.tools/bin:$PATH"; fi
source scripts/docker-path.sh
node scripts/local-docker.mjs
# Reject inherited targets before creating containers; the suite drops schemas/flushes Redis.
node --input-type=module -e 'import { integrationTargets } from "./apps/worker/tests/targets.mjs"; integrationTargets()'
project="flare-integration-$(date +%s)-$$-$RANDOM"
compose=(docker compose --project-name "$project" --env-file /dev/null -f docker-compose.test.yml)
cleanup() {
  result=$?
  "${compose[@]}" down -v --remove-orphans || true
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" up -d --build --wait postgres redis minio mailpit
"${compose[@]}" run --rm --build minio-init
pnpm typecheck
pnpm test:integration
