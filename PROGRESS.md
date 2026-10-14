# Flare progress

Updated: 2026-10-14, America/Los_Angeles.

## Resume point — 2026-10-14

- Resume from current `main` in the public [ChariPramod/flare](https://github.com/ChariPramod/flare) repository. Staging preparation is pushed as `daa76f7`. Its full-stack, standard, integration and staging-config jobs passed in [CI 38543738466](https://github.com/ChariPramod/flare/actions/runs/38543738466); the Python job exposed a cross-version loopback classification mismatch. The repair and additional ingress/restart checks are the current checkpoint.
- [CI run `38538818077`](https://github.com/ChariPramod/flare/actions/runs/38538818077) passed all three jobs: lint/types/OpenAPI/build/packages/gitleaks, 137 unit/database tests, 11 browser contract flows, 12 real-service integration tests, and six live browser flows against the pinned stack.
- Native Inbox delivery/isolation/read state, local MFA enrollment/concurrent replay rejection, delay/digest/throttle/HTTP execution, queue-loss recovery, and the isolated multi-store restore drill all passed. The restore took 44 seconds for the synthetic fixture; this is not a production recovery objective.
- Docker installation on this Mac is still pending. Once Docker is running, execute `bash scripts/integration.sh` and `bash scripts/acceptance.sh` from the repository root; the CI result does not replace those local runs.
- User selected **self-hosted Postal + Email + Inbox + password/MFA** for the first pilot. No host, DNS zone or domain is provisioned. SES, OIDC, SMS, push and chat remain deferred; they are not first-pilot prerequisites.
- Current work adds HTTPS staging ingress and offline configuration preflight, fixes dashboard client-IP forwarding through the trusted ingress, and adds optional Python smoke checks and deterministic product evals. See `docs/staging.md` for infrastructure/access and `docs/testing.md` for test locations and commands. No real deployment or provider credentials are available yet.
- Keep first-pilot acceptance open until local containers, public HTTPS/DNS/DKIM, Postal authorization/routing/native callbacks, browser Inbox/MFA and off-host backup custody/restoration/provider reconciliation have evidence. Broader channel acceptance remains separate.

## Phase status

| Phase                                           | Status                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| 0 — Scaffold, CI, Compose                       | CI startup/upgrade/seed passed; Mac Docker run pending                        |
| 1 — Auth, RBAC, environments, keys              | Unit and real HTTP/browser flows passed; external OIDC pending                |
| 2 — Novu wrapper                                | Pinned Inbox/email/action checks passed; credentialed channels pending        |
| 3 — Email pipeline                              | CI SMTP/TLS/DKIM/recovery passed; external providers pending                  |
| 4 — Dashboard                                   | 11 contract flows and 6 full-stack browser flows passed                       |
| 5 — Webhooks, logs, metrics                     | Unit and real-service recovery passed; native callbacks pending               |
| 6 — Audience, broadcasts, templates             | Unit/browser and PostgreSQL/Redis recovery passed                             |
| 7 — Automations, inbound, translations, layouts | Implemented; pinned-stack content/inbound/publication passed                  |
| 8 — Hardening, SDK, CLI                         | Packages, load, recovery and isolated restore passed; deployment gates remain |

## Checkpoint log

- 2026-10-14: Integrated the Python portability repair, persistent-store restart policies, bootstrap-key validation and isolated ingress route/header tests. Local lint/typecheck/OpenAPI/build/gitleaks, 144 unit/database tests, 25 evals and 45 Python tests pass; four external staging checks remain intentionally skipped. The new Docker runtime ingress scenario and Python 3.12 repair await CI.

- 2026-10-14: Prepared a provider-neutral staging overlay for the selected Postal/Inbox/password-MFA pilot, explicit receiving-port opt-in, relay CA trust, and redacted offline preflight. Added exact ingress client-IP forwarding, 25 fixture-driven product evals, and an optional Python smoke harness with separate public and loopback-only readiness modes. Local checkpoint passed with 143 unit/database tests, all 25 evals, 38 Python tests (four staging tests intentionally skipped), clean Ruff checks and 11 browser contract flows. CI `38543738466` confirmed the standard, integration, staging configuration and full-stack jobs; Python failed because 3.12 and 3.9 classify mapped IPv6 loopback differently. The repair explicitly defines allowed loopback addresses, adds regression cases, restart policies for persistent stores, a bootstrap-key preflight check and an isolated Caddy runtime boundary test. No staging resources exist yet.

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
- CI on `7d91b54` passed all 12 PostgreSQL/Redis/MinIO/Mailpit tests and the expanded pinned-stack acceptance job. The equivalent local Docker runs remain pending.
- Postal/SES identities require provider-side authorization. Native callback interoperability, public DNS and external deliverability remain unverified. Novu → authenticated STARTTLS relay → Mailpit delivery passed.
- Password/session, local TOTP/recovery, tenant-aware HTTP/browser flows and isolated restore passed against the stack. External OIDC, credentialed channel delivery, and production restore/provider reconciliation remain open. Advanced action variants outside the tested matrix are listed in `docs/novu-gaps.md`.

## GitHub delivery

- 2026-10-12: Authenticated GitHub CLI as `ChariPramod`, created [ChariPramod/flare](https://github.com/ChariPramod/flare) as a private repository, and pushed all eight completed checkpoints through `551f476` to `main` over HTTPS. Local `main` tracks `origin/main`. The eight-commit history passed gitleaks before upload.
- Inbound MIME dependency preparation is now incorporated into the inbound implementation checkpoint.
- 2026-10-13: Made `ChariPramod/flare` public at the owner's request; GitHub reports `PUBLIC` and an unauthenticated request returns HTTP 200.

## Next

### Completed acceptance checkpoint — 2026-10-14

Baseline: clean `459029e`, verified by [CI 38530994814](https://github.com/ChariPramod/flare/actions/runs/38530994814), with all three jobs green. Continue implementation and acceptance from this baseline; do not rebuild completed modules.

1. **Native Inbox:** exercise delivery into the pinned Novu feed and the authenticated dashboard Inbox. Check subscriber isolation, read state and the session proxy; repair contract mismatches exposed by execution.
2. **Native actions:** exercise delay, digest, throttle and HTTP request against Novu 3.19.0 with bounded timing and isolated destinations. Record actual community capabilities and failure behavior, including unsupported cases, rather than treating accepted workflow definitions as execution evidence.
3. **Restore drill:** back up the disposable stack's PostgreSQL, MongoDB, Postal/MariaDB and object storage, restore into isolated targets, and assert durable records/content and security metadata survive. Keep restored systems disconnected from provider delivery.
4. **Authentication acceptance:** add real HTTP checks for local TOTP enrollment, replay rejection, session revocation and single-use recovery. External OIDC interoperability stays a separate credentialed gate.
5. **Review and verification:** integrate independent changes, run lint/types/unit/build/secret scan and browser contracts, then commit and push a coherent checkpoint. Run the expanded Compose suite in CI, diagnose failures and repeat affected checks until green. Update this file, changelog and acceptance ledger with observed evidence, not predictions.

All five steps above are complete for the controlled CI environment, verified on `7d91b54`. Three subagents implemented and reviewed independent Inbox, action and restore work; the primary agent integrated, tested and pushed it. One runtime mismatch exposed Novu's default 30-second throttle retention buffer; acceptance now verifies both buffered rejection and eventual renewal.

### Larger roadmap — deployment validation and internal pilot

1. **Reproduce locally:** install/start Docker, then run `bash scripts/integration.sh` and `E2E_BROWSER_CHANNEL=chrome bash scripts/acceptance.sh`. Preserve the same pinned versions and disposable data boundary. Exit: both scripts pass on this Mac. Docker installation remains user-managed and pending.
2. **Provision controlled staging:** choose the host/region and owned sending/receiving domain following `docs/staging.md`. Confirm outbound TCP 25 and PTR control before buying a Postal host. Configure HTTPS, protected secrets, separate Development/Production credentials, storage and backups. Exit: private administration, public application access and dependency readiness work on the real host.
3. **Verify the selected pilot:** use controlled recipients to verify public DNS/DKIM, Postal sending/receiving/native signatures, Inbox websocket delivery and password/MFA on the chosen host. Record provider IDs and authenticated delivered/bounced events separately from acceptance. Exit: enabled pilot capabilities have reproducible evidence; SES/SNS, SMS, push/chat and external OIDC stay deferred until selected.
4. **Prove operations on staging:** exercise alerts and dead-letter recovery, restore an encrypted off-host backup with independently recovered secrets, reconcile uncertain provider outcomes, and test upgrades/rollback. Exit: documented recovery ownership and measured recovery/data-loss targets on the intended infrastructure. The 44-second CI fixture does not certify those targets.
5. **Run a limited Pareto Labs pilot:** connect a small set of real application workflows, validate preferences/suppression and publication with actual operators, and measure delivery latency, failures, cost and support needs under expected traffic. Fix observed product gaps before expanding volume.
6. **Roll out deliberately:** enable the verified channels/workflows, establish on-call and backup ownership, monitor capacity and provider health, and expand after pilot evidence is satisfactory. Registry publication remains outside the current plan.

The next dependencies are infrastructure and provider access, not a new scaffold. Do not label full deployment acceptance complete until the open gates above have evidence.

## Acceptance execution history

Entries below record each checkpoint at its execution time; the latest result is authoritative.

- 2026-10-14: Expanded acceptance with native Inbox delivery/isolation/read state and a sixth live browser flow, delay/digest/throttle/HTTP execution and failure controls, real HTTP MFA enrollment/concurrent replay protection, and an isolated PostgreSQL/MongoDB/Postal/Redis/MinIO restore drill. Independent review corrected Redis RDB-to-AOF restoration before execution. Local lint, typecheck, OpenAPI checks, 136 tests, build, gitleaks and all 11 browser contract flows pass. Expanded container scenarios await CI; local Docker and external-provider gates remain open.

- CI `38534097037` on `4721c51` passed the standard and integration jobs, the real HTTP MFA scenario, and native Inbox delivery/isolation/read-state checks. Native delay, digest merge, concurrent throttle, HTTP failure cancellation and explicit continuation passed; the renewed throttle trigger remained skipped after the expected window. This failure stopped the first expanded run before browser/restore checks. Investigating the pinned throttle duration contract; independent action/browser/restore groups now report combined failures so one group cannot conceal results from the others.

- [CI `38538818077`](https://github.com/ChariPramod/flare/actions/runs/38538818077) is fully green on `7d91b54`: 137 unit/database tests, 11 browser contracts, 12 real-service tests, six live browser flows, all native action/Inbox and local MFA scenarios, baseline upgrade/repeated seed, and isolated multi-store restore. Load accepted 54 logical sends, recorded 30 expected throttles and 185,323,520 bytes peak API RSS; queue-loss recovery lost no accepted sends and duplicated no logical/provider submissions. Restore passed in 44 seconds, including tenant policies, decryptable keys, native workflow mappings, Postal data, Redis RDB-to-AOF persistence and MinIO bytes/metadata. External deployment and local Docker gates remain open.

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
