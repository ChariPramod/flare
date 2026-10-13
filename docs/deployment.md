# Deployment, upgrades and recovery

## Installation

Use the pinned images and MinIO source commits in Compose; do not substitute `latest`. Install Docker with Compose v2, Node 22 and pnpm 10.32.1. Run `make setup` once in a new checkout; it refuses to overwrite existing secrets. Keep `.env`, `ops/certs`, and `ops/postal/config` outside Git and in the deployment secret store. Setup records the host UID/GID for the relay so its private bind-mounted TLS key remains readable without making it world-readable. For an existing installation set `FLARE_UID` and `FLARE_GID` to the private key owner's numeric IDs, or supply a secret mount readable by the configured service user.

Set strong independent Flare and Novu encryption/signing secrets, database passwords, object-store credentials, owner credentials and metrics token. Set browser/API/tracking URLs to their actual HTTPS origins. Configure only known ingress addresses in `TRUST_PROXY`. Terminate public HTTPS at your authenticated ingress; internal administration and database ports must stay private. The generated TLS certificate is for local development. Replace it with a certificate for the relay hostname and install its trust chain in Novu before sending production mail.

Run `make up`, inspect health with `docker compose ps`, then `make seed`. Create the Novu organization and copy each environment's own API key into Flare Settings. Keep Development and Production credentials separate. Re-run the non-destructive seed after configuring Novu to create its demo subscriber/workflow. Provision Postal or SES according to [email setup](email-pipeline.md), and receiving routes according to [inbound setup](inbound.md). Add the actual DNS records shown in Domains and wait for verified status. Do not manually mark domains verified.

The local MinIO images are built from pinned official source commits, including the upstream October 2025 security patch. Preserve the corresponding source/license obligations in your distribution. Validate the object-store backup and upgrade process against your deployed version. Compose is a single-host baseline; redundant databases, external object storage, resource limits and a tested failover plan are deployment decisions, not implied by a green local test.

## Upgrade procedure

1. Record the running Git commit, Compose image digests, migration list and provider configuration. Verify the new checkpoint's CI evidence and outstanding external checks.
2. Take and verify an encrypted consistent backup as described below. Announce a maintenance window; stop new ingress submissions, then stop Flare workers/relay/API and Novu/Postal workers so snapshots do not race external sends.
3. Check out the reviewed release. Preserve the existing secrets; never rerun setup over them. Build images, start database dependencies, then run `docker compose run --rm flare-migrate`. The migration runner uses an advisory transaction lock and hashes applied files. Never edit an applied migration or delete its ledger entry to bypass a mismatch.
4. Start the stack and inspect `/ready`, queue backlog, database migrations and provider connectivity. Run tenant-isolated smoke sends with fresh idempotency keys, confirm MIME and provider delivery separately, then reopen ingress. Test publication in Development before promoting selected resources.
5. If schema changes were applied, do not assume an older binary can use the new database. Roll forward with a repair or restore the entire consistent backup into an isolated replacement deployment. Reconcile accepted/ambiguous operations before enabling delivery; a database rollback alone can resend already accepted provider work.

## Backup and restore

Back up PostgreSQL (`pg_dump -Fc` for the Flare database), Novu MongoDB (consistent `mongodump`, including its database), Postal MariaDB (transactionally consistent dump), all MinIO buckets and object metadata, and each Redis AOF/volume when queues are quiescent. Store versioned snapshots under one backup ID with a manifest of timestamps, Git/image versions, migration hashes and object counts. Encrypt backups and retain the encryption keys separately with access recovery procedures. Database ciphertext is unusable without the exact Flare/Novu keys; TLS/DKIM/Postal signing secrets must be included in the protected secret backup.

For a consistent single-host backup, close ingress, stop producers and consumers, wait for active work to settle, then dump/copy all stores. An in-flight timeout is ambiguous even if a process stopped cleanly; preserve its record for provider reconciliation. Snapshot volumes using your storage driver's supported procedure rather than copying live database files. Never run `docker compose down -v` on a deployment you intend to retain.

Restore into an isolated network/project with delivery egress disabled. Restore secrets and all stores from the same manifest, then restore database permissions and object ownership. Validate migrations, tenant counts, representative inbound attachments and signed outgoing MIME. Restore Redis if available; otherwise Flare's database pollers reconstruct supported work after startup. Novu/Postal have separate queue semantics: restore their own consistent stores and follow the pinned providers' recovery procedures. Inspect ambiguous sends and provider IDs before allowing any external egress. Complete a controlled delivery, inbound, preference and publication smoke test before switching traffic. Record restore time and observed data loss against your recovery objectives; no recovery-time objective is certified until this drill passes.

## Troubleshooting

| Symptom                          | First checks                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GitHub shows 404                 | Sign in as a repository collaborator; Flare is private                                                            |
| Dashboard cannot log in          | `/ready`, API proxy URL, seeded owner, auth rate limit and HTTPS cookie/origin settings                           |
| API 429 or 503                   | Rate-limit headers; Redis availability. Do not bypass fail-closed limiting                                        |
| SMTP authentication or TLS fails | Relay key scope/revocation, private-key file ownership, certificate hostname/trust chain; AUTH requires STARTTLS  |
| Domain stays pending             | Required DNS records, selected resolver, TXT chunk parsing, DKIM value and MX target; poll backoff is intentional |
| Workflow cannot reach Novu       | Environment API key, pinned engine health, integration credentials and durable run error                          |
| Message sent but not delivered   | `sent` means provider acceptance. Inspect native delivery callbacks/provider records                              |
| Ambiguous operation              | Stop retries; investigate by stable transaction/message ID. Never blind-redrive                                   |
| Pending publication              | Inspect item progress and engine state; use retry/replacement controls after correcting the cause                 |
| Object storage readiness fails   | Bucket initialization, endpoint, region and credentials. A healthy MinIO process alone is insufficient            |
| Migration hash mismatch          | Restore the original applied file and add a new migration; do not rewrite history                                 |

Use [reliability operations](reliability.md) for metrics/traces, dead letters, shutdown and retention. Request logs omit credentials and incoming MIME; still treat provider logs, traces and backup files as confidential. Export sanitized diagnostics with request/operation IDs rather than copying secrets or raw email content into issue trackers.
