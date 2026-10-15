# Where to write tests, lint rules and evals

Flare is a TypeScript application. Start with the behavior you want to guarantee, then use the smallest suite that can exercise it. Python is supported for optional API smoke checks; it is not required to build or run Flare.

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

For sender-safety requirements, extend `tests/unit/sending-pipeline.test.ts` for durable holds, reservations and the final attempt boundary, or `packages/mail/src/feedback-receipts.test.ts` for feedback replay and audited suppression restoration. The multi-connection quota/SMTP/feedback cases belong in `apps/worker/tests/sending-policy.integration.ts`; a PGlite test with one connection does not establish concurrency safety. Operator UI contracts live in `tests/e2e/operator.spec.ts`, and real session/MFA flows in `tests/live/operator.spec.ts`. Keep public DNS, physical pool and receiver evidence out of simulated success claims.

`apps/worker/tests/email-crash.integration.ts` kills a child delivery process after actual Mailpit acceptance and waits for the unchanged two-minute lease. It checks quarantine, retained quota, rejected redrive and stale Redis jobs across two worker restarts. This deliberately adds about two minutes to integration runtime; do not shorten it by editing the lease or substituting a mocked clock. The child fixture rejects targets outside the disposable database, Redis namespace, MinIO bucket and loopback Mailpit listener.

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

The full-stack acceptance runner creates its own project and synthetic data, verifies upgrades/seeds, exercises real Novu/SMTP/Redis recovery, runs live browsers and performs an isolated restore. It is destructive only to its own disposable project. Do not substitute a staging `.env` or point the mutating live/load suites at shared pilot data. See [acceptance evidence](acceptance.md) and [staging setup](staging.md).

Add multi-service fault scenarios under `scripts/acceptance/` and wire them into `scripts/acceptance.sh`. The local HTTPS issuer in `oidc.mjs` tests authentication without an external identity account; `postal-native.rb` exercises Postal's actual callback serializer and signer with synthetic outcomes. `engine-restart.sh` verifies a native worker SIGKILL, delayed Inbox work and cancellation across restarts while preserving Redis AOF. `crash-recovery.sh` separately destroys only native Redis DB2 after stopping its producers; it characterizes stranded delay/digest work and verifies that accepted operations cannot be redriven. `dispatch-crash.sh` holds a real accepted native response and kills Flare before persistence, then verifies actual lease-expiry quarantine without replay. Keep fault injection restricted to the generated disposable project, assert durable identities and observable outcomes, and document the boundary between graceful restart, abrupt crash and complete queue-data loss.

`tests/live/native-progress.spec.ts` verifies real job-state display and parent cancellation. `tests/live/mfa.spec.ts` creates a separate invited viewer, derives TOTP independently, checks recovery-code rotation/replay and session revocation, and confirms role restrictions. Keep traces, screenshots, videos and automatic DOM error snapshots disabled for authentication scenarios; assert booleans for secret-clearing checks so failed assertions cannot print private values.

After provisioning, keep a separate evidence record for real DNS, Postal authorization and native callbacks, delivered mail headers, MFA, Inbox websocket delivery, off-host backup restoration and the expected pilot traffic. Green local tests are necessary; those deployment checks establish that the actual environment works.
