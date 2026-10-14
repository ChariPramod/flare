#!/usr/bin/env bash
# Destructive queue-loss characterization, limited to the generated acceptance project.
set -euo pipefail
umask 077
acceptance_dir=${1:?Acceptance directory required}
source_project=${2:?Acceptance project required}
case "$acceptance_dir" in /*/flare-acceptance-*) ;; *) echo 'Disposable acceptance directory required.' >&2; exit 1;; esac
[[ "$source_project" =~ ^flare-acceptance-[0-9]+-[0-9]+$ ]] || { echo 'Disposable acceptance project required.' >&2; exit 1; }
node -e 'const fs=require("node:fs");if(!/^FLARE_ACCEPTANCE=true$/m.test(fs.readFileSync(process.argv[1],"utf8")))process.exit(1)' "$acceptance_dir/.env"
compose=(docker compose --project-name "$source_project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/docker-compose.yml" -f "$acceptance_dir/docker-compose.acceptance.yml")
for service in flare-api novu-api novu-worker novu-ws novu-redis; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" && "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" == "$source_project" ]] || exit 1
done
for service in novu-api novu-worker novu-ws; do
  [[ "$("${compose[@]}" exec -T "$service" printenv REDIS_DB_INDEX | tr -d '\r')" == 2 ]] || exit 1
done
canary="acceptance:queue-loss:$source_project"
stage=prepare
restore_needed=false
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$restore_needed" == true ]]; then
    "${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 novu-api novu-worker novu-ws || result=1
  fi
  "${compose[@]}" exec -T novu-redis redis-cli -n 2 DEL "$canary" >/dev/null || result=1
  if [[ "$result" -ne 0 ]]; then echo "Native queue-loss acceptance failed during $stage." >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" exec -T flare-api node scripts/acceptance/crash-recovery.mjs prepare
stage=quiesce-native-producers
# Reserve at least 60s for the parallel 30s service stop and queue destruction.
# Fail before the destructive step if a slow runner missed the intended window.
"${compose[@]}" exec -T flare-api node -e 'const f=require("/acceptance/crash-recovery.json");if(!Number.isFinite(f.earliestDeadline)||f.earliestDeadline-Date.now()<60000)throw Error("Missed native queue-loss preparation window")'
restore_needed=true
"${compose[@]}" stop --timeout 30 novu-worker novu-api novu-ws
for service in novu-api novu-worker novu-ws; do
  container=$("${compose[@]}" ps --all -q "$service")
  [[ "$(docker inspect -f '{{.State.Running}}' "$container")" == false ]] || exit 1
done
stage=lose-native-queues
"${compose[@]}" exec -T novu-redis redis-cli -n 2 SET "$canary" "$source_project" >/dev/null
[[ "$("${compose[@]}" exec -T novu-redis redis-cli -n 2 --raw GET "$canary" | tr -d '\r')" == "$source_project" ]] || exit 1
# Mongo and the separate Flare Redis remain intact. No FLUSHALL, volume deletion,
# Redis config change, or production credentials are involved.
"${compose[@]}" exec -T novu-redis redis-cli -n 2 FLUSHDB SYNC
[[ "$("${compose[@]}" exec -T novu-redis redis-cli -n 2 DBSIZE | tr -d '\r')" == 0 ]] || exit 1
stage=resume-native
"${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 novu-api novu-worker novu-ws
restore_needed=false
[[ "$("${compose[@]}" exec -T novu-redis redis-cli -n 2 EXISTS "$canary" | tr -d '\r')" == 0 ]] || exit 1
stage=observe-beyond-deadline
"${compose[@]}" exec -T flare-api node scripts/acceptance/crash-recovery.mjs verify
stage=explicit-cancellation
"${compose[@]}" exec -T flare-api node scripts/acceptance/crash-recovery.mjs cancel
