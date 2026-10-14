# Flare progress

Updated: 2026-10-14, America/Los_Angeles.

## Resume point — 2026-10-14

- This note follows a clean `main`/`origin/main` at `7124578` (`docs(acceptance): record green full-stack verification and deployment gates`); resume from the current `main` tip.
- The repository is public: [ChariPramod/flare](https://github.com/ChariPramod/flare). The latest implementation commit covered by full-stack CI is `63c655d`; the current `7124578` commit only records its verified evidence and deployment handoff.
- [CI run `38442762577`](https://github.com/ChariPramod/flare/actions/runs/38442762577) passed lint, typecheck, OpenAPI drift checks, 136 unit/database tests, package installation, gitleaks, 11 browser contract flows, 12 PostgreSQL/Redis/MinIO/Mailpit integration tests, and the pinned full-stack acceptance suite.
- Docker installation on this Mac is still pending. Once Docker is running, execute `bash scripts/integration.sh` and `bash scripts/acceptance.sh` from the repository root; the CI result does not replace those local runs.
- Keep deployment acceptance open until controlled public-DNS/DKIM and provider checks, Postal routing/native callback checks, SES/SNS/SMS checks, external OIDC/MFA, the remaining Novu channel/action matrix, and an isolated backup/restore drill have evidence.

## Phase status

| Phase                                           | Status                                                          |
| ----------------------------------------------- | --------------------------------------------------------------- |
| 0 — Scaffold, CI, Compose                       | CI startup/upgrade/seed passed; Mac Docker run pending          |
| 1 — Auth, RBAC, environments, keys              | Unit and real HTTP/browser flows passed; external OIDC pending  |
| 2 — Novu wrapper                                | Pinned core flows passed; additional channel/action checks open |
| 3 — Email pipeline                              | CI SMTP/TLS/DKIM/recovery passed; external providers pending    |
| 4 — Dashboard                                   | 11 contract flows and 5 full-stack browser flows passed         |
| 5 — Webhooks, logs, metrics                     | Unit and real-service recovery passed; native callbacks pending |
| 6 — Audience, broadcasts, templates             | Unit/browser and PostgreSQL/Redis recovery passed               |
| 7 — Automations, inbound, translations, layouts | Implemented; pinned-stack content/inbound/publication passed    |
| 8 — Hardening, SDK, CLI                         | Packages, load and CI recovery passed; deployment gates remain  |

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
- CI on `63c655d` passed all 12 PostgreSQL/Redis/MinIO/Mailpit tests and the full pinned-stack acceptance job. The equivalent local Docker runs remain pending.
- Postal/SES identities require provider-side authorization. Native callback interoperability, public DNS and external deliverability remain unverified. Novu → authenticated STARTTLS relay → Mailpit delivery passed.
- Password/session and tenant-aware HTTP/browser flows passed against the stack. External OIDC/MFA interoperability, the remaining native channel/action matrix in `docs/novu-gaps.md`, and an isolated backup/restore drill remain open.

## GitHub delivery

- 2026-10-12: Authenticated GitHub CLI as `ChariPramod`, created [ChariPramod/flare](https://github.com/ChariPramod/flare) as a private repository, and pushed all eight completed checkpoints through `551f476` to `main` over HTTPS. Local `main` tracks `origin/main`. The eight-commit history passed gitleaks before upload.
- Inbound MIME dependency preparation is now incorporated into the inbound implementation checkpoint.
- 2026-10-13: Made `ChariPramod/flare` public at the owner's request; GitHub reports `PUBLIC` and an unauthenticated request returns HTTP 200.

## Next

Run `scripts/integration.sh` and `scripts/acceptance.sh` on this Mac once Docker is available. Complete controlled provider/public-DNS/OIDC checks, the remaining native channel/action matrix and the restore drill before declaring deployment acceptance complete. The implementation, installable developer packages, operational documentation and CI acceptance runner are pushed to `main`; registry publication is outside scope.

## Acceptance execution history

Entries below record each checkpoint at its execution time; the latest result is authoritative.

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

- Pinned SMTP source review confirmed connect-time private-address blocking. Compose now allows only the exact internal `flare-smtp-relay` hostname for Novu, and generated SMTP credentials explicitly require STARTTLS with boolean TLS settings. Lint, typecheck, 135 tests, build and gitleaks pass. End-to-end transport verification remains pending.

- CI on `4a18f2f` and `cddd8c7` confirmed native trigger acceptance, then exposed an unsupported native provider ID: Flare’s public `smtp` name must map to Novu’s `nodemailer`. Fixed that boundary with a regression; all checkpoint checks and 136 tests pass. Existing misconfigured integrations must be recreated through Flare’s Integrations screen, which revokes their old relay key. Live delivery remains pending.

- CI `38364420571` verified native trigger acceptance, translated email through SMTP AUTH/STARTTLS to Mailpit, locale fallback, subscriber preference update, content publication/reconciliation, Production editing restrictions and promoted automation execution. The next failure was a test wording mismatch: SMTP correctly rejected bad credentials with `EAUTH`/535. The assertion now checks those protocol fields. The first dev-server browser login timed out; all 11 browser flows pass locally against the production build, which the contract suite now uses. Remaining inbound/browser/load scenarios are still pending.

- Acceptance fixture metadata is created privately by the host before container writes, preserving ownership for the host browser. Full checkpoint passes with 136 tests; all 11 production-build browser flows pass locally.

- 2026-10-13: CI `38437876860` passed standard checks, all 11 real-service tests, the complete API/SMTP/signed-inbound scenarios, and four live browser flows (email, inbound, content publication and dead-letter redrive). The workflow browser exposed a delayed redundant environment switch that navigated away during editing; reproduced locally and fixed by ignoring the active selection. Worker restart now waits for readiness before load recovery assertions. Full-stack workflow/load verification continues; Docker is still unavailable on this Mac.

- Added a PostgreSQL/MinIO/Mailpit case for transient SMTP retry exhaustion followed by priority failover. The actual SMTP adapter classifies the fixture's 421 refusal as transient in a local protocol check; the complete real-service case awaits CI. Unit retry/failover and ambiguity coverage remains in place.

- CI `38440930417` passed every API scenario and all five live browser flows. Burst/load acceptance recorded 54 distinct messages, 30 expected throttles and 177,049,600 bytes peak sampled API RSS. The runner's Compose version rejected `start --wait` before recovery could execute; use the already supported `up --wait` path with `--no-recreate --no-deps` to restart only the existing worker. CI `38441569491` passed the expanded 12-test integration suite; its equivalent failing acceptance rerun was canceled after identifying the incompatible flag.

- 2026-10-13: [CI `38442762577`](https://github.com/ChariPramod/flare/actions/runs/38442762577) is fully green on `63c655d`: lint, types, 136 unit/database tests, OpenAPI drift, builds, package installation, gitleaks, 11 browser contract flows, 12 real-service tests, clean Compose startup, baseline upgrade, repeatable seed, all API scenarios and five live browser flows. The load stage accepted 54 logical sends with 29 expected throttles and 184,688,640 bytes peak sampled API RSS. Every accepted send recovered after worker stop and Redis loss with exactly one provider attempt and no duplicate logical submission. This verifies the local DNS/Mailpit/signed-callback simulation; full deployment acceptance remains open for the explicit gates above.
