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
