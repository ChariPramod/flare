# Flare

Pareto Labs' self-hosted notification control plane. TypeScript, NestJS, Next.js, PostgreSQL, Redis and unmodified Novu community 3.19.0. Postal is the default email transport.

## Development

Use Node **22**, pnpm **10.32.1**, Docker Engine with Compose v2, OpenSSL and gitleaks **8.30.1**. Allocate at least 12 GB RAM to the full stack. The current implementation and verification status is recorded in [PROGRESS.md](PROGRESS.md); this repository is under active construction.

```sh
corepack enable
pnpm install --frozen-lockfile
node scripts/setup.mjs --dev # random local secrets, Mailpit transport
make up
make seed
```

For Postal transport omit `--dev`. `.env` and generated keys are gitignored. Setup refuses to replace an existing `.env`. Development credentials are generated into `.env`, never embedded in source. Dashboard: http://localhost:3000. API/OpenAPI: http://localhost:4000/docs. Mailpit: http://localhost:8025. MinIO console: http://localhost:9001. Postal admin: http://localhost:5000.

The stock Novu dashboard is internal-only. Novu bootstrap credentials must be provisioned and the Development/Production service keys configured separately; Flare never exposes them to API-key callers. All published Compose ports bind loopback. Use a TLS reverse proxy and authenticated administrative access in deployment. STARTTLS certificates created by setup are for development only.

## Checks and checkpoints

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
bash scripts/checkpoint.sh scaffold
```

The checkpoint script fails when gitleaks is missing. Update PROGRESS.md and CHANGELOG.md after each coherent phase, run the checkpoint, commit once with a Conventional Commit scope, and push main. Never force push. `scripts/autopush.sh` only pushes an existing clean main branch and never creates commits. An optional developer-owned cron entry is `0 * * * * cd /absolute/path/to/flare && bash scripts/autopush.sh`; no cron is installed by this repository.

## Architecture

`apps/api` serves the Flare control plane; `apps/worker` handles queued work; `apps/smtp-relay` accepts authenticated workflow mail; `apps/web` is the single dashboard. Shared contracts live in `packages/shared`, with Drizzle and committed SQL migrations in `packages/db`. Migration checksums detect edited history and an advisory lock serializes migration runners.

See [the architecture decision](docs/adr/0001-wrap-novu.md) and [Novu compatibility notes](docs/novu-gaps.md). PostgreSQL and Redis ports are private to the Compose network. Redis AOF is enabled for Flare and Novu. Postal runs its web, worker and SMTP processes with MariaDB; MinIO stores attachments and inbound MIME. Each service has a health endpoint and dependency readiness checks where available.

## Postal and SES

Create a Postal admin with `docker compose run --rm postal postal make-user`, then create the organization/server, sender domain and API credential. Put that credential in `POSTAL_API_KEY`. Configure the sending IP's PTR/rDNS, SPF include, DKIM TXT, return-path MX and receiving MX; follow [Postal DNS configuration](https://docs.postalserver.io/getting-started/dns-configuration/). Outbound port 25 and IP reputation are deployment prerequisites. DNS verification and an approved provider sender are separate requirements.

For SES, configure `AWS_REGION`, credentials with minimal send permissions, and an SES configuration set with event publishing. Verify identities in that region and obtain production access if the account is sandboxed. SES remains optional. Never expose Postal/SNS ingestion without authenticating the provider event source.

See [email pipeline operations and API behavior](docs/email-pipeline.md) for transport priority, TLS enforcement, DNS, attachments, native provider signatures, and ambiguous delivery outcomes. Run `bash scripts/integration.sh` for the disposable PostgreSQL/Redis/MinIO/Mailpit acceptance suite. Compose now runs migrations before starting Flare services.

### Dashboard

See [dashboard setup and browser tests](docs/dashboard.md) for authentication, Inbox endpoints, the workflow canvas and live acceptance configuration. Local browser contract tests run with `pnpm test:e2e`; `pnpm test:e2e:live` requires the real stack and a verified sender.

See [webhooks, logs and metrics operations](docs/operations.md) for receiver signatures, retries and replay, internal destination policy, request-log retention and metric definitions.

See [audience, templates and broadcasts](docs/audience.md) for CSV mapping, preferences, immutable template versions, throttling and cancellation semantics.
