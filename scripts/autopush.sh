#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(git branch --show-current)" == main ]] || { echo 'Only main may be pushed.'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Working tree must be clean.'; exit 1; }
git push origin main
