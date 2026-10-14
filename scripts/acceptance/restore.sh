#!/usr/bin/env bash
# Called last by acceptance.sh. Never accepts an ordinary deployment/project.
set -euo pipefail
umask 077
acceptance_dir=${1:?Acceptance directory required}
source_project=${2:?Acceptance project required}
case "$acceptance_dir" in /*/flare-acceptance-*) ;; *) echo 'Disposable acceptance directory required.' >&2; exit 1;; esac
[[ "$source_project" =~ ^flare-acceptance-[0-9]+-[0-9]+$ ]] || { echo 'Disposable acceptance project required.' >&2; exit 1; }
node -e 'const fs=require("node:fs");if(!/^FLARE_ACCEPTANCE=true$/m.test(fs.readFileSync(process.argv[1],"utf8")))process.exit(1)' "$acceptance_dir/.env"
source_compose=(docker compose --project-name "$source_project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/docker-compose.yml" -f "$acceptance_dir/docker-compose.acceptance.yml")
source_api=$("${source_compose[@]}" ps -q flare-api)
[[ -n "$source_api" && "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$source_api")" == "$source_project" ]] || exit 1
api_image=$(docker inspect -f '{{.Image}}' "$source_api")
restore_project="${source_project}-restore"
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$restore_project")" ]] || { echo 'Restore project already exists; refusing reuse.' >&2; exit 1; }
restore_dir=$(mktemp -d "$acceptance_dir/restore-XXXXXX")
restore_compose=(docker compose --project-name "$restore_project" --project-directory "$acceptance_dir" --env-file "$acceptance_dir/.env" -f "$acceptance_dir/scripts/acceptance/restore-compose.yml")
stage=initialization
cleanup_restore() {
  result=$?
  trap - EXIT
  "${restore_compose[@]}" down -v --remove-orphans >>"$restore_dir/operations.log" 2>&1 || result=1
  # Database snapshots, generated credentials and MIME stay private and are never uploaded/logged.
  rm -rf -- "$restore_dir"
  if [[ "$result" -ne 0 ]]; then echo "Isolated restore drill failed during $stage; private store dumps were removed." >&2; fi
  exit "$result"
}
trap cleanup_restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
started=$SECONDS
echo 'Restore drill: quiescing disposable producers and capturing consistent stores.'
stage=quiesce
"${source_compose[@]}" stop flare-web flare-api flare-worker flare-smtp-relay novu-api novu-worker novu-ws novu-dashboard postal postal-worker postal-smtp >>"$restore_dir/operations.log" 2>&1

mongo_export() {
  "$@" exec -T novu-mongodb sh -ec 'mongosh --quiet --username root --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --file /tmp/restore-mongo.js'
}
postal_dump() {
  "$@" exec -T postal-mariadb sh -ec '
    export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"
    databases=$(mariadb -uroot -N -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('"'"'mysql'"'"','"'"'information_schema'"'"','"'"'performance_schema'"'"','"'"'sys'"'"') ORDER BY SCHEMA_NAME")
    test -n "$databases"
    for database in $databases; do case "$database" in *[!a-zA-Z0-9_-]*) exit 1;; esac; done
    mariadb-dump -uroot --single-transaction --routines --events --triggers --hex-blob --skip-comments --skip-dump-date --order-by-primary --complete-insert --databases $databases
  '
}
stage=source-manifest
docker cp "$acceptance_dir/scripts/acceptance/restore-mongo.js" "$("${source_compose[@]}" ps -q novu-mongodb):/tmp/restore-mongo.js" >>"$restore_dir/operations.log" 2>&1
mongo_export "${source_compose[@]}" >"$restore_dir/mongo-capture.json" 2>>"$restore_dir/operations.log"
docker run --rm --network "${source_project}_default" --env-file "$acceptance_dir/.env" -v "$restore_dir:/restore" --user root --entrypoint node "$api_image" scripts/acceptance/restore-manifest.mjs capture >>"$restore_dir/operations.log" 2>&1

stage=postgres-backup
"${source_compose[@]}" exec -T postgres pg_dumpall -U flare --roles-only >"$restore_dir/roles.sql" 2>>"$restore_dir/operations.log"
"${source_compose[@]}" exec -T postgres pg_dump -U flare -d flare -Fc >"$restore_dir/flare.dump" 2>>"$restore_dir/operations.log"
stage=mongo-backup
"${source_compose[@]}" exec -T novu-mongodb sh -ec 'mongodump --username root --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db novu --archive --gzip' >"$restore_dir/novu.archive" 2>>"$restore_dir/operations.log"
stage=postal-backup
postal_dump "${source_compose[@]}" >"$restore_dir/postal.sql" 2>>"$restore_dir/operations.log"
[[ -s "$restore_dir/postal.sql" ]] || exit 1
stage=redis-backup
for service in redis novu-redis; do
  # Non-expiring canaries exercise each native queue database while real queue keys are snapshotted too.
  "${source_compose[@]}" exec -T "$service" redis-cli -n 0 SET acceptance:restore "$source_project/$service/0" > /dev/null
  "${source_compose[@]}" exec -T "$service" redis-cli -n 2 SET acceptance:restore "$source_project/$service/2" > /dev/null
  "${source_compose[@]}" exec -T "$service" redis-cli SAVE > /dev/null
  docker cp "$("${source_compose[@]}" ps -q "$service"):/data/dump.rdb" "$restore_dir/$service.rdb" >>"$restore_dir/operations.log" 2>&1
done
stage=minio-backup
minio_source=$("${source_compose[@]}" ps -q minio)
"${source_compose[@]}" stop minio >>"$restore_dir/operations.log" 2>&1
docker run --rm --network none --volumes-from "$minio_source:ro" --entrypoint tar postgres:17.7-alpine -C /data -cf - . >"$restore_dir/minio.tar" 2>>"$restore_dir/operations.log"
# Reclaim source database memory before starting the replacement stores on smaller runners.
"${source_compose[@]}" stop postgres novu-mongodb postal-mariadb redis novu-redis >>"$restore_dir/operations.log" 2>&1

stage=isolated-store-creation
"${restore_compose[@]}" create >>"$restore_dir/operations.log" 2>&1
[[ "$(docker network inspect -f '{{.Internal}}' "${restore_project}_default")" == true ]] || exit 1
minio_target=$("${restore_compose[@]}" ps -aq minio)
docker run --rm -i --network none --volumes-from "$minio_target" --entrypoint tar postgres:17.7-alpine -C /data -xf - <"$restore_dir/minio.tar" >>"$restore_dir/operations.log" 2>&1
for service in redis novu-redis; do
  docker cp "$restore_dir/$service.rdb" "$("${restore_compose[@]}" ps -aq "$service"):/data/dump.rdb" >>"$restore_dir/operations.log" 2>&1
  printf 'appendonly no\nmaxmemory-policy noeviction\n' >"$restore_dir/$service.conf"
  docker cp "$restore_dir/$service.conf" "$("${restore_compose[@]}" ps -aq "$service"):/data/redis.conf" >>"$restore_dir/operations.log" 2>&1
done
"${restore_compose[@]}" up -d --wait --wait-timeout 180 >>"$restore_dir/operations.log" 2>&1
stage=postgres-restore
"${restore_compose[@]}" exec -T postgres psql -U flare_restore_root -d flare -v ON_ERROR_STOP=1 <"$restore_dir/roles.sql" >>"$restore_dir/operations.log" 2>&1
"${restore_compose[@]}" exec -T postgres pg_restore -U flare_restore_root -d flare --exit-on-error <"$restore_dir/flare.dump" >>"$restore_dir/operations.log" 2>&1
stage=mongo-restore
"${restore_compose[@]}" exec -T novu-mongodb sh -ec 'mongorestore --username root --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --stopOnError' <"$restore_dir/novu.archive" >>"$restore_dir/operations.log" 2>&1
stage=postal-restore
"${restore_compose[@]}" exec -T postal-mariadb sh -ec 'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb -uroot' <"$restore_dir/postal.sql" >>"$restore_dir/operations.log" 2>&1

stage=store-verification
docker cp "$acceptance_dir/scripts/acceptance/restore-mongo.js" "$("${restore_compose[@]}" ps -q novu-mongodb):/tmp/restore-mongo.js" >>"$restore_dir/operations.log" 2>&1
mongo_export "${restore_compose[@]}" >"$restore_dir/mongo-verify.json" 2>>"$restore_dir/operations.log"
cmp -s "$restore_dir/mongo-capture.json" "$restore_dir/mongo-verify.json"
postal_dump "${restore_compose[@]}" >"$restore_dir/postal-verify.sql" 2>>"$restore_dir/operations.log"
cmp -s "$restore_dir/postal.sql" "$restore_dir/postal-verify.sql"
for service in redis novu-redis; do
  for db in 0 2; do
    [[ "$("${restore_compose[@]}" exec -T "$service" redis-cli -n "$db" GET acceptance:restore)" == "$source_project/$service/$db" ]] || exit 1
  done
  stage=redis-aof-conversion
  [[ "$("${restore_compose[@]}" exec -T "$service" redis-cli CONFIG SET appendonly yes)" == OK ]] || exit 1
  [[ "$("${restore_compose[@]}" exec -T "$service" redis-cli CONFIG REWRITE)" == OK ]] || exit 1
  deadline=$((SECONDS+60))
  while true; do
    persistence=$("${restore_compose[@]}" exec -T "$service" redis-cli INFO persistence | tr -d '\r')
    if [[ "$persistence" == *$'aof_enabled:1\n'* && "$persistence" == *$'aof_rewrite_in_progress:0\n'* && "$persistence" == *$'aof_rewrite_scheduled:0\n'* && "$persistence" == *$'aof_last_bgrewrite_status:ok\n'* ]]; then break; fi
    [[ "$SECONDS" -lt "$deadline" ]] || exit 1
    sleep 1
  done
done
"${restore_compose[@]}" restart redis novu-redis >>"$restore_dir/operations.log" 2>&1
"${restore_compose[@]}" up -d --no-deps --no-recreate --wait --wait-timeout 60 redis novu-redis >>"$restore_dir/operations.log" 2>&1
stage=redis-aof-restart-verification
for service in redis novu-redis; do
  [[ "$("${restore_compose[@]}" exec -T "$service" redis-cli --raw CONFIG GET appendonly)" == $'appendonly\nyes' ]] || exit 1
  for db in 0 2; do
    [[ "$("${restore_compose[@]}" exec -T "$service" redis-cli -n "$db" GET acceptance:restore)" == "$source_project/$service/$db" ]] || exit 1
  done
done
stage=application-data-verification
docker run --rm --network "${restore_project}_default" --env-file "$acceptance_dir/.env" -v "$restore_dir:/restore:ro" --user root --entrypoint node "$api_image" scripts/acceptance/restore-manifest.mjs verify >>"$restore_dir/operations.log" 2>&1
printf 'Isolated restore drill passed in %ss: PostgreSQL/RLS/secrets, MongoDB/workflow mappings, Postal, both Redis stores, MinIO bytes/metadata.\n' "$((SECONDS-started))"
