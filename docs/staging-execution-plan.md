# From reliability hardening to the first staging pilot

Updated 2026-10-16. This is the execution plan for **Email + Inbox, self-hosted Postal, password/MFA login and controlled Pareto recipients**. The core modules and local Docker acceptance are built. A staging host, owned DNS zone and provider access are still absent. This plan does not authorize purchases or claim real-world delivery.

## Current position

- Automation failure races, wait timing and database connection-loss handling are implemented and verified. The screenshot's instruction to finish that checkpoint is historical.
- The subsequent `c4b9c8d` checkpoint fixes publication failure races, dispatch accounting after lock waits and operator expiry during protected mutations. Local full-stack acceptance and all five CI jobs passed. Evidence is tracked in [progress](../PROGRESS.md).
- The existing staging Compose overlay, Caddy ingress, private relay CA requirements, offline preflight, operator controls, provider setup and local restore rehearsal are reusable. Do not rebuild those modules or turn fixture evidence into a staging sign-off.
- Owner account creation remains with the owner. See the [shopping proposal](staging-shopping-list.md) for dated prices, purchase links and the support message, and the [owner checklist](staging-owner-checklist.md) for the non-secret handoff.

## Ordered checkpoints

| Checkpoint                                      | Work and ownership                                                                                                                                                                                                                    | Required evidence before closing                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Finish the remaining bounded reliability fix | Engineering: reproduce broadcast failure recording racing a later batch; keep rollback and failure/backoff atomic; cover contention, connection loss and cancellation/pause interaction.                                              | Regression fails on old code and passes on fixed code; standard checks, relevant PostgreSQL tests, local acceptance and independent CI.                                                                                                               |
| B. Make public staging checks executable        | Engineering: add a read-only manifest-driven DNS/PTR and HTTPS verifier. Validate the intended IPv4, tracking alias, certificate and public/private route boundaries; preserve unverified SMTP/provider/identity/backup gates.        | Fixture and network-adapter tests pass locally. Actual deployment report remains pending until the owner's real host/domain exist.                                                                                                                    |
| C. Build deployment operations tooling          | Engineering: implement opt-in, maintenance-window backup collection, encryption and isolated restore tooling for a real deployment; add tested alert rules and notification configuration.                                            | Disposable rehearsals show consistent multi-store snapshots, encryption, tamper/wrong-key rejection, failure handling and egress-isolated restore. Alert fixtures fire and recover. A real off-host restore and alert delivery remain separate gates. |
| D. Provision and bootstrap staging              | Owner: accounts, selected product/region/budget, domain, port-25/PTR approval and access. Engineering: private bootstrap, fresh secrets/CA, canonical Compose deployment, migrations/seed, native provider mappings and operator MFA. | Approved handoff complete; internal readiness, service restart and private administration verified on the intended host; no acceptance credentials reused.                                                                                            |
| E. Validate public routing and real providers   | Engineering + owner: external DNS/HTTPS checks, controlled Postal sending/receiving, actual authentication evidence, signed feedback, Inbox and password/MFA flows.                                                                   | Dated, environment-specific observations described below. A green DNS/HTTPS report alone is insufficient.                                                                                                                                             |
| F. Rehearse staging operations                  | Engineering + owner: reboot, alerts, failed-job recovery, encrypted off-host restore, upgrade and uncertain-provider reconciliation.                                                                                                  | Measured recovery/data-loss results, independent access to keys/backups, verified alert delivery and signed-off recovery procedure.                                                                                                                   |
| G. Open a limited pilot                         | Owner approves participants and workflows; engineering observes behavior and handles issues.                                                                                                                                          | All preceding gates closed, designated operator/recovery owner, controlled recipients, sending limits retained and documented pause criteria.                                                                                                         |

A and B passed local verification and all five CI jobs on `0872285`. C is implemented in the current checkpoint: see [encrypted backups and isolated recovery](backup-recovery.md) and [tested alerting](alerting.md); its actual verification result is tracked in [progress](../PROGRESS.md). Disk/inode monitoring, off-host backup freshness and notification receipt require the deployment's real exporters/jobs and owner destination. D–G depend on actual access and observations; they cannot be completed by adding test fixtures.

## A–B: implementation and verification now

1. Fix the broadcast transaction boundary without changing public APIs or introducing a schema migration. A delayed failure must not write over newer work; retry deadlines must start after the failure rather than before lock contention.
2. Add `scripts/staging/verify-public.mjs` and a non-secret manifest example. This command performs no authentication, email submission, configuration changes or cloud operations. It must not follow redirects, send credentials, accept private address resolution or silently ignore untested IPv6 routing.
3. Keep offline preflight and public verification separate: preflight examines private configuration locally; public verification reads only the explicit host/IP manifest and network responses. Neither grants sending approval.
4. Run focused regressions, lint, typecheck, OpenAPI checks, unit tests, evals, build and secret scanning. Run the PostgreSQL concurrency suite and local full-stack acceptance for the reliability change. Update the evidence ledger, commit and push, then record the independent CI result honestly.

## C: operations tooling acceptance contract

Build a deployment-specific utility; do not remove the safety guards from `scripts/acceptance/restore.sh` or point it at staging. The existing helper intentionally supports disposable acceptance projects only.

The backup utility must require an explicit deployment root, reviewed Compose file set and maintenance acknowledgment. Validate the project/service identities before stopping anything. Stop ingress and producers, observe in-flight work, capture PostgreSQL roles/database, Novu MongoDB, Postal databases, both Redis stores, MinIO data/metadata, Caddy certificate state and the necessary private configuration under one versioned manifest. Record Git/image versions and migration hashes. Preserve ambiguous operations; clean shutdown does not prove external rejection. Never delete source volumes.

Encrypt before off-host transfer. Keep encryption/recovery material independently recoverable and outside the backup destination. Use restrictive local permissions, redact output and clean temporary plaintext on both success and failure. Failed collection or upload must not report success or silently re-enable sending. Restore only into a fresh, isolated target with delivery egress disabled; verify store relationships, object bytes, tenant boundaries and decryption before an operator reviews provider identities and permits controlled delivery.

Add alert rules for dependency readiness, durable backlog age, retry exhaustion/dead letters, ambiguous acceptance, sender suspension/readiness staleness, disk pressure and backup age. Use the metrics actually exported by Flare; add missing bounded-cardinality metrics where needed. Test rule firing and resolution with fixtures, then deliver one real test alert to the owner's chosen destination after access exists. Do not add user content, recipient addresses or credentials as metric labels.

## D: owner handoff and private bootstrap

Required handoff: selected provider/product/region and budget; account-specific inbound/outbound TCP-25 approval and PTR control; static IPv4; SSH username and existing private-key **path**; owned/delegated DNS zone and edit method; secret-store and off-host backup custody; owner/ACME contact emails; controlled test mailboxes. Use the form in [the owner checklist](staging-owner-checklist.md). Do not put actual credentials or personal mailbox lists into this public repository.

Use [the staging runbook](staging.md) and its same base/overlay file set on every operation. Keep ingress stopped during private setup. Generate new secrets and internal relay trust, initialize Postal/Novu, run migrations and identity seed, obtain the real operator UUID, configure environment-specific credentials, enable MFA and verify operator step-up. Do not use the generic base-only `make up` recipe for this deployment. Enable public inbound SMTP only through the reviewed Postal override.

Exit gate: internal dependency readiness, expected firewall exposure, private administration, restart behavior and identity/environment mapping all pass on the actual host.

## E: real DNS, Postal and browser evidence

Run public verification from outside the server with the real manifest. Retain the timestamp, source network, deployed commit and sanitized result privately. Confirm the actual A/PTR match, tracking CNAME, HTTPS identities and denied internal routes. Verify port 25 from the appropriate networks separately: a client-side HTTPS probe cannot prove the server can reach recipient MX servers.

Then follow [sender reputation](sender-reputation.md): verify ownership, configure named credentials tied to the actual Postal sending resources, review traffic boundaries and establish genuine sender authentication evidence. Never enable sandbox mode or invent readiness attestations to bypass bootstrap. Use controlled provider probes where needed to obtain the initial receiver evidence before enabling the Flare Production route.

For each controlled send, retain the Flare logical ID, transport/provider ID, receiver outcome and a protected copy of received headers. Check SPF, DKIM, DMARC alignment, return-path behavior and receiving-server evidence. Separate provider acceptance, recipient-server acceptance and inbox placement. Observe actual signed callbacks and one deduplicated outcome; confirm suppression/preferences. Receive a real signed RawMessage and verify envelope recipients, attachment retrieval and HTML isolation. No production complaint needs to be deliberately generated to retest a safeguard already covered with fixtures.

Browser acceptance uses the real HTTPS app: owner login, MFA enrollment/replay/expiry, operator step-up, ordinary-owner denial, a published workflow, email status, received message and Inbox read state. Verify Development and Production credentials independently. Record physical resource separation only where the configured Postal resources actually establish it; labels in Flare are insufficient.

## F–G: recovery and pilot release

Before widening access, restore a complete encrypted **off-host** backup into a clean isolated target with keys recovered independently of the source host. Measure actual duration/data loss. Review uncertain sends before delivery resumes. Exercise alerts, a controlled host reboot, graceful drain, retry exhaustion/redrive eligibility and an upgrade with a tested recovery path. The local 35-second fixture restore is not a recovery target for staging.

Begin with a few Pareto transactional workflows and mailboxes explicitly controlled by participants. Marketing, customer lists, SES, OIDC, SMS and dedicated-IP offerings are outside this first pilot. Keep organization approval, **100 recipients per rolling 24 hours** and **10 recipient attempts per rolling minute** unless the operator records a reasoned change. Preserve the existing first authenticated complaint / 5% hard-bounce threshold across at least 20 recipients and require operator review to resume.

Pause expansion on unexplained duplicates/loss, authentication failures, uncertain provider outcomes, stale readiness, failed backups or unowned alerts. Record observed incidents and fixes before increasing volume. Passing local tests or public DNS checks never automatically opens the pilot.

## Where to add tests and evidence

- `tests/unit/` and package/app `*.test.ts`: deterministic state transitions, probe parsing, timers, permissions and recovery regressions.
- `apps/worker/tests/*.integration.ts`: real PostgreSQL/Redis/MinIO/Mailpit contention, crash and queue-loss behavior through `bash scripts/integration.sh`.
- Existing Playwright contracts and live tests: UI expectations and real login/workflow/domain/Inbox behavior; see [testing](testing.md).
- `tests/python/`: project pytest smoke tests and staging GET probes; use [Python testing](testing-python.md) and preserve explicit staging opt-in.
- Existing eval suites: expected product behavior and safety scenarios; see [evals](evals.md). Do not substitute simulated evals for external provider evidence.
- `PROGRESS.md` and [acceptance](acceptance.md): exact executed command/result, commit and local/CI/external scope. Keep private host manifests, raw MIME, tokens, backup keys and personal addresses outside Git.
