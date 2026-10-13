# Flare progress

Updated: 2026-10-12, America/Los_Angeles.

## Phase status

| Phase                                           | Status                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| 0 — Scaffold, CI, Compose                       | CI full stack starts; local Docker verification pending          |
| 1 — Auth, RBAC, environments, keys              | Local checkpoint passed; live OIDC/container tests pending       |
| 2 — Novu wrapper                                | Core API/queue checkpoint; live engine validation pending        |
| 3 — Email pipeline                              | Local checkpoint passed; container/provider verification pending |
| 4 — Dashboard                                   | Local checkpoint; live-stack acceptance pending                  |
| 5 — Webhooks, logs, metrics                     | Local checkpoint; live engine/container tests pending            |
| 6 — Audience, broadcasts, templates             | Local checkpoint; live recovery/provider tests pending           |
| 7 — Automations, inbound, translations, layouts | Local modules passed; pinned-engine acceptance pending           |
| 8 — Hardening, SDK, CLI                         | Reliability/tooling local checks passed; acceptance pending      |

## Checkpoint log

- 2026-10-12: Created strict TypeScript monorepo, NestJS/Next.js/service scaffold, committed SQL migration runner, local secret setup, isolated Compose services, CI and checkpoint scripts. Node 22.23.3 / pnpm 10.32.1 installed locally. Lint, strict typecheck, 4 tests, production build and gitleaks passed.

- 2026-10-12: Added password sessions, OIDC with PKCE/state/nonce, optional TOTP and single-use recovery codes, invitation acceptance, team roles, last-owner protection, encrypted environment credentials, immutable scoped API keys, audit records and repeatable identity seed. 13 tests pass, including PostgreSQL RLS tests using PGlite.

- 2026-10-12: Added validated workflow CRUD, production guard and selected-workflow promotion, durable queued triggers and cancellation, subscriber upsert, preferences, exact-context topic subscriptions, integrations with encrypted credentials and an activity API. Lint/typecheck/build/gitleaks and 17 tests passed.

- 2026-10-12: Implemented the shared API/SMTP email pipeline, scoped domain/key constraints, durable delivery claims, schedules, batch/idempotency, encrypted DKIM, MinIO attachments, SSRF-safe downloads, Postal/SES/SMTP transports, DNS polling/drift, signed tracking, native Postal/SNS verification, suppression, event outbox, and STARTTLS relay. Fixed a shared postgres.js codec conflict exposed by protocol tests. Lint/typecheck/build/gitleaks and 58 tests passed. Added a disposable container integration harness and provider setup guide.

- 2026-10-12: Added the authenticated Next.js dashboard, HttpOnly session proxy, SSO/invitation/MFA views, organization/environment switching, React Flow workflow editor/test trace, subscriber preferences/Novu Inbox, topics/integrations, publication, domain/email/suppression screens, raw signed MIME, team/keys/settings and responsive light/dark layouts. Lint/typecheck/build/gitleaks, 58 backend tests and three Playwright browser contract flows pass; screenshots inspected. Standard Monaco textarea input avoids experimental EditContext corruption. The Inbox-only proxy preserves internal Novu administration. Full live-stack acceptance is separately configured and remains unrun.

- 2026-10-12: Added durable Svix-compatible webhook fanout, atomic delivery claims, retries/recovery/replay, rotating secrets, endpoint alerts, native engine callback verification, redacted request logs/search/CSV/retention, and delivery metrics with dashboard screens. Lint/typecheck/build/gitleaks and 77 tests pass, including official Svix interoperability and loopback HTTP checks. All four Playwright browser contract flows pass; screenshots inspected. Real PostgreSQL/Redis webhook recovery tests are added but unrun without Docker.

- 2026-10-12: Added tenant contacts, typed properties, atomic CSV mapping/import, dynamic segments, audience topics and signed public preferences; immutable HTML template versions and safe previews; throttled, recoverable broadcasts with pinned content, preference/suppression rechecks, cancellation and DKIM-signed one-click unsubscribe headers. Lint/typecheck/build/gitleaks and 89 tests pass. All five Playwright browser contract flows pass; preference/template screenshots inspected, and template cache freshness fixed after browser testing. Real queue-loss recovery coverage is added but awaits Docker.

- 2026-10-12: Added durable contact automation definitions/events/runs, pinned email steps, persisted waits/event windows, bounded condition branches, cancellation, retries and per-step history; dashboard sequence editor and run timeline. Lint/typecheck/build/gitleaks and 94 tests pass; the new browser flow passes and its screenshot was inspected. Inbound, translations, layouts and expanded publication remain unfinished in Phase 7.

- 2026-10-12: Added signed Postal inbound receipt, durable bounded MIME parsing, MinIO retrieval, forwarding with shared suppression/TLS/DKIM checks, domain-scoped access, redacted inbound logs and a sandboxed dashboard. Lint/typecheck/build/gitleaks and 99 backend tests pass; the inbound browser flow passes and its screenshot was inspected. Real concurrent receipt/Redis-loss recovery coverage is added but awaits Docker.

- 2026-10-12: Added immutable layout/translation versions, workflow source/dependency preservation, locale grouping and durable resolved trigger payloads, content editors and previews. Backend checkpoint passes with 104 tests. All eight browser flows have passed across the full run and targeted repairs. Fixed a Chromium CI preview issue by rebuilding resource-free HTML before sandboxing; pinned Novu rendering remains a live acceptance check.

- 2026-10-12: Added durable selected-resource publication with reviewed revision tokens, stable content identifiers, pinned dependencies, per-item recovery, failed-operation replacement and verified Novu reconciliation. Lint/typecheck/build/gitleaks and 110 backend tests pass; the ninth browser flow passes and its screenshot was inspected. Content checkpoint CI is green. Real PostgreSQL/Redis publication recovery and pinned Novu acceptance remain pending.

- 2026-10-12: Added atomic per-key Redis limits, fail-closed availability handling, durable workflow claims/retries/cancellation compensation, ambiguity quarantine, tenant dead letters and audited identity-preserving redrive, explicit tracing/Prometheus/Grafana instrumentation, bucket readiness and bounded log/idempotency cleanup. Lint/typecheck/build/gitleaks and 116 backend tests pass; the tenth browser flow passes and its screenshot was inspected. Added a separate real-service integration CI job; its first run is pending. Publication checkpoint CI passed.

- 2026-10-12: Added a 142-operation validator-derived OpenAPI contract, typed SDK, credential-safe CLI, read-only-by-default stdio MCP, and immutable owner/admin-delegated publication keys. Backend checkpoint passes with 122 tests; locally packed SDK/CLI/MCP tarballs install and consumer typechecks pass. The eleventh browser flow verifies explicit publication delegation. Standard reliability CI passed all ten browser flows; container integration stopped at the withdrawn MinIO client image. Compose now builds official pinned MinIO sources, including the upstream server security patch; first source-build CI verification is pending.

## Known issues and verification limits

- This host has no Docker runtime. Full-stack startup, official image pulls and container integration tests cannot be validated here yet.
- Real PostgreSQL/Redis/MinIO/Mailpit integration passed all 11 tests in GitHub Actions on 6dbf291, including concurrency, queue-loss recovery, inbound deduplication, publication recovery and atomic limits. The equivalent local Docker run remains pending.
- Postal/SES identities require provider-side authorization. Native callback interoperability, real DNS verification, and Novu → STARTTLS relay delivery need live verification.

- OIDC provider interoperability and full HTTP session flows still require live integration verification; passing unit/database tests do not certify those deployments.

## GitHub delivery

- 2026-10-12: Authenticated GitHub CLI as `ChariPramod`, created [ChariPramod/flare](https://github.com/ChariPramod/flare) as a private repository, and pushed all eight completed checkpoints through `551f476` to `main` over HTTPS. Local `main` tracks `origin/main`. The eight-commit history passed gitleaks before upload.
- Inbound MIME dependency preparation is now incorporated into the inbound implementation checkpoint.

## Next

Continue Phase 8 with container acceptance, load tests and operational documentation. Inbound receiving, layouts, translations and selected content publication are implemented. Automation promotion is implemented with pinned template dependencies; live acceptance remains pending. Full Compose verification remains a prerequisite for production readiness.

## Acceptance checkpoint in progress

- Tooling checkpoint `4fd2267` is pushed. Its standard CI job passed all checks and 11 browser flows. Official pinned MinIO sources built successfully; integration startup then failed because Compose waited on the completed initializer. The runner now initializes the bucket separately.
- Added a disposable full-stack CI/local runner with isolated secrets/data, baseline upgrade and repeatable seed assertions, local authoritative DNS, pinned Novu and SMTP flows, signed inbound simulation, content publication, browser recovery and bounded load/queue-loss checks. Added operational deployment and restore documentation.
- The full-stack harness is running in CI; see the execution evidence below. The Mac still has no Docker. Real providers, public DNS, and OIDC remain open; full acceptance is not complete.

- Closed the automation publication implementation gap: selected promotion now includes pinned template dependencies, remaps Production IDs, validates the Production sender and preserves existing runs. Two new database tests and the updated automation browser flow pass. Full-stack CI is running for the acceptance harness; no live-provider completion is claimed.

- CI run `38350216440` passed standard checks and all 11 real PostgreSQL/Redis/MinIO/Mailpit integration tests. Full-stack acceptance exhausted runner disk before producing archived logs; CI now frees unused preinstalled toolchains and prunes only its ephemeral build cache after image creation. Retry pending.

- CI run `38351015247` passed standard checks and all 11 integration tests. The disk repair allowed the full stack to build and Flare API/web/worker plus Novu API to become healthy. Startup then stopped at Postal initialization, with the relay restarting. Pinned Postal runs as UID 999 while host secrets are private to the setup user; a private owned config volume now bridges that boundary. Runtime Node launch removes the relay's package-manager cache dependency. Redacted diagnostic tests pass; next full-stack run remains pending.

- CI run `38353054193` passed standard checks (including 11 browser flows), all 11 real-service tests, healthy startup of every pinned service, upgrade from `62aaa57`, authentication/bootstrap and local DNS verification. Setup then exposed Novu’s preinstalled Inbox singleton. Flare now adopts only the current environment’s Inbox, enforces unique local engine mappings, and uses Novu’s dedicated email/SMS primary endpoint. Lint, typecheck, 130 tests, production build and gitleaks pass, including five focused regressions. Continued live acceptance is pending.

- Pinned SDK contract review found that Novu defaults email content to Maily block JSON. Flare now explicitly compiles HTML email and disables Novu’s additional layout when a Flare wrapper is already applied, preserving editable source and explicit native block requests. Lint, typecheck, 131 tests, build and gitleaks pass; live rendering remains under verification.

- Matched workflow preference requests to the pinned SDK’s required `all`/`channels` structure, send boolean subscriber preference values, and normalize Novu’s `preferences.default` response during publication verification. API writes and publication now share one engine body. Lint, typecheck, 133 tests, build and gitleaks pass, including native DTO and interrupted-publication regressions.

- CI run `38355107858` confirmed the Inbox repair, clean full-stack startup, upgrade from `62aaa57`, local DNS verification and repeatable demo seed. It stopped at the workflow preference validation mismatch corrected in `ce28096`. Current candidate `ce28096` passes standard CI (133 tests and 11 browser contract flows) and all 11 real-service tests; full-stack execution reached workflow triggering, then exposed Novu’s rejection of empty context objects.

- Omit empty context only in the outbound Novu trigger request, retaining the durable request and transaction ID for safe redrive. Nonempty context is preserved. Acceptance now stops immediately on terminal workflow outcomes and prints only status/attempt counts and numeric upstream HTTP status. All checkpoint checks and 134 tests pass; new live run pending.
