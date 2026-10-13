#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .tools/node/bin/node ]]; then export PATH="$PWD/.tools/node/bin:$PWD/.tools/pnpm/node_modules/.bin:$PWD/.tools/bin:$PATH"; fi
trap 'docker compose -f docker-compose.test.yml down -v' EXIT
docker compose -f docker-compose.test.yml up -d --build --wait
pnpm typecheck
pnpm test:integration
