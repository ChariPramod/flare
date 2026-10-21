# Where to write tests, lint rules and evals

Flare is a TypeScript application. Start with the behavior you want to guarantee, then use the smallest suite that can exercise it. Python is supported for optional API smoke checks; it is not required to build or run Flare.

Automation failure, savepoint rollback, quota release and wait/redrive regressions live in `tests/unit/automations.test.ts`. `apps/worker/tests/automation-recovery.integration.ts` uses independent PostgreSQL connections and observed lock contention to test competing advancement, cancellation, concurrent redrive and backend termination during an uncommitted step. It also verifies both ESM and CommonJS database-driver entrypoints: killed in-flight/queued queries reject, the pool reconnects, and an explicitly awaited delayed callback cannot write through a replacement connection. Keep these tests when upgrading or removing the pinned driver patch. Its controlled in-memory object store isolates database recovery; real MinIO upload cleanup has separate integration coverage. Existing `apps/worker/tests/mail.integration.ts` exercises automation polling after Redis loss without repeating the earlier email.

| What you want to verify                                                        | Where to write it                                                               | How to run it                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A function, validation rule, signature, state transition or database invariant | `packages/*/src/*.test.ts`, `apps/*/src/*.test.ts`, or `tests/unit/*.test.ts`   | `pnpm test`; target a file with `pnpm exec vitest run path/to/file.test.ts`                                  |
| A real PostgreSQL/Redis/MinIO/SMTP interaction                                 | `apps/*/tests/*.integration.ts`                                                 | `bash scripts/integration.sh` creates disposable services; requires Docker                                   |
| Dashboard interactions against a controlled API fixture                        | `tests/e2e/*.spec.ts`; fixture responses in `tests/e2e/fixture-server.ts`       | `pnpm test:e2e`                                                                                              |
| Browser flows against the real pinned stack                                    | `tests/live/*.spec.ts`                                                          | `bash scripts/acceptance.sh` supplies an isolated stack; `pnpm test:e2e:live` requires its prepared fixtures |
| Python API smoke checks or Python helper behavior                              | `tests/python/test_*.py`                                                        | `.venv/bin/python -m pytest`; see [Python setup](testing-python.md)                                          |
| Repeatable examples of expected product behavior                               | `tests/evals/cases/*.json`; runners in `tests/evals/*.eval.ts`                  | `pnpm test:evals`; see [eval criteria and examples](evals.md)                                                |
| TypeScript code-quality rules                                                  | `eslint.config.mjs`                                                             | `pnpm lint`                                                                                                  |
| Python code-quality rules                                                      | `[tool.ruff]` in `pyproject.toml`                                               | `.venv/bin/ruff check tests/python`                                                                          |
| Type safety and API contract drift                                             | Workspace TypeScript configs; schemas/controllers used by `scripts/openapi.mjs` | `pnpm typecheck` and `pnpm openapi:check`                                                                    |

The existing test patterns are executable examples. For an email bug, put the regression beside the relevant mail module; for “canceling while a worker claims the message never sends it,” use a database/concurrency test plus the real-service suite. For “the operator can find an inbound attachment,” use a browser flow. Fixture-backed browser tests establish the UI contract; real-stack browser tests establish that the API and UI work together.

### Editorial UI regressions

`tests/e2e/editorial-design.spec.ts` visits every sidebar module and checks narrow-screen overflow, real local fonts and contrast. The refinement suites cover shell sizing/focus, first-paint theme restoration, forms/tables and retained editor drafts. `tests/e2e/visual-refinement.spec.ts` compares Overview, login, a workflow table, a dialog and the editor in both themes; its references run only on Linux.

Use `ops/Dockerfile.browser-tests` for the reference browser: it combines the lockfile's Playwright image with Flare's Node 22 runtime. References target **Linux AMD64**, matching the Ubuntu 24.04 CI browser runner. Build with `docker build --platform linux/amd64 -f ops/Dockerfile.browser-tests -t flare-ui-browser:1.64.0-amd64 .`, and pass `--platform linux/amd64` to `docker run` too. Apple Silicon therefore needs Docker Desktop's AMD64 emulation; ARM64 functional checks do not establish reference-image parity. Run against a disposable source copy with its own Linux-installed dependencies, not the Mac checkout's `node_modules`. Inside the runner, install with `pnpm install --frozen-lockfile`, build `pnpm --filter @flare/shared build`, then run `pnpm test:e2e`. Only use `--update-snapshots` after reviewing the actual visual change; copy approved image files back into the matching test snapshot directory.

Contract CI uploads traces/screenshots on failure. Live acceptance uploads screenshots plus the explicitly allowlisted `inbox-operation-metadata.json`: bounded operation names, HTTP methods/statuses and aggregate error counts only. Credential-bearing native SDK and MFA suites disable traces, screenshots, video and DOM error snapshots. Do not upload native network traces, other JSON files or private generated acceptance files when diagnosing a live failure.

Dashboard forwarding signatures and strict parsing are tested in `packages/shared/src/dashboard-forwarding.test.ts`; middleware and live-auth-boundary regressions are in `apps/api/src/dashboard-forwarding.test.ts`. `apps/web/lib/dashboard-backend.test.ts` and `dashboard-routes.test.ts` cover deployment configuration, final upstream requests, proxy limits and cookie preservation. Add real HTTP/Redis replay races to `apps/api/tests/dashboard-forwarding.integration.ts`; raw Node header arrays must include an explicit `Host` to reach the server handler. `scripts/acceptance/dashboard-forwarding.mjs` runs a separately configured real Nest API against the disposable stores. These tests do not establish actual Vercel connectivity or its platform header behavior. Credential redaction has shared, middleware and historical controller regressions, plus real Inbox/log checks in `scripts/acceptance/inbox.mjs`.

Large-transfer unit/auth tests live in `apps/api/src/browser-transfers.test.ts`; real PostgreSQL/Redis/raw-HTTP admission tests live in `apps/api/tests/browser-transfers.integration.ts`. Frontend grant, byte-integrity, expired/malformed-response retry and binary download coverage lives in `apps/web/lib/browser-transfers.test.ts` and `tests/e2e/browser-transfers.spec.ts`. `scripts/acceptance/browser-transfers.mjs` submits a signed large inbound message through actual parsing/MinIO, and `tests/live/browser-transfers.spec.ts` verifies large content, exact download bytes and retry after a real accepted send loses its response. Private Inbox gateway and deployed web-route tests are in `apps/api/src/dashboard-inbox.test.ts` and `apps/web/lib/dashboard-inbox-routes.test.ts`. `scripts/acceptance/dashboard-inbox.mjs` uses an isolated actual Nest API plus pinned native Novu to check binding, revocation, subscriber isolation and log protection. `tests/live/inbox-sdk.spec.ts` loads the installed pinned SDK in Chromium and uses a Node-only signing bridge to the real API. It verifies automatically emitted timezone metadata without changing the native subscriber, feed/count/preferences, read state and default 12-hour schedule values. Its signing key stays in the private generated environment; browser traces/screenshots/video are disabled and its session/bindings are cleaned up. These complement the existing native SDK browser test; actual public TLS and Vercel execution remain separate deployment gates. The checkpoint 2c extension adds live WebSocket event/reconnect and authority-loss scenarios; consult the acceptance ledger for execution results rather than treating test presence as a pass.

Checkpoint 2c WebSocket transport tests live in `apps/api/src/dashboard-inbox-ws.test.ts`; session/Redis/subscriber authority regressions remain beside the HTTP gateway in `apps/api/src/dashboard-inbox.test.ts`. The transport tests exercise real local Socket.IO connections with controlled authority/native peers: exact Origin, denied client events, per-session/queue bounds, reauthorization, idle deadline, expiry and reconnect. `tests/e2e/inbox.spec.ts` uses the installed React SDK with controlled HTTP/Socket.IO responses to check viewer non-mutation, escaped content, fresh bootstrap, revocation, writer controls and late-initialization cleanup. These are UI contracts; the disposable `tests/live/inbox-sdk.spec.ts` extension exercises the installed SDK against native Novu and real Flare session/binding state. Do not replace those requests with handwritten SDK approximations or print JWTs/socket URLs. Keep traces, screenshots, videos and automatic error snapshots disabled. Test viewer reads and rejected mutations independently; an unread count alone does not prove write permissions.

Staging configuration regressions belong in `tests/unit/staging.test.ts` and `tests/unit/staging-model.test.ts`. Public-manifest, DNS-answer validation, pinned TLS and fixed probe-result tests belong in `tests/unit/staging-public.test.ts`. Version 1 pins all services to the backend IPv4; version 2 validates external dashboard A/AAAA separately and pins every resulting unique address. Negative cases must include private/mixed DNS answers, excessive answers, TLS/peer mismatch, redirects and unchanged backend AAAA rejection. Neither unit fixtures nor the read-only public command prove authenticated Vercel/WS behavior.

Encrypted backup/profile regressions belong in `tests/unit/operations-backup.test.ts` and `tests/unit/operations-backup-security.test.ts`. Cover exact file order, readonly Caddy asset/runtime mounts, loaded/private key equality, archive tampering and isolation before resource creation. `scripts/acceptance/operations-backup.mjs` adds a populated second split-web-inbound cold restore: nine volumes retained, only six stores started, forwarding key and both Caddy assets preserved, with database/object/Redis evidence checked again. It never starts ingress/ACME/API/delivery and does not restore a Vercel project or prove an executed rollback. Record actual rehearsal results in the acceptance ledger.

For sender-safety requirements, extend `tests/unit/sending-pipeline.test.ts` for durable holds, reservations and the final attempt boundary, or `packages/mail/src/feedback-receipts.test.ts` for feedback replay and audited suppression restoration. The multi-connection quota/SMTP/feedback cases belong in `apps/worker/tests/sending-policy.integration.ts`; a PGlite test with one connection does not establish concurrency safety. Operator UI contracts live in `tests/e2e/operator.spec.ts`, and real session/MFA flows in `tests/live/operator.spec.ts`. Keep public DNS, physical pool and receiver evidence out of simulated success claims.

`apps/worker/tests/email-crash.integration.ts` kills a child delivery process after actual Mailpit acceptance and waits for the unchanged two-minute lease. It checks quarantine, retained quota, rejected redrive and stale Redis jobs across two worker restarts. This deliberately adds about two minutes to integration runtime; do not shorten it by editing the lease or substituting a mocked clock. The child fixture rejects targets outside the disposable database, Redis namespace, MinIO bucket and loopback Mailpit listener.

`apps/worker/tests/inbound-crash.integration.ts` exercises two additional process-death windows: after real parsed attachment/body writes and after the forwarded message’s final MIME write, before their PostgreSQL transactions commit. Inbound processing uses transaction row locks rather than expiring claims; tests must observe rollback after SIGKILL without rewriting clocks or database state. Recovery clears the disposable Redis database and dispatches from durable PostgreSQL records, then checks attachment contents, one received event, one logical forward and actual Mailpit receipts across worker restarts. Candidate execution evidence belongs in the acceptance ledger.

`apps/worker/tests/object-uploads.integration.ts` verifies the upload journal against real PostgreSQL and MinIO: a saturated one-connection owning pool, active locks, rollback/savepoint cleanup, committed references after a simulated lost acknowledgement, and simulated late-completion ordering using an actual MinIO PUT after deletion. Only fixture cleanup eligibility is advanced; delivery claims and leases are unchanged. Isolated empty buckets test enabled/suspended versioning refusal. The inbound SIGKILL scenarios also check journal-driven deletion of their crashed uploads and preservation of recovered references.

Legacy untracked objects are deliberately excluded. Passing cleanup tests does not establish safe retirement of tombstones, collection of historical bucket versions or recovery after changing storage namespaces. See [deployment storage lifecycle](../operations/deployment.md).

Read-only reconciliation regressions are in `apps/api/src/workflow-activity.test.ts`, `tests/unit/reconciliation-sdk.test.ts`, `tests/unit/sdk.test.ts` and `apps/cli/src/workflow-inspection.test.ts`. Extend these for tenant isolation, timestamp/cursor precision, metadata redaction and bounded GET-only execution. `scripts/acceptance/crash-recovery.mjs` exercises inventory/inspection against pinned native delay/digest work after Redis loss; an old Mongo record never proves queue membership or authorizes replay.

MFA proof/session atomicity tests live in `apps/api/src/mfa-proof.test.ts`; actual concurrent enrollment/login and recovery-code use belong in `apps/worker/tests/auth-mfa.integration.ts`, which observes PostgreSQL lock contention on independent connections. Case-insensitive authentication and operator proof limits have guard regressions in `apps/api/src/auth-guard.test.ts` and `apps/api/src/operator-guard.test.ts`, plus real HTTP checks in `scripts/acceptance/auth.mjs`. Extend `tests/unit/reliability.test.ts` for expired cancellation leases and stale responses. Timestamp-boundary regressions belong in `tests/unit/webhook-delivery.test.ts`, `tests/unit/automations.test.ts` and `apps/worker/tests/webhooks.integration.ts`; use explicit microseconds so JavaScript date rounding cannot hide the failure. Mailbox interpretation and bounded object response cleanup are tested in `packages/mail/src/mail.test.ts` and `packages/mail/src/storage-limits.test.ts`.

Postal 3.3.7 publishes only a Linux AMD64 image; Compose explicitly selects that platform for Postal. The pinned Novu images include ARM64. On Apple Silicon, full acceptance therefore requires working AMD64 emulation in [Docker Desktop for Apple Silicon](https://docs.docker.com/desktop/setup/install/mac-install/) and may run more slowly. Docker Desktop 4.95.0 now runs on the development Mac, and the native Postal callback scenario passed under AMD64 emulation. See [the acceptance ledger](acceptance.md) for complete run evidence and its external-delivery limits.

The container test launchers first run `node scripts/local-docker.mjs`, a read-only check for a reachable local Linux engine and Compose. Remote SSH/TCP Docker contexts are refused. On macOS, launchers append installed Docker Desktop user/bundle paths so both the CLI and credential helpers work in an already-running desktop app; existing CLI/context selections are preserved. Integration startup uses a unique project name and ignores the checkout's `.env`; failure cleanup removes only that invocation's project. Required loopback ports must be free: startup failure does not run schema/Redis resets or tear down a pre-existing stack. Integration tests reject custom `TEST_DATABASE_URL` and `TEST_REDIS_URL` values; use the exact disposable endpoints in `apps/worker/tests/targets.mjs`. Do not point these tests at an SSH tunnel or an existing service. Harness regressions live in `tests/unit/local-docker.test.ts`.

## A useful test-writing loop

1. Write one observable requirement in plain language, such as “a missing French translation falls back to the default English value.”
2. Add a minimal input and an independently written expected result. In an eval, give it a stable case ID and criterion.
3. Run the narrow test first. When fixing a bug, confirm it fails on the old behavior.
4. Run the checkpoint and the relevant integration/browser suite. Do not automatically rewrite expectations to make a failing test pass.

Evals currently cover locale fallback, pinned layout composition, UTC scheduling and email input rules. They call real production functions and fail on any unmet criterion. Flare has no model-generated product feature, so these evals do not need an LLM judge or model credentials. Add database, SMTP or browser tests for behavior that a pure fixture cannot establish.

“Lint tests” usually means adding or tightening static rules, rather than writing pytest assertions. ESLint and Ruff catch code-quality mistakes; TypeScript catches type mismatches; none proves delivery, permissions or intended business behavior. Put those requirements in tests and evals. `pnpm format:check` checks repository formatting; `ruff format --check tests/python` checks Python formatting. Format only your changed files when unrelated historical formatting differs.

## Local commands

Use Node 22 and pnpm 10.32.1. Install dependencies with `pnpm install --frozen-lockfile`. This checkout also has a local toolchain:

```sh
export PATH="$PWD/.tools/node/bin:$PWD/.tools/pnpm/node_modules/.bin:$PWD/.tools/bin:$PATH"
bash scripts/checkpoint.sh staging
pnpm test:e2e
```

The checkpoint runs lint, typecheck, OpenAPI drift, unit/database tests, product evals, build and gitleaks. Browser contracts require a Playwright browser (`pnpm exec playwright install chromium`); this Mac can use installed Chrome with `E2E_BROWSER_CHANNEL=chrome pnpm test:e2e`. Do not run two Next.js builds against the same checkout concurrently.

Run the focused checkpoint 2c tests without Docker:

```sh
pnpm exec vitest run apps/api/src/dashboard-inbox.test.ts apps/api/src/dashboard-inbox-ws.test.ts \
  tests/unit/staging.test.ts tests/unit/staging-model.test.ts tests/unit/staging-public.test.ts \
  tests/unit/operations-backup.test.ts tests/unit/operations-backup-security.test.ts
```

Then run isolated ingress/configuration validation, integration and full acceptance sequentially:

```sh
bash scripts/staging/check-config.sh
bash scripts/integration.sh
E2E_BROWSER_CHANNEL=chrome caffeinate -i bash scripts/acceptance.sh
```

The Caddy command covers both hosting modes and optional receiving overlays, runtime routing/upgrade/header behavior, and credential-free error logs with synthetic upstreams. It uses no public TLS, ACME or deployed credentials. The full-stack runner owns the mutating SDK and restore fixtures; do not launch those standalone against an existing service.

Run integration and full acceptance sequentially on the shared development Mac. Integration now builds separately named MinIO images so it cannot retag the deployment/acceptance store images; backup validation still rejects any image drift. CI runs these suites on independent hosts. Record interrupted or failed rehearsals separately from a final clean run.

Python setup and checks:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tests/python/requirements.txt
.venv/bin/python -m pytest
.venv/bin/ruff check tests/python
.venv/bin/ruff format --check tests/python
```

The default Python run makes no staging requests. Once staging exists, opt into read-only checks:

```sh
FLARE_TEST_BASE_URL=https://api.staging.your-domain.tld \
  .venv/bin/python -m pytest --staging -m staging
```

Supply `FLARE_TEST_API_KEY` through a secret store or protected environment for authenticated reads. Never commit it. The API key selects its organization/environment; use a dedicated pilot key. Public checks verify authentication and that health/readiness endpoints remain private. Dependency readiness is checked separately through an SSH tunnel with `--staging-internal`; see the Python guide. Neither smoke mode verifies email delivery.

For long container runs on a Mac, keep the lid open and prevent idle sleep only for the command's lifetime:

```sh
caffeinate -i bash scripts/integration.sh
E2E_BROWSER_CHANNEL=chrome caffeinate -i bash scripts/acceptance.sh
```

Sleep can pause the Docker VM while host wall-clock deadlines advance. A timed-out crash/lease test after sleep is not a passing recovery result; rerun it awake without shortening leases or weakening assertions. `caffeinate -i` does not override closing the lid or an explicit sleep request.

## Sustained load and populated upgrade rehearsals

The full-stack script now runs a three-minute mixed workload after the short queue-loss smoke. For a longer local run:

```sh
ACCEPTANCE_SOAK_SECONDS=600 E2E_BROWSER_CHANNEL=chrome caffeinate -i bash scripts/acceptance.sh
```

`ACCEPTANCE_SOAK_SECONDS` accepts 120–1800 seconds (default 180). The runner creates fresh email, signed inbound receipts and native Inbox work alongside API reads, idempotent replays and concurrent bursts. It pauses only the disposable Flare worker for 20 seconds while submissions continue, then requires the durable backlog to drain. The separate existing scenarios still exercise full queue loss and abrupt crashes.

The safe numeric summary records offered/completed API requests, throttles, unique operations, response percentiles, post-admission drain time, peak backlog/age, and sampled API/worker RSS. It checks actual paginated Mailpit receipts, database/provider-attempt identities, inbound outbox events and Inbox contents independently. Mailpit retention is increased only in the acceptance overlay so long runs cannot silently evict evidence. Worker RSS is unavailable during the intentional stop; other collection failures fail the run. Defaults are a 768 MiB sampled RSS ceiling, a five-second successful-request p95 ceiling and a 120-second oldest pending-operation bound. The memory and p95 limits can be configured with `ACCEPTANCE_MEMORY_MAX_BYTES` and `ACCEPTANCE_SOAK_P95_MS`; record changed thresholds with results rather than weakening them after a failure.

The workload uses the isolated Mailpit sandbox and its explicit quota exemption. It does not measure real-provider throughput or the pilot's 100/day allowance, prove absence of memory leaks, or establish production sizing. Root tests in `tests/unit/sustained-load.test.ts` cover configuration/evidence helpers and refusal of unsafe targets; container acceptance is the runtime evidence. Detailed private samples are deleted with the disposable stack; retain only the numeric console summary when recording results.

Before application scenarios, `upgrade-rehearsal.sh` populates the committed `62aaa57` schema with two organizations/four environments, pinned template versions, scheduled/active/terminal mail and durable workflow, automation, webhook and broadcast state. It takes a real pre-upgrade `pg_dump`, upgrades and verifies unchanged original values plus intentional migration changes, reruns the migrator, restores the dump into a separate database, then verifies and upgrades that copy twice. `tests/unit/upgrade-rehearsal.test.ts` checks the populated fixture and detects lost or changed history. This same-cluster database fallback is separate from the final fresh-volume multi-store restore and never starts delivery processes or certifies down migrations.

## CI and staging gates

`.github/workflows/ci.yml` runs unit/database tests, deterministic evals, Python lint/tests, package installation, fixture browser contracts, staging configuration validation, real-service integration and pinned full-stack acceptance. The Python staging cases remain skipped in ordinary CI because no deployment or provider credentials are supplied. Configuration validation does not issue public certificates or deploy a host.

The full-stack acceptance runner creates its own project and synthetic data, verifies upgrades/seeds, exercises real Novu/SMTP/Redis recovery, runs live browsers and performs an isolated restore. It is destructive only to its own disposable project. Do not substitute a staging `.env` or point the mutating live/load suites at shared pilot data. See [acceptance evidence](acceptance.md) and [staging setup](../operations/staging/staging.md).

Add multi-service fault scenarios under `scripts/acceptance/` and wire them into `scripts/acceptance.sh`. The local HTTPS issuer in `oidc.mjs` tests authentication without an external identity account; `postal-native.rb` exercises Postal's actual callback serializer and signer with synthetic outcomes. `engine-restart.sh` verifies a native worker SIGKILL, delayed Inbox work and cancellation across restarts while preserving Redis AOF. `crash-recovery.sh` separately destroys only native Redis DB2 after stopping its producers; it characterizes stranded delay/digest work and verifies that accepted operations cannot be redriven. `dispatch-crash.sh` holds a real accepted native response and kills Flare before persistence, then verifies actual lease-expiry quarantine without replay. Keep fault injection restricted to the generated disposable project, assert durable identities and observable outcomes, and document the boundary between graceful restart, abrupt crash and complete queue-data loss.

`tests/live/native-progress.spec.ts` verifies real job-state display and parent cancellation. `tests/live/mfa.spec.ts` creates a separate invited viewer, derives TOTP independently, checks recovery-code rotation/replay and session revocation, and confirms role restrictions. Keep traces, screenshots, videos and automatic DOM error snapshots disabled for authentication scenarios; assert booleans for secret-clearing checks so failed assertions cannot print private values.

After provisioning, keep a separate evidence record for real DNS, Postal authorization and native callbacks, delivered mail headers, MFA, Inbox websocket delivery, off-host backup restoration and the expected pilot traffic. Green local tests are necessary; those deployment checks establish that the actual environment works.
