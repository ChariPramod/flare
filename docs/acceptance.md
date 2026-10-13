# Acceptance and evidence

Run `bash scripts/integration.sh` for real PostgreSQL/Redis/MinIO/Mailpit tests and `bash scripts/acceptance.sh` for the pinned full stack. Both scripts require Docker Compose v2, Node 22 and pnpm 10.32.1. Install Playwright Chromium with `pnpm exec playwright install chromium`. On this Mac, the installed Chrome can be selected with `E2E_BROWSER_CHANNEL=chrome`. Full acceptance needs the loopback ports in Compose to be free and enough memory/disk for Flare, Novu, MongoDB, PostgreSQL, Postal/MariaDB, Redis, and source-built MinIO. No external provider credentials are required for the local simulation.

The full-stack script copies source into a new private temporary directory, generates independent credentials/certificates, starts an isolated Compose project, and removes its containers, volumes and files on exit. It never uses the existing checkout's `.env`, certificates or data volumes. It applies current migrations and separately upgrades a disposable database from the committed `62aaa57` migrations, checking existing workflow content survives. It seeds twice, configures the pinned Novu owner/environments through its real API, and creates Flare integrations. The generated private files and provider logs are not uploaded as CI artifacts.

A private authoritative CoreDNS zone publishes the actual generated DKIM/SPF/MX records. Flare's normal verification poller resolves them through `DOMAIN_DNS_SERVERS`; no test marks domains verified directly. This certifies resolver/parsing/polling behavior against local DNS, not public DNS propagation, provider ownership or email deliverability. The override accepts only operator-configured resolver IPs and must never derive from an API request.

The scenarios exercise real Flare HTTP authentication, real Novu workflow acceptance, locale fallback, pinned content publication/reconciliation, preferences, Novu → SMTP AUTH/STARTTLS → Flare → Mailpit, Bcc hiding, DKIM source, suppression and inbound persistence/retrieval. Postal-shaped inbound callbacks are signed using a locally generated RSA key; those are simulated submissions. Delivery events injected by the test are explicitly tagged `acceptance-simulated-delivery`, not represented as real provider confirmations. Browser tests cover login/workflow, domain/email, inbound sandbox/source download, layout publication and safe dead-letter redrive.

The load stage stops the worker, submits at the default 10 requests/second plus a simultaneous 40-request burst, checks throttling headers and repeated idempotency keys, then deletes only the disposable Redis database and restarts the worker. It requires all accepted logical messages to reach Mailpit with exactly one transport attempt and no duplicate database operation. API/worker RSS is sampled against a configurable `ACCEPTANCE_MEMORY_MAX_BYTES` ceiling (768 MiB default). This is a bounded reproducible smoke load, not a maximum throughput benchmark or production sizing guarantee.

## Completion ledger

Do not call acceptance complete unless every required row has evidence for the candidate commit.

| Check                                   | Evidence required                                         | Current boundary                           |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| lint/types/unit/build/secrets           | checkpoint and CI check job                               | Passing through tooling checkpoint         |
| browser contract tests                  | 11 Playwright flows                                       | Passing through tooling checkpoint         |
| real-service integration                | CI integration job and same script locally                | First startup repaired; rerun pending      |
| pinned full stack                       | CI acceptance job and same script locally                 | Harness added; first execution pending     |
| migration/seed/upgrade                  | acceptance scenario                                       | Pending                                    |
| load/queue-loss recovery                | acceptance scenario                                       | Pending                                    |
| public DNS and DKIM delivery            | controlled external sending/receiving domain              | Credentials/infrastructure pending         |
| Postal routing/native delivery callback | real Postal server/domain routing                         | Pending; signed fixtures do not substitute |
| SES/SNS and SMS                         | verified identity/topic/provider account                  | Pending                                    |
| OIDC/MFA provider login                 | actual configured issuer                                  | Pending                                    |
| backup restore drill                    | isolated restore plus application/provider reconciliation | Pending                                    |

Docker is unavailable on the current Mac. CI can proceed independently; its results do not waive the requested local container run. Production automation promotion is still an implementation gap, tracked in PROGRESS.md.
