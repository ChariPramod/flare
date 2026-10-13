#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .tools/node/bin/node ]]; then export PATH="$PWD/.tools/node/bin:$PWD/.tools/pnpm/node_modules/.bin:$PWD/.tools/bin:$PATH"; fi
command -v gitleaks >/dev/null || { echo 'Install gitleaks before a checkpoint (see README).'; exit 1; }
pnpm lint
pnpm typecheck
pnpm openapi:check
pnpm test
pnpm build
gitleaks dir . --redact --config .gitleaks.toml
printf '\nCheckpoint checks passed. Suggested scope: %s\n' "${1:-platform}"
