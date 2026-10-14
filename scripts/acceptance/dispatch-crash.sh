#!/usr/bin/env bash
set -euo pipefail
umask 077
acceptance_dir=${1:?Acceptance directory required}
source_project=${2:?Acceptance project required}
case "$acceptance_dir" in /*/flare-acceptance-*) ;; *) echo 'Disposable acceptance directory required.' >&2; exit 1;; esac
[[ "$source_project" =~ ^flare-acceptance-[0-9]+-[0-9]+$ ]] || { echo 'Disposable acceptance project required.' >&2; exit 1; }
node -e 'const fs=require("node:fs");if(!/^FLARE_ACCEPTANCE=true$/m.test(fs.readFileSync(process.argv[1],"utf8")))process.exit(1)' "$acceptance_dir/.env"
compose=(docker compose --project-name "$source_project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/docker-compose.yml" -f "$acceptance_dir/docker-compose.acceptance.yml")
for service in flare-api flare-worker novu-api novu-worker; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" && "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" == "$source_project" ]] || exit 1
done
override="$acceptance_dir/acceptance/dispatch-crash.compose.yml"
marker="$acceptance_dir/acceptance/dispatch-crash-gate.json"
# Pre-create the metadata marker with host ownership; container writes preserve it.
printf '{}' > "$marker"
cat > "$override" <<'YAML'
services:
  flare-worker:
    environment:
      NOVU_API_URL: http://flare-api:4315
YAML
gated=("${compose[@]}" -f "$override")
stage=prepare
restore_needed=false
proxy_started=false
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$restore_needed" == true ]]; then
    "${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 flare-worker || result=1
  fi
  if [[ "$proxy_started" == true ]]; then
    "${compose[@]}" exec -T flare-api node scripts/acceptance/dispatch-crash.mjs proxy-stop || result=1
  fi
  rm -f -- "$override"
  if [[ "$result" -ne 0 ]]; then echo "Dispatcher crash acceptance failed during $stage." >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
wait_marker() {
  node --input-type=module - "$marker" "$1" <<'JS'
import { readFileSync } from 'node:fs';
const end = Date.now() + 90000;
while (Date.now() < end) {
  let marker;
  try { marker = JSON.parse(readFileSync(process.argv[2], 'utf8')); } catch {}
  if (marker?.state === 'failed') throw Error('Acceptance gate failed; no private request data retained');
  if (marker?.state === process.argv[3]) {
    if (marker.state === 'accepted' && Date.now()-marker.startedAt >= 12000) throw Error('Missed dispatcher interruption window');
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
throw Error('Timed out waiting for acceptance gate');
JS
}
restore_needed=true
"${compose[@]}" stop --timeout 40 flare-worker
"${compose[@]}" exec -T flare-api node scripts/acceptance/dispatch-crash.mjs prepare
stage=start-proxy
"${compose[@]}" exec -d -T flare-api node scripts/acceptance/dispatch-crash.mjs proxy
proxy_started=true
wait_marker ready
stage=start-gated-worker
# Do not wait for its healthcheck: the precise fault window is shorter than the
# healthcheck interval. The acceptance gate proves the dispatcher actually ran.
"${gated[@]}" up -d --no-deps --force-recreate flare-worker
worker=$("${gated[@]}" ps -q flare-worker)
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$worker")" == "$source_project" ]] || exit 1
docker update --restart no "$worker" >/dev/null
wait_marker accepted
stage=kill-dispatcher
docker kill --signal SIGKILL "$worker" >/dev/null
[[ "$(docker wait "$worker" | tr -d '\r')" == 137 ]] || exit 1
[[ "$(docker inspect -f '{{.State.Running}}' "$worker")" == false ]] || exit 1
"${compose[@]}" exec -T flare-api node scripts/acceptance/dispatch-crash.mjs interrupted
stage=restore-normal-worker
"${compose[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 120 flare-worker
restore_needed=false
stage=lease-recovery
"${compose[@]}" exec -T flare-api node scripts/acceptance/dispatch-crash.mjs verify
stage=second-worker-restart
restore_needed=true
"${compose[@]}" stop --timeout 40 flare-worker
"${compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 120 flare-worker
restore_needed=false
stage=observe
"${compose[@]}" exec -T flare-api node scripts/acceptance/dispatch-crash.mjs observe
