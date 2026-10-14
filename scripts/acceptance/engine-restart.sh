#!/usr/bin/env bash
# Kill only the disposable native worker; preserve its Redis AOF volume.
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
canary="acceptance:engine-restart:$source_project"
stage=prepare
restore_needed=false
worker_container=$("${compose[@]}" ps -q novu-worker)
worker_restart_policy=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$worker_container")
[[ "$worker_restart_policy" == unless-stopped ]] || { echo 'Expected native worker restart policy.' >&2; exit 1; }
policy_changed=false
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$policy_changed" == true ]]; then
    docker update --restart "$worker_restart_policy" "$worker_container" >/dev/null || result=1
  fi
  if [[ "$restore_needed" == true ]]; then
    "${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 novu-redis novu-api novu-worker novu-ws || result=1
  fi
  "${compose[@]}" exec -T novu-redis redis-cli -n 2 DEL "$canary" >/dev/null || result=1
  if [[ "$result" -ne 0 ]]; then echo "Native restart acceptance failed during $stage." >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" exec -T flare-api node scripts/acceptance/engine-restart.mjs prepare
stage=kill-worker
restore_needed=true
# Prevent Docker's automatic restart from racing the cancellation assertion.
docker update --restart no "$worker_container" >/dev/null
policy_changed=true
"${compose[@]}" kill --signal SIGKILL novu-worker
[[ "$(docker wait "$worker_container" | tr -d '\r')" == 137 ]] || { echo 'Native worker must exit from SIGKILL.' >&2; exit 1; }
[[ "$(docker inspect -f '{{.State.Running}}' "$worker_container")" == false ]] || exit 1
printf 'Native worker exited 137 after SIGKILL; accepted jobs remain durable.\n'
stage=cancel
"${compose[@]}" exec -T flare-api node scripts/acceptance/engine-restart.mjs cancel
stage=engine-api-outage
"${compose[@]}" stop --timeout 30 novu-api
"${compose[@]}" exec -T flare-api node scripts/acceptance/engine-restart.mjs unavailable
stage=restart-native-redis
[[ "$("${compose[@]}" exec -T novu-redis redis-cli --raw CONFIG GET appendonly | tail -n 1 | tr -d '\r')" == yes ]] || { echo 'Native Redis must use AOF persistence.' >&2; exit 1; }
"${compose[@]}" exec -T novu-redis redis-cli -n 2 SET "$canary" "$source_project" >/dev/null
# A graceful restart validates persisted queue state; it does not simulate data loss.
"${compose[@]}" stop --timeout 30 novu-redis
"${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 90 novu-redis
[[ "$("${compose[@]}" exec -T novu-redis redis-cli -n 2 --raw GET "$canary" | tr -d '\r')" == "$source_project" ]] || { echo 'Native Redis AOF canary was lost.' >&2; exit 1; }
stage=resume-worker
docker update --restart "$worker_restart_policy" "$worker_container" >/dev/null
policy_changed=false
"${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 novu-api novu-worker novu-ws
restore_needed=false
stage=verify
"${compose[@]}" exec -T flare-api node scripts/acceptance/engine-restart.mjs verify
stage=second-worker-restart
restore_needed=true
"${compose[@]}" stop --timeout 30 novu-worker
"${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 novu-worker
restore_needed=false
stage=observe
"${compose[@]}" exec -T flare-api node scripts/acceptance/engine-restart.mjs observe
