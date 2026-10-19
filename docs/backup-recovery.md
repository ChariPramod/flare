# Encrypted deployment backups and isolated recovery

The deployment utility is `scripts/operations/backup.mjs`. It takes **cold snapshots** after an explicit maintenance stop and restores only the six backing stores on a new internal Docker network. It does not resume the source, start Flare/Novu/Postal delivery, upload a backup, or approve recovered sending. Use [the staging plan](staging-execution-plan.md) to track real off-host recovery separately from local acceptance.

## Scope and prerequisites

- Run on the deployment host with Node 22, a local Linux Docker engine and Compose. Remote Docker endpoints are refused. Docker access is privileged host access; restrict this tool and the backup key to the recovery operator.
- Supply the canonical absolute deployment path, actual Compose project name and its reviewed profile from the table below. The guarded `acceptance` profile is only for the generated disposable fixture. Arbitrary Compose overlays, external storage drivers, renamed volumes and unreviewed mounts are refused.
- Recovery requires the **exact source store images and architecture** already present locally. Preserve those images independently, including locally built MinIO, and record the deployment's release/dirty-tree status. A cold database volume is not a cross-version upgrade format. Use the [upgrade procedure](deployment.md#upgrade-procedure) for migrations.
- Source containers must match the project's working directory, ordered Compose files, declared environments and volume identities. A saved `.env` that differs from loaded credentials/encryption keys is refused. Reconcile drift before maintenance; never edit a key merely to make the check pass.
- Store commands and configuration keys must retain the reviewed data locations. Custom entrypoints, relocated database directories and arbitrary store environment variables are refused rather than silently omitted from a snapshot. Docker Desktop's VM bind-path prefix is recognized only when it resolves to the exact declared source, destination and access mode.
- Reserve private local disk for the encrypted bundle and temporary plaintext. Backup processes one volume at a time; restore authenticates all artifacts into private scratch before creating any target resource. Capacity planning must include the whole decrypted bundle and target volumes. Filesystems must provide sufficient disk and inode headroom. Neither a timeout nor successful encryption certifies available off-host storage.

Seven base volumes are captured: PostgreSQL, Flare Redis, MinIO, Postal MariaDB, Postal's private runtime configuration, Novu MongoDB and Novu Redis. Staging adds both Caddy certificate/configuration volumes. The encrypted configuration includes `.env`, the exact Compose file set, `ops/certs`, `ops/postal/config`, and staging's Caddyfile. The encrypted manifest binds store image identities, migration hashes and artifact checksums. DNS, hosting firewall/PTR settings, cloud accounts, off-host storage and independently managed external resources are outside the bundle.

| Profile                     | Compose files, in exact order                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `local`                     | `docker-compose.yml`                                                                                                         |
| `staging`                   | `docker-compose.yml`, `docker-compose.staging.yml`                                                                           |
| `staging-inbound`           | `docker-compose.yml`, `docker-compose.staging.yml`, `ops/staging/postal-inbound.yml`                                         |
| `staging-split-web`         | `docker-compose.yml`, `docker-compose.staging.yml`, `docker-compose.staging-split-web.yml`                                   |
| `staging-split-web-inbound` | `docker-compose.yml`, `docker-compose.staging.yml`, `docker-compose.staging-split-web.yml`, `ops/staging/postal-inbound.yml` |

Split-web profiles require `STAGING_WEB_MODE=vercel` and a valid dedicated `FLARE_DASHBOARD_PROXY_SECRET` in the backend's private `.env`. The API’s loaded forwarding key must match that file. API and ingress containers must exist, although they can be stopped; ingress must mount the exact read-only `ops/staging/Caddyfile.split-web`. Both the split and original Caddyfiles are captured with the ordered overlays, preserving the configuration needed to review a self-hosted rollback. The same nine staging volumes are retained and only the same six stores start during isolated recovery.

The backend forwarding secret is encrypted inside the backup. **Vercel project configuration is separate custody:** retain access to the owning account/project, custom-domain settings, deployment/release identity, build settings, exact `WEB_ORIGIN` and `FLARE_API_URL`, preview isolation policy, and the matching server-only forwarding key in the approved secret manager. A restored backend does not restore or update Vercel. Before reconnecting it, reconcile both origins and the key on both sides; the protocol supports one active key, so coordinate rotation during a maintenance window. Do not enable a preview against the restored production data or start archived application definitions as a recovery shortcut.

The pinned standalone Mongo image also creates an anonymous `/data/configdb` mount. The utility permits only that known local mount and verifies it is empty after shutdown; nonempty contents refuse the backup. No nonempty database state is silently omitted.

## Key custody and preparation

Generate an independent cryptographically random **32-byte binary** key through the approved secret-management process. The existing key file must be owned by the invoking user, readable only by that user (normally `0600`), and outside the source, backup and restore directories. Keep a separately recoverable protected copy outside the source host. Do not reuse `FLARE_ENCRYPTION_KEY`, pass key bytes on the command line, put them in environment variables, or commit keys/backups to this public repository.

The CLI never generates a recovery key for you. Test retrieving the key independently before relying on an off-host bundle. Loss of this key makes the authenticated encrypted bundle unrecoverable; loss of the original application keys makes database ciphertext unusable even when the backup can be decrypted.

Before stopping anything, announce the maintenance window, identify the source and decide how to handle submissions during downtime. Arrange an explicitly bounded [alert silence](alerting.md) with an owner; the utility does not silence alerts. Stop unrelated writers and automation operating on the deployment. Retain the current release and exact image artifacts outside the host.

These examples use placeholder paths and project names. Replace them with reviewed canonical paths; do not run setup or overwrite existing secrets:

```sh
node scripts/operations/backup.mjs plan \
  --root /srv/flare --project flare-staging --profile staging

node scripts/operations/backup.mjs backup \
  --root /srv/flare --project flare-staging --profile staging \
  --output /srv/private-backups/flare-2026-10-16 \
  --key-file /srv/recovery-keys/flare-backup.key --maintenance
```

Use `--profile staging-inbound` when the receiving override is part of the deployed file set. The destination must not already exist. The backup command validates identity/configuration, stops the reviewed project with a graceful deadline, verifies clean store shutdown and collects cold volume archives. Foreign writers, forced store termination, malformed archives or configuration changes cause failure. An authenticated success is reported only after the encrypted manifest is complete. **Once stopped, the source is never automatically restarted.** Preflight failures leave its prior state intact; an interrupted stop can leave a partially stopped project. Inspect maintenance state and unresolved provider acceptance before any manual resume using the same canonical Compose file set.

For a Vercel dashboard use `--profile staging-split-web`, or `--profile staging-split-web-inbound` when receiving is enabled. These profiles must match the exact file order recorded on the source containers; they cannot be substituted for an existing all-Compose deployment merely by choosing another CLI flag.

The bundle consists of `manifest.enc` and encrypted artifacts under `artifacts/`. AES-256-GCM uses an independent random nonce for each file and authenticates the artifact name. The manifest is encrypted too; it can contain private runtime configuration. Only fixed, redacted results belong in logs. Do not print Docker environment inspection, decrypted manifests, raw MIME or private restore errors into tickets or CI artifacts.

## Off-host transfer and retention

The current CLI creates a local encrypted bundle; it performs **no off-host upload, retention deletion or remote success check**. Transfer the complete closed bundle to approved private storage with separate, least-privilege credentials. Keep the key under independent custody. Verify download and authenticated restoration from that storage before calling a backup recoverable. An object upload acknowledgment alone is insufficient.

Choose a measured recovery-point objective, schedule, retention policy and alert owner before the pilot. Monitor last verified **off-host** backup age and free disk/inodes through the deployment's real exporter/job evidence; these signals are not fabricated by Flare. Do not delete the last verified recovery point automatically. Provider-side accepted work can outlive any database snapshot, so retained backups do not authorize blind replay.

## Restore without delivery

Use a new canonical directory and a fresh explicit Docker project. Existing target paths/resources are refused, never overwritten. Stage the exact source image IDs locally without changing their versions, then run:

```sh
node scripts/operations/backup.mjs restore \
  --archive /srv/private-backups/flare-2026-10-16 \
  --key-file /srv/recovery-keys/flare-backup.key \
  --target-root /srv/recovery/flare-2026-10-16 \
  --target-project flare-recovery-20261016 --isolated
```

Every manifest/artifact is authenticated, checksummed and structurally validated **before target directories or Docker resources are created**. Wrong keys, tampering, unexpected files and unsafe archive entries fail closed. The utility generates its own store-only Compose file; it never executes archived Compose definitions. Restored stores have no published ports and use one `internal: true` network. Restored Caddy and Postal configuration volumes remain inactive. The result reports the new root, Compose file, private configuration path, volumes and network.

An isolated restore result means resources were created under the enforced boundary; it is not an application-data or delivery sign-off. Validate store readiness, migration ledger, roles/RLS, tenant isolation, database relationships, private-key decryption, object bytes/metadata, native workflow mappings and Redis state. Record measured time/data loss. Recovering the application requires a separately reviewed deployment using these resources and original keys; do not execute the archived Compose files or start all producers as a shortcut.

Reconcile provider identities and every ambiguous send against actual provider/receiver evidence before delivery can resume. Review scheduled/held work, suppression, preferences and operator approval. No restoration operation can recall mail accepted before failure. Keep source and recovered producers mutually exclusive. Approve a controlled internal send/receive/Inbox/MFA test before reopening ingress or expanding the pilot.

Failures after target creation retain the new target for inspection and attempt to stop created stores. The utility never deletes source volumes or automatically restarts source services. Private temporary plaintext and incomplete local bundles are removed on handled failures. A forced process/host kill can prevent cleanup: inspect restricted temporary directories and incomplete targets with the recovery owner; filesystem deletion is not a promise of cryptographic erasure. Do not issue broad `docker system prune`, project deletion, or `down -v` against the source.

## Executed evidence

The full-stack acceptance runner exercises this CLI through `scripts/acceptance/operations-backup.mjs`, after the separate logical restore rehearsal. It captures populated fixture fingerprints, runs a cold encrypted backup, checks wrong-key/tamper rejection before resource creation, restores fresh isolated stores and compares PostgreSQL policies/data/decryption, MongoDB/workflow mappings, Postal databases/private configuration, Redis AOF canaries and MinIO objects. It verifies the source remains stopped and removes only its owned disposable target. See [the acceptance ledger](acceptance.md) and [progress](../PROGRESS.md) for actual pass/failure results.

The split-profile extension then stops that owned restored target, retains its populated volumes and creates stopped containers using the exact split-web-inbound profile. It checks ordered-profile recognition, the loaded forwarding key, both Caddy assets and canary bytes in the Caddy volumes, then repeats encrypted backup and six-store isolated restoration. It never starts ingress, ACME, the API or delivery services. This rehearses split-profile preservation; it does not establish public certificate recovery, Vercel configuration restoration or an executed deployment rollback. Its actual run status is recorded in the acceptance ledger.

This local/CI fixture is not proof of off-host key custody, host loss recovery, real Postal sending-resource isolation, public DNS or safe replay of provider work. Those remain measured staging gates.
