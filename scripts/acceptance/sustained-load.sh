#!/usr/bin/env bash
# Sustained admission continues while only the disposable Flare worker is paused.
set -euo pipefail
umask 077
acceptance_dir=${1:?Acceptance directory required}
source_project=${2:?Acceptance project required}
case "$acceptance_dir" in /*/flare-acceptance-*) ;; *) echo 'Disposable acceptance directory required.' >&2; exit 1;; esac
[[ "$source_project" =~ ^flare-acceptance-[0-9]+-[0-9]+$ ]] || { echo 'Disposable acceptance project required.' >&2; exit 1; }
node -e 'const fs=require("node:fs");if(!/^FLARE_ACCEPTANCE=true$/m.test(fs.readFileSync(process.argv[1],"utf8")))process.exit(1)' "$acceptance_dir/.env"
seconds=$(node --input-type=module -e 'import {loadConfig} from "./scripts/acceptance/sustained-load-helpers.mjs"; console.log(loadConfig().seconds)')
node scripts/local-docker.mjs
compose=(docker compose --project-name "$source_project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/docker-compose.yml" -f "$acceptance_dir/docker-compose.acceptance.yml")
for service in flare-api flare-worker; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" && "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" == "$source_project" ]] || exit 1
done
marker="$acceptance_dir/acceptance/sustained-load-phase.json"
ready="$acceptance_dir/acceptance/sustained-load-started.json"
[[ ! -e "$ready" ]] || { echo 'Sustained workload requires a fresh acceptance fixture.' >&2; exit 1; }
write_phase() { printf '{"phase":"%s"}\n' "$1" > "$marker.tmp"; mv "$marker.tmp" "$marker"; }
worker_paused=false
load_pid=''
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$load_pid" ]] && kill -0 "$load_pid" 2>/dev/null; then
    # A failed orchestration terminates only this exec's load process in its container.
    "${compose[@]}" exec -T flare-api node -e 'const fs=require("node:fs");try{const p=JSON.parse(fs.readFileSync("/acceptance/sustained-load-pid.json","utf8")).pid;if(Number.isInteger(p)&&p>1)process.kill(p,"SIGTERM")}catch{}' || result=1
    wait "$load_pid" || true
  fi
  if [[ "$worker_paused" == true ]]; then
    "${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 flare-worker || result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
write_phase running
"${compose[@]}" exec -T -e "ACCEPTANCE_SOAK_SECONDS=$seconds" -e "ACCEPTANCE_MEMORY_MAX_BYTES=${ACCEPTANCE_MEMORY_MAX_BYTES:-805306368}" -e "ACCEPTANCE_SOAK_P95_MS=${ACCEPTANCE_SOAK_P95_MS:-5000}" flare-api node scripts/acceptance/sustained-load.mjs &
load_pid=$!
for ((i=0; i<90; i++)); do
  [[ -e "$ready" ]] && break
  kill -0 "$load_pid" 2>/dev/null || { wait "$load_pid"; exit 1; }
  sleep 1
done
[[ -e "$ready" ]] || { echo 'Sustained load failed to start in 90 seconds.' >&2; exit 1; }
sleep "$((seconds / 3))"
kill -0 "$load_pid" 2>/dev/null || { wait "$load_pid"; exit 1; }
write_phase paused
worker_paused=true
"${compose[@]}" stop --timeout 40 flare-worker
worker_container=$("${compose[@]}" ps --all -q flare-worker)
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$worker_container")" == 0 ]] || { echo 'Sustained load worker did not exit gracefully.' >&2; exit 1; }
printf 'Sustained workload: worker stopped cleanly; accepting fresh operations for 20 seconds.\n'
sleep 20
"${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 flare-worker
worker_paused=false
write_phase resumed
wait "$load_pid"
load_pid=''
printf 'Sustained workload: worker pause/restart and independent receipt verification passed.\n'
