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

## CI and staging gates

`.github/workflows/ci.yml` runs unit/database tests, deterministic evals, Python lint/tests, package installation, fixture browser contracts, staging configuration validation, real-service integration and pinned full-stack acceptance. The Python staging cases remain skipped in ordinary CI because no deployment or provider credentials are supplied. Configuration validation does not issue public certificates or deploy a host.

The full-stack acceptance runner creates its own project and synthetic data, verifies upgrades/seeds, exercises real Novu/SMTP/Redis recovery, runs live browsers and performs an isolated restore. It is destructive only to its own disposable project. Do not substitute a staging `.env` or point the mutating live/load suites at shared pilot data. See [acceptance evidence](acceptance.md) and [staging setup](staging.md).

Add multi-service fault scenarios under `scripts/acceptance/` and wire them into `scripts/acceptance.sh`. The local HTTPS issuer in `oidc.mjs` tests authentication without an external identity account; `postal-native.rb` exercises Postal's actual callback serializer and signer with synthetic outcomes. `engine-restart.sh` verifies a native worker SIGKILL, delayed Inbox work and cancellation across restarts while preserving Redis AOF. `crash-recovery.sh` separately destroys only native Redis DB2 after stopping its producers; it characterizes stranded delay/digest work and verifies that accepted operations cannot be redriven. `dispatch-crash.sh` holds a real accepted native response and kills Flare before persistence, then verifies actual lease-expiry quarantine without replay. Keep fault injection restricted to the generated disposable project, assert durable identities and observable outcomes, and document the boundary between graceful restart, abrupt crash and complete queue-data loss.

`tests/live/native-progress.spec.ts` verifies real job-state display and parent cancellation. `tests/live/mfa.spec.ts` creates a separate invited viewer, derives TOTP independently, checks recovery-code rotation/replay and session revocation, and confirms role restrictions. Keep traces, screenshots, videos and automatic DOM error snapshots disabled for authentication scenarios; assert booleans for secret-clearing checks so failed assertions cannot print private values.

After provisioning, keep a separate evidence record for real DNS, Postal authorization and native callbacks, delivered mail headers, MFA, Inbox websocket delivery, off-host backup restoration and the expected pilot traffic. Green local tests are necessary; those deployment checks establish that the actual environment works.
