# Changelog

## Unreleased

- Wait for dependency readiness before signed-forwarding acceptance probes, retaining strict single-use proof assertions and adding credential-safe failure classification.

- Add CSV, TSV, JSON and Excel contact imports with bounded parsing, field mapping, validation, atomic writes and named lists. Preserve opt-outs and deleted-contact restrictions. Add campaign composition, pinned templates, list/segment targeting, recipient eligibility previews, draft editing, send-now/scheduling controls and idempotent draft creation. Keep campaign/import content out of logs and retain the shared sending-policy pipeline. Exercise maximum-size import boundaries and accept valid 100,000-cell workbooks without weakening raw/expanded/cell limits. Verification is tracked in `PROGRESS.md`.

- Complete the editorial UI review with Linux x64 visual references for both themes, responsive and interaction regressions, themed canvas controls and clearer insertion labels. Preserve accepted editor saves when a later refresh fails after an intervening server read. Keep native Inbox read-persistence checks usable with longer notification feeds, and retain bounded, credential-free failure diagnostics in CI. Update the navigation and testing guides.

- Preserve raw workflow, layout, translation and template drafts in memory through failed saves and navigation, protect concurrent saves and environment switches, and preserve historical versions. Make table search/loading/error states explicit, use one server-backed Contacts search, distinguish delivery outcomes, and improve linked validation, authentication/preferences recovery and pending dialog feedback.

- Align shared page/section typography and panel spacing, restore saved themes before paint, simplify Overview, and keep navigation and editor actions reachable on narrow/short screens. Bound the native Inbox popup to the available viewport without restarting its session; preserve actual read-state persistence checks.

- Redesign the frontend with locally served Source Serif 4 and DM Sans, an ivory/indigo palette, editorial page hierarchy and restrained panels. Apply the system to navigation, Overview, authentication, public preferences, shared module tables/forms, charts and workflow/automation editors; make Monaco follow live theme changes. Preserve API-backed behavior and add browser coverage for every sidebar route, font loading, narrow forms, responsive editors, contrast and reduced motion.

- Refine the dashboard visual system, actionable Overview, grouped keyboard page search, responsive table search/pagination and expired-session recovery. Preserve honest delivery status, environment boundaries and remote pagination; add browser regressions for navigation, table history, overview recovery and confirmed session expiry. Verification is tracked in `PROGRESS.md`.

- Organize documentation into architecture, product, development, operations, planning and archive groups with task-based indexes and the website/backend tour. Preserve legacy document paths and section links through generated compatibility pages, archive prior progress without losing evidence, and add local link/anchor validation. Application source, generated contracts and runtime configuration are unchanged.

- Add an explicit Vercel/backend staging overlay with private-path guards, a live-session-bound Inbox WebSocket gateway, strict event/backpressure limits and bounded reconnects. Add exact split-web encrypted backup profiles and a populated nine-volume restore rehearsal. Support externally hosted dashboard DNS in the public verifier while pinning every checked TLS connection. Remove WebSocket credentials from ingress/runtime/request logs, preserve the dashboard Metrics route, and type Inbox socket options in OpenAPI/SDK. Verification and remaining deployment gates are recorded in `PROGRESS.md`.

- Added session-bound direct transfers for large email and inbound content, exact-byte/idempotent retries, safe binary downloads, and a signed private Inbox gateway for Vercel. Gateway requests retain live session/subscriber authorization and bounded native access; credentials/content stay out of logs. Fixed stack overflow in large base64 validation, bounded inbound preview rendering, and redacted transfer grants embedded in arbitrary log text. Accept the pinned Inbox SDK’s automatic timezone without modifying subscriber profiles, and support its default schedule time format; actual SDK browser acceptance covers these boundaries. Added real-service and browser regressions, SDK binary download types, and updated deployment guidance. Final acceptance and push status are tracked in `PROGRESS.md`; actual split-host deployment remains a separate gate.

- Add the signed-forwarding foundation for a Vercel dashboard: explicit HTTPS origins, disabled previews by default, validated platform client IPs, exact request signatures and atomic Redis replay protection. Preserve session/tenant/operator authorization and valid sessions across forwarding outages. Bound Vercel proxy payloads to 4 MiB and keep native Inbox explicitly unavailable there until its private gateway exists. Add real HTTP/Redis and actual Nest acceptance coverage; direct transfers and the complete split-host deployment remain pending.

- Give integration MinIO builds separate image names so they cannot replace the deployment/acceptance images during backup validation. Preserve strict backup image-drift checks and add precise, credential-safe encrypted-rehearsal failure phases.

- Redact reusable Inbox subscriber credentials from request logs and sanitize historical log bodies on reads. Keep Inbox-token and log API payloads metadata-only, including nested serialized copies, while preserving tenant filtering, correlation, timestamps and normal Inbox authentication. Add reproducing HTTP/controller regressions and full-stack checks for persisted and historical records; existing stored bytes and backups are not rewritten.

- Add a live API-backed Overview landing page, responsive keyboard-accessible navigation and mobile publication access. Separate received email from the in-app Inbox, fix independent Inbound/forwarding pagination and shrinking table pages, and preserve drafts and idempotency after send failures. Expose authenticated runtime email limits for bounded attachment prechecks; keep approval/limits unavailable after refresh failures and uncertain acceptance visible after partial recipient feedback. Save the Vercel implementation plan while retaining PostgreSQL and the existing deployment. Verification is recorded in `PROGRESS.md`; split-host Vercel support is a subsequent checkpoint.

- Pin disposable acceptance browsers and their generated dashboard/Inbox origins to IPv4 loopback, matching Compose port bindings. Reject conflicting browser targets and incomplete fixtures before launching, so a separate IPv6 localhost app cannot receive test credentials. Preserve explicit external targets for ordinary live-deployment tests.

- Compare the encrypted backup roundtrip's full 1 MiB result using native exact byte equality, avoiding a costly per-property assertion that exceeded the CI deadline. Preserve the fixture and cryptographic checks; no production behavior changes.

- Add maintenance-only encrypted cold deployment backups and fresh, isolated store recovery with exact image identities, runtime/configuration drift checks, authenticated manifests, strict archive validation and owner-held keys. Preserve source volumes and keep delivery stopped for review. Add a real disposable encrypted recovery rehearsal, bounded worker operational metrics, ten alert rules with firing/recovery fixtures, and recovery/alert runbooks. Keep off-host custody, real notifications and provider reconciliation as explicit staging gates; verification details are recorded in `PROGRESS.md`.

- Keep broadcast batch rollback and failure/backoff under the original policy/broadcast locks; remove the worker's delayed failure writer and use completion-time pacing. Add PostgreSQL contention/cancellation/disconnect regressions. Add an explicit read-only staging public DNS/PTR/HTTPS verifier with bounded requests, pinned addresses and certificate checks, plus the staged deployment/operations/pilot plan. Keep real provider, backup and pilot gates separate from local evidence. Local verification passed 479 unit/database tests, 25 evals, 63 integration tests, 23 browser contracts, nine live flows, Caddy boundary checks and full Compose/load/upgrade/restore.

- Persist publication failure/backoff under the original operation lock after savepoint rollback; retain remote-update reconciliation, preserve SQL deadline precision and fence disconnected callbacks. Start mail pacing and logical consumption accounting after lock waits. Recheck operator session/MFA expiry after authorization locks and before protected mutations commit, rolling back expired changes and audit entries. Add deterministic regressions and independent PostgreSQL contention/disconnect tests. Verified with 440 unit/database tests, 25 evals, 59 integration tests, 23 browser contracts, nine live browser flows and full local Compose/load/upgrade/restore; detailed evidence and external limits are in `PROGRESS.md`.

- Start automation wait windows after policy/contact lock contention using a single precise database wall-clock instant; keep the run deadline identical to the step deadline. Add PostgreSQL regressions for both wait types and both locks, including exclusion of events before actual entry. Save the staging purchase proposal, current price references and provider support message; no infrastructure is purchased.

- Record automation failure, pause and retry state under the original run lock after rolling back partial step effects. Remove the delayed failure callback that could corrupt a newer step or redrive; preserve backoff after slow work, repair wait recovery and clear stale errors after successful recovery. Pin a database-driver patch that rejects queries from closed transactions, including callbacks returning after connection reuse. Cover concurrent advancement, cancellation, redrive, queued-query rejection and connection loss. Implementation `b3d67f3` passed full local acceptance and all five CI jobs: 423 unit/database tests, 25 evals, 43 integration tests, 23 browser contracts and nine live flows, with load/upgrade/restore evidence recorded in `PROGRESS.md`.

- Harden MFA/session transaction boundaries and authentication route rate limits; reject ambiguous mailbox strings; release bounded S3 response streams; cap cancellation recovery retries; preserve database timestamp precision in webhook/automation eligibility and wait matching. Add focused regression, PostgreSQL concurrency and real HTTP checks. Local checks passed: 417 unit/database tests, 25 evals, 33 real-service tests, 23 browser contracts, nine live Chrome flows, full Compose/load/upgrade/restore, Python and installable packages. Implementation `acdab64` also passed all five CI jobs, including 33 integration tests, nine live flows, the three-minute mixed load and a 45-second isolated restore. Detailed evidence is in `PROGRESS.md`; external delivery gates remain open.

- Add durable upload journaling and bounded MinIO cleanup that skips active transactions, preserves committed references and retains tombstones for late PUTs. Refuse deletion for versioned/suspended/unknown buckets and changed namespaces; leave legacy untracked objects untouched. Add metadata-only native-job inspection/inventory and bounded GET-only SDK/CLI reconciliation without claiming queue membership or permitting replay. Implementation `2080fce` passed all five CI jobs and the full local Compose suite: 391 unit/database tests, 25 evals, 29 integration tests, 23 browser contracts and nine live flows. Local/CI restore drills passed in 29s/47s; detailed evidence and cleanup boundaries are recorded in `PROGRESS.md`.

- Added inbound parsing/forwarding SIGKILL scenarios around real MinIO writes, PostgreSQL rollback, Redis-loss recovery and independently observed Mailpit delivery. Pinned the child database connection to the validated disposable URL, preventing ambient PostgreSQL fallback. Documented unreferenced upload residue and the missing general orphan collector; logical recovery does not establish automatic object cleanup. Local standard checks, 372 unit/database tests, 25 evals and all 24 real-service integration tests passed. All five CI jobs passed on `982ec8e`, including 24 integration tests, 23 browser contracts, nine live flows, populated upgrades, mixed load and a 46-second isolated restore. Exact evidence and the reviewed next-work scope are saved in `PROGRESS.md`.

- Added configurable sustained mixed load with fresh email/inbound/Inbox work, a controlled worker pause, independent Mailpit receipts, latency/memory/backlog limits and idempotency checks. Added populated four-environment upgrade, real pre-upgrade snapshot restoration, migration rerun checks and restored tenant write/isolation probes. Disposable launcher cleanup failures now fail the run. Local verification passed: 372 unit/database tests, 25 evals, 23 integration tests, nine live flows and a ten-minute mixed workload (600 unique emails, 60 inbound messages, 30 Inbox deliveries). Populated snapshot recovery and expanded multi-store restore passed (Mac 27s). All five CI jobs passed independently on `953a0b5`, including a three-minute mixed workload (180 emails, 18 inbound, nine Inbox), the same upgrade scenarios and a 41-second multi-store restore. Exact measurements and external boundaries are recorded in `PROGRESS.md` and `docs/acceptance.md`.

- Docker Desktop 4.95.0 is operational on the Mac. Local acceptance on `a7ed844` passed all 23 integration tests, nine live browser flows, native restart/cancellation and dispatcher quarantine, private DNS/Postal callbacks, queue-loss characterization, load recovery and a 23-second isolated restore. Staging ingress passed; added fresh-shell Docker CLI discovery and the owner hosting/domain/DNS checklist. All five CI jobs passed independently on `a7ed844` (365 unit/database tests, 25 evals, 45 Python tests, 23 browser contracts, 23 integration tests and nine live flows). CI restore took 46 seconds. Real staging/provider gates remain open.

- Acknowledge identical durable inbound receipts after DNS drift or receiving disablement while keeping new admission serialized with domain updates. Reject named callback keys that do not match bundled Postal. Isolate local integration cleanup by project and refuse remote Docker/custom store targets before destructive tests. Explicitly select the pinned AMD64-only Postal image for Apple Silicon emulation. Added regression and PostgreSQL race coverage; candidate execution is tracked in `PROGRESS.md`.

- Sender-safety checkpoint `c307e1f` and forwarding checkpoint `a70140e` each passed all five CI jobs. Latest evidence: 351 unit/database tests, 25 evals, 45 Python tests (four external skips), 23 browser contracts, 22 real-service tests and nine live browser flows. Load recovered all 54 accepted sends without lost/duplicate submissions; isolated restore passed in 46 seconds. Local Mac containers and real staging/provider checks remain open.

- Inbound forwarding now preserves accepted work through approval/suspension, quota exhaustion and recoverable sender-readiness blocks. Retry deadlines persist without consuming the failure budget; recovery submits one outbound message using the original receipt and rule. Unknown senders and malformed content retain permanent-failure behavior.

- Preserved campaign recipients and automation retries during known-sender DNS/TLS blocks, with retryable SMTP responses for temporary TLS capability outages. Fixed operator suspension with unchanged disabled routes, legacy complaint replay after restoration, and SES readiness invalidation racing with attempt admission. Content-bearing API routes, including publication diffs and mixed-case URLs, now omit bodies and queries from logs. Added reproducing database/SMTP/browser regressions and an independent-PostgreSQL readiness race test; candidate execution is tracked in `PROGRESS.md`.

- P0 implementation checkpoint `54743f0` passed all five CI jobs: 318 unit/database tests, 21 real-service tests, 22 browser contracts, nine live browser flows, 25 evals and 45 Python tests (four external skips). Shared quotas, scheduled pacing, operator MFA and actual email SIGKILL/lease recovery passed. Full-stack load recovered 54 sends without duplicates; isolated restore passed in 41 seconds. Local Mac Docker and external provider evidence remain pending.

- Added real-service acceptance for cross-domain/environment quota contention, simultaneous scheduled dispatch pacing, and outbound-email SIGKILL after SMTP acceptance with actual lease expiry. The crash scenario verifies retained usage, ambiguity quarantine and no replay across worker restarts; execution evidence is recorded in the acceptance ledger.

- Fixed DNS and SES poll completion against native PostgreSQL timestamp precision. Explicit text binding preserves microseconds in guarded claim updates; regressions force sub-millisecond values that the embedded test clock does not normally produce.

- Hardened the P0 follow-up: retain accepted messages during final TLS capability-probe outages, bound SES capability requests, and retain provider receipt history without replaying complaint/bounce restrictions after audited operator restoration. Added database regressions for fresh callback IDs and classification upgrades.

- Added P0 operator approval, recent MFA and audited policy changes; shared recipient quotas/pacing, durable holds and campaign admission pauses; authenticated feedback suspension with reviewed-evidence replay protection; immutable named routes and safe failover boundaries; separate ownership/Production readiness with DMARC, hourly checks and evidence expiry; operator/tenant UI, SDK/CLI status and additive migration coverage. External delivery evidence remains unverified.
- Added API/SMTP shared-quota and Redis-loss real-service scenarios, private real-browser operator MFA acceptance, upgrade preservation assertions and stricter offline staging configuration checks. Execution evidence is tracked per candidate in `PROGRESS.md`.

- Sender-reputation P0 checkpoint 1: recipient-correct SES feedback, protected provider suppressions, explicit unknown bounce classification, conservative failure/failover rules, persisted retry deadlines with bounded Retry-After, typed retry/attempt metadata and content-free email request logs. Operator approval, quotas and transport readiness are implemented in the subsequent integrated checkpoint.

- All five CI jobs passed independently on `82729e7`, `d65420c`, `ef54d28` and latest implementation `e178006` (run `38629040758`). Latest evidence: 169 unit/database tests, 25 evals, 45 Python tests, 14 browser contracts, 12 integration tests and eight live flows. Native worker SIGKILL, complete native queue-loss characterization and Flare's interrupted-acceptance quarantine all passed. Load recovered 54 sends without duplicates; restore passed in 42 seconds. Mac Docker and external deployment/provider verification remain open.

- Added a real Flare dispatcher SIGKILL scenario after native acceptance but before local persistence. A disposable internal proxy creates the uncertainty window; actual lease expiry must quarantine the attempt without replay or duplicate delivery.

- Added disposable native worker SIGKILL and complete native queue-loss acceptance. The latter observes pending delay/digest work beyond its deadlines, rejects unsafe redrive and verifies explicit cancellation; it does not claim automatic delivery recovery after destroyed queues.

- Added real-browser MFA/account-recovery and viewer restrictions acceptance. Revoked sessions now return users to login and clear cached protected data without treating normal role denials as logout; test diagnostics suppress private authentication values.

- Added bounded native job progress and timestamps to Activity, with explicit partial/missing observations and parent-trigger cancellation for observed pending delay/digest work. Preserved local dispatch status, read-only access and compatibility; expanded typed API and regression/browser acceptance coverage.

- All five CI jobs passed on `1a743b5` in run `38619875142`: 158 unit/database tests, 25 evals, 45 Python tests, 12 integration tests, 13 browser contracts and six live flows. Local TLS OIDC, native Postal, restart/cancellation, API-outage visibility and shutdown checks passed. Load recovered 54 sends without duplicates; isolated restore passed in 41 seconds. Local Mac Docker and external deployment/provider checks remain pending.

- Preserved tenant-isolated workflow activity during Novu outages, with explicit engine observation availability and unchanged dispatch state. Fixed queued fan-out cancellation to address its parent trigger and display cancellation compensation. Added nine database regression tests, a browser flow, typed API responses and a real native API-outage acceptance phase.

- Added a disposable native-engine restart scenario: preserve Novu Redis AOF, cancel delayed work through Flare while the native worker is stopped, then verify one surviving Inbox delivery and no canceled or duplicate delivery across two worker restarts. Runtime verification is tracked separately in the acceptance ledger.

- Added hosting-independent OIDC and native Postal callback acceptance scenarios, drained worker polling before shutdown, and tested HTTP-log flush/aborted request behavior. OIDC explicitly verifies issuer JWKS signatures, retries discovery after transient failure and sanitizes invalid-grant errors. MFA UI clears obsolete setup/recovery data and sensitive form values after account-security changes; a browser regression covers enrollment, recovery login and re-enrollment.
- CI `38613630116` is fully green on `82ec8c9`: 144 unit/database tests, 25 evals, 45 Python tests, 12 integration tests, 11 browser contracts, six live flows and isolated Caddy routing/header checks. Hosting, budget, region and domain decisions are deferred by the user; no real deployment is claimed.
- Fixed Python smoke-test loopback policy across Python 3.9/3.12, added persistent-store restart policies and bootstrap API-key validation for staging, and added an isolated runtime test for Caddy private routes and client-IP spoof rejection.
- Prepared the Postal + Inbox/password-MFA staging pilot with pinned Caddy HTTPS ingress, private administration, explicit optional inbound SMTP exposure, internal relay CA trust, and redacted offline configuration checks. Deployment and external-provider verification remain pending infrastructure.
- Preserved per-client authentication limits through the staging dashboard proxy by forwarding only a validated ingress-owned client address through exact trusted container addresses.
- Added optional pytest API smoke checks with explicit staging opt-in, Python linting, and 25 deterministic product evals for content, schedules and email input. Added CI gates and a guide to writing tests, lint rules and eval criteria.
- Expanded pinned-stack acceptance with native Inbox delivery/read-state and subscriber isolation, native action timing/failure checks, real HTTP MFA replay protection, and an isolated multi-store restore drill. Runtime results are tracked in `PROGRESS.md`.
- Corrected workflow failure guidance to account for the HTTP action's explicit `continueOnFailure` setting and legacy channel halt controls.
- Pinned native throttle acceptance now checks its 30-second retention buffer and eventual renewal; independent acceptance groups report combined failures. Restore diagnostics expose only allowlisted phases/error categories, with a regression against secret-bearing markers.
- CI `38538818077` passed the expanded checkpoint on `7d91b54`: 137 tests, 11 browser contracts, 12 real-service tests, six live browser flows, native Inbox/actions, local MFA, queue-loss recovery and a 44-second isolated restore. Local Docker and real deployment/provider gates remain pending; `PROGRESS.md` records the staging-to-pilot roadmap.
- Initial Flare workspace, service scaffold, CI and self-hosting configuration.
- Password/OIDC sessions, TOTP with recovery codes, RBAC, invitations, tenant policies, encrypted credentials, API keys and identity seed.
- Novu workflow control plane, durable trigger queue, subscriber/preferences APIs, Flare-managed topic fan-out, integration metadata and workflow publication.
- Shared email pipeline, durable submission and delivery claims, batch/idempotency/scheduling APIs, sender DNS verification, encrypted DKIM, secure attachments, transport retries/failover, authenticated STARTTLS relay, tracking, Postal/SNS events, org-wide suppression and transactional event outbox.
- Fixed JSON/date serialization for all raw PostgreSQL service queries; added migration startup, demo mail seed, SMTP/database regression tests and a disposable container integration harness.

## Dashboard checkpoint — 2026-10-12

- Added the authenticated responsive dashboard, workflow canvas, subscriber preferences and self-hosted Inbox, activity, domains and email composer/timelines/source, integrations, publishing, and account/team/key settings.
- Added password/SSO/invitation flows using HttpOnly cookies and server-validated tenant switching. Monaco assets stay local.
- Added browser contract tests and a separate live acceptance suite; container acceptance remains pending.

## Operations checkpoint — 2026-10-12

- Added durable webhook fanout/delivery, retry exhaustion alerts, replay, secret rotation, targeted test events, DNS-pinned HTTP dispatch and official Svix signature compatibility.
- Added tenant request logs with bounded credential redaction, search/status filters, CSV export and retention, plus recipient delivery and human engagement metrics.
- Added dashboard endpoint/attempt/log/metric screens, authenticated engine-event ingestion and workflow lifecycle outbox events.
- Expanded database, HTTP and browser coverage; real Redis/PostgreSQL recovery coverage awaits Docker.

## Audience checkpoint — 2026-10-12

- Added contacts, typed properties with fallbacks, atomic CSV import/deduplication, segments, topics and signed public preference pages.
- Added immutable HTML template versions, safe variable rendering/previews, direct-email template references and saved workflow email expansion.
- Added durable throttled broadcasts with frozen audiences, pinned content, sender scope checks, preference/suppression rechecks, cancellation, statistics and signed one-click unsubscribe headers.
- Added audience/template/broadcast screens and database/browser regressions; real queue-loss recovery tests remain pending Docker.

## Automations checkpoint — 2026-10-12

- Added durable event-triggered contact sequences with immutable run snapshots, pinned email templates, wait/event/condition steps, retry history and cancellation.
- Added a sequence canvas, per-step settings, real test-event submission and run/email timelines.
- Added database and browser regressions plus a container recovery test; inbound, layouts, translations and publication remain in progress.

## Inbound checkpoint — 2026-10-12

- Added native signed Postal receipt, raw MIME storage, bounded asynchronous parsing, attachment retrieval, tenant/domain isolation and metadata-only received events.
- Added durable forwarding through the existing mail pipeline, Reply-To preservation, suppression and loop prevention, plus sandboxed message previews and downloads.
- Added database/signature/browser regressions and real concurrent receipt/queue-loss recovery coverage; Docker and live Postal verification remain pending.

## Content checkpoint — 2026-10-12

- Added immutable layout wrappers and workflow locale dictionaries with source preservation, pinned dependencies, per-key default fallback and durable translated trigger payloads.
- Added content editing/import/export, workflow layout/version selection and locale previews.
- Hardened inbound/layout previews by rebuilding resource-free HTML before sandboxing; fixed dynamic iframe rendering and dictionary draft refresh behavior.

## Publication checkpoint — 2026-10-12

- Added resumable workflow/layout/translation promotion, automatic pinned dependencies, stale-diff detection and immutable-version conflict handling.
- Added durable operation history and retry/replacement controls; Production triggers pause while an existing workflow is being reconciled with Novu.
- Added publication recovery and browser coverage; actual pinned Novu interoperability remains a live acceptance requirement.

## Reliability checkpoint — 2026-10-12

- Added configurable atomic API-key/auth token buckets, standard response headers and fail-closed Redis handling.
- Replaced queue-callback workflow retries with durable atomic claims, attempt history, recovery and cancellation compensation; uncertain engine acceptance is quarantined.
- Added tenant-scoped dead letters and audited redrive, preserving operation identity and refusing ambiguous sends.
- Added sanitized request/job tracing, Prometheus metrics, Grafana panels, storage readiness, shutdown deadlines and bounded cleanup. Fixed SSO MFA exchange-token consumption on invalid codes.
- Added recovery/rate-limit/browser tests and the first PostgreSQL/Redis/MinIO/Mailpit CI job. Local Docker and real provider checks remain pending.

## Developer tooling checkpoint — 2026-10-12

- Added a generated OpenAPI contract with drift checks, typed TypeScript SDK, environment-explicit CLI and stdio MCP with validated read-only/mutating tools.
- Added local package installation/consumer checks, webhook verification, typed errors, pagination and credential redaction. No registry packages were published.
- Added immutable publication delegation for owner/admin-created keys, with a dashboard control; ordinary API keys remain unable to publish.
- Replaced unavailable official MinIO binary images with builds from pinned official source commits, including the server security release. Actual container verification remains pending.

### Acceptance harness and deployment operations

- Added a separate pinned Compose CI job, disposable secrets/volumes, upgrade-from-62aaa57 and repeatable seed checks, local authoritative DNS verification, real Novu/SMTP/API scenarios, live browser flows and rate/burst/queue-loss load verification.
- Fixed integration startup waiting on the completed MinIO initializer, relay private-key UID/GID access, and seed reconciliation of editable workflow source and the Novu demo subscriber.
- Added deployment, consistent backup/restore, upgrade, recovery and evidence-ledger documentation. Container acceptance and external provider checks remain pending until their runs pass.

### Automation publication

- Added selected automation promotion to the existing durable publication operation, with stable template identifiers, immutable version snapshots, Production sender validation, atomic activation and preservation of existing runs.
- Added migration, typed contract updates, snapshot/remapping/rollback tests and browser selection coverage. Automation execution remains in Flare; notification workflow publication still verifies Novu.

### CI acceptance capacity

- Real-service integration now passes all 11 PostgreSQL/Redis/MinIO/Mailpit tests in GitHub Actions.
- Full-stack CI exhausted runner disk; free unused hosted-runner toolchains and remove only ephemeral CI build cache after images are created. Local Docker caches remain untouched.

### Container startup and acceptance diagnostics

- Confirmed Flare API/web/worker and the pinned Novu API reach healthy status in CI after the disk repair; both standard and 11 real-service integration checks pass.
- Provision Postal's private config volume for its actual UID 999 and launch Flare services directly with Node, avoiding runtime package-manager cache permissions under the relay's mounted-key owner.
- Stage only Git-visible source, exclude generated browser/cache artifacts from Docker contexts, add bounded redacted failure diagnostics, and cover promoted automation execution and SDK consumer types in acceptance.

## Novu integration compatibility — 2026-10-12

- Reuse the current environment’s preinstalled Novu Inbox instead of creating an invalid second provider; enforce unique engine mappings.
- Use the native primary-selection endpoint for email/SMS and persist actual provider state.
- CI now confirms healthy full-stack startup, baseline migration upgrade, login/bootstrap and local DNS verification. Further end-to-end scenarios remain pending.

- Compile Flare email bodies as explicit HTML and avoid applying an engine layout over an already pinned Flare wrapper. Preserve source definitions and explicit native block content.

- Fix workflow and subscriber preference contracts against the pinned Novu API; compare publication preferences using Novu’s native response field names.

- Omit empty native trigger context without mutating accepted request snapshots or logical transaction identity; improve metadata-only acceptance failure diagnostics.

- Allow only Flare’s internal relay in Novu’s outbound policy and explicitly require STARTTLS in generated SMTP credentials.

- Map Flare’s public SMTP provider name to Novu’s native `nodemailer` handler.

- Run browser contract tests against the production build and assert SMTP authentication failures using protocol error codes. Live CI now verifies translated relay delivery and content/automation publication.

## Acceptance recovery — 2026-10-13

- Ignore selection of the already active organization/environment so a delayed session refresh cannot interrupt workflow creation. Added a delayed-response browser regression and explicit live workflow HTTP assertions.
- Wait for worker readiness before checking recovery after Redis loss.
- Verified signed inbound receipt, SMTP authentication/Bcc handling, suppression and four live dashboard flows against the full stack in CI. The final workflow browser and load stages remain under verification.
- Made the GitHub repository public at the owner's request and updated access instructions.
- Added real-service coverage for four SMTP 421 rejections followed by one Mailpit submission, with ordered persisted attempts and provider acceptance kept separate from delivery.
- All five live browser flows pass against the pinned stack. Use Compose's compatible `up --wait` restart path for the final queue-loss stage; the earlier `start --wait` flag was unsupported on the CI runner.

## CI acceptance verified — 2026-10-13

- CI `38442762577` passed all three jobs on `63c655d`: 136 unit/database tests, 11 browser contract flows, 12 real-service integration tests, package installation, build/types/lint/secrets and the full pinned Compose acceptance run.
- All five live browser flows passed. All 54 accepted load messages recovered after Redis loss with one provider attempt each; 29 burst requests were correctly throttled and peak sampled API RSS was 184,688,640 bytes.
- Updated the completion ledger and deployment handoff. Mac Docker, external providers/public DNS/OIDC, remaining native channel/action behavior and a restore drill are still separate acceptance gates.
