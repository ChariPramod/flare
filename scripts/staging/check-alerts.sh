#!/usr/bin/env bash
# Validate rule behavior and inert example routing. Never contact a real receiver.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker-path.sh
node scripts/local-docker.mjs
umask 077
alert_fixture=$(mktemp -d "${TMPDIR:-/tmp}/flare-alerts-XXXXXX")
trap 'rm -rf -- "$alert_fixture"' EXIT
printf 'synthetic-metrics-token-for-configuration-validation-only\n' > "$alert_fixture/metrics-token"
# Release versions deliberately pinned; no application deployment is changed.
prometheus_image=prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e
alertmanager_image=prom/alertmanager:v0.34.1@sha256:e9733bafb1bdef9b00e25a21f8f99dc26a22224bf16641ad754d1649f4c3357a
validation=(docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=128m --cap-drop ALL --security-opt no-new-privileges)
"${validation[@]}" --entrypoint /bin/promtool -v "$PWD/ops/alerts:/etc/prometheus:ro" "$prometheus_image" check rules /etc/prometheus/flare.rules.yml
"${validation[@]}" --entrypoint /bin/promtool -v "$PWD/ops/alerts:/etc/prometheus:ro" -v "$alert_fixture/metrics-token:/run/secrets/flare_metrics_token:ro" "$prometheus_image" check config /etc/prometheus/prometheus.example.yml
"${validation[@]}" --entrypoint /bin/promtool -v "$PWD/ops/alerts:/etc/prometheus:ro" -w /etc/prometheus "$prometheus_image" test rules flare.rules.test.yml
"${validation[@]}" --entrypoint /bin/amtool -v "$PWD/ops/alerts:/etc/alertmanager:ro" "$alertmanager_image" check-config /etc/alertmanager/alertmanager.example.yml
printf 'Alert rules, firing/resolution fixtures and inert private routing validated. No notification was sent.\n'
