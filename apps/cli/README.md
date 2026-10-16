# Flare CLI

Set `FLARE_API_URL`, `FLARE_API_KEY` and `FLARE_ENVIRONMENT_ID`, then run `flare --help`. Remote APIs require HTTPS. Do not put secrets in command-line arguments or JSON request files.

`flare config save` writes the selected configuration to `~/.config/flare/config.json` with mode 0600; set `FLARE_CONFIG` to choose another path. Environment values override saved values. Config reads reject symlinks, files owned by another user, and group/world permissions. `config show` and all command output redact credentials.

```sh
flare workflow trigger --file trigger.json --idempotency-key order-123
flare email send --file email.json --idempotency-key welcome-123
flare email status MESSAGE_UUID
flare domain verify DOMAIN_UUID
flare publication diff
flare publication publish --file selection.json
flare publication status OPERATION_UUID
flare dead-letters list
flare dead-letters redrive workflow RUN_UUID
```

Use `flare operations` to inspect the API catalog. `flare request METHOD '/v1/resource/{id}' --path '{"id":"..."}' --query '{"page":1}' --file input.json` exposes other SDK operations. `--file -` reads up to 40 MiB of JSON from stdin. The CLI never retries a mutation automatically and preserves supplied idempotency keys. Publishing requires a separately delegated publication key.

Inspect native work without replaying it:

```sh
flare workflow inspect RUN_UUID
flare workflow reconcile --before 2026-10-16T00:00:00Z --max-runs 100 --concurrency 2 --deadline-ms 30000
```

These commands only issue GET requests and print metadata. The reconciliation scan is limited to accepted runs in the selected organization/environment. `--before` filters creation time; age does not prove a job is overdue. Resume inventory pages using `--cursor` and the same `--before` value. The scan is live rather than a frozen snapshot; rerun it to observe state changes. Failed/deadline inspections remain explicit in `data`; inspect those run IDs separately. `complete=false`, `partial`, `stop_reason`, and `next_cursor` identify bounded or unavailable evidence. Native database status never proves Redis queue membership: `queue_presence` stays `unknown` and `replay_allowed` stays `false`. Cancellation eligibility is advisory and never performs cancellation.
