#!/usr/bin/env bash
# Disposable, same-cluster pg_dump fallback rehearsal. Never starts an old app/worker.
set -euo pipefail
umask 077
acceptance_dir=${1:?Acceptance directory required}
project=${2:?Acceptance project required}
case "$acceptance_dir" in /*/flare-acceptance-*) ;; *) echo 'Disposable acceptance directory required.' >&2; exit 1;; esac
[[ "$project" =~ ^flare-acceptance-[0-9]+-[0-9]+$ ]] || { echo 'Disposable acceptance project required.' >&2; exit 1; }
node -e 'const fs=require("node:fs");if(!/^FLARE_ACCEPTANCE=true$/m.test(fs.readFileSync(process.argv[1],"utf8")))process.exit(1)' "$acceptance_dir/.env"
compose=(docker compose --project-name "$project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/docker-compose.yml" -f "$acceptance_dir/docker-compose.acceptance.yml")
api=$("${compose[@]}" ps -q flare-api)
[[ -n "$api" && "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$api")" == "$project" ]] || exit 1
private_dir=$(mktemp -d "$acceptance_dir/upgrade-XXXXXX")
prepared=false
restored=false
stage=prepare
cleanup_upgrade() {
  result=$?
  trap - EXIT
  if [[ "$restored" == true ]]; then "${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs cleanup flare_upgrade_restored >>"$private_dir/operations.log" 2>&1 || result=1; fi
  if [[ "$prepared" == true ]]; then "${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs cleanup flare_upgrade_test >>"$private_dir/operations.log" 2>&1 || result=1; fi
  # Dumps and row snapshots contain synthetic payloads/credentials; never upload or log them.
  rm -rf -- "$private_dir"
  rm -f -- "$acceptance_dir/acceptance/upgrade-baseline.json" "$acceptance_dir/acceptance/upgrade-flare_upgrade_test.json" "$acceptance_dir/acceptance/upgrade-flare_upgrade_restored.json"
  if [[ "$result" -ne 0 ]]; then echo "Populated upgrade/snapshot rehearsal failed during $stage; private dumps removed." >&2; fi
  exit "$result"
}
trap cleanup_upgrade EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs prepare flare_upgrade_test
prepared=true
stage=pre-upgrade-backup
"${compose[@]}" exec -T postgres pg_dump -U flare -d flare_upgrade_test -Fc >"$private_dir/baseline.dump" 2>>"$private_dir/operations.log"
[[ -s "$private_dir/baseline.dump" ]]
stage=upgrade
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs migrate flare_upgrade_test
stage=repeat-upgrade
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs migrate flare_upgrade_test
stage=isolated-baseline-restore
"${compose[@]}" exec -T postgres createdb -U flare flare_upgrade_restored >>"$private_dir/operations.log" 2>&1
restored=true
"${compose[@]}" exec -T postgres pg_restore -U flare -d flare_upgrade_restored --exit-on-error <"$private_dir/baseline.dump" >>"$private_dir/operations.log" 2>&1
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs baseline flare_upgrade_restored
stage=restored-upgrade
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs migrate flare_upgrade_restored
"${compose[@]}" exec -T flare-api node scripts/acceptance/upgrade.mjs migrate flare_upgrade_restored
echo 'Populated upgrade and pre-upgrade snapshot restore passed. Same-cluster PostgreSQL only; no down migration or delivery restart was attempted.'
