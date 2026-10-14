# Product behavior evals

Write new eval cases in `tests/evals/cases/`. These JSON files are the editable dataset; each case has a stable `id`, a plain-language `criterion`, inputs and either an exact `expected` result or an `error` substring. The runners call Flare's real source functions. They do not generate expected answers from those functions.

Flare currently does not have an LLM generation feature. These are deterministic product acceptance evals, so an LLM judge, model API key or subjective score would add uncertainty without improving the checks. A future AI feature should get a separate dataset and quality rubric alongside these tests.

| Cases                               | Behavior evaluated                                                                                                                                                     | Runner                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `tests/evals/cases/content.json`    | Per-key locale fallback, HTML escaping, intentional empty strings, layout composition and pinned versions, missing defaults, reserved variables and template injection | `tests/evals/content.eval.ts`    |
| `tests/evals/cases/scheduling.json` | Natural-language UTC interpretation, explicit offsets, required ISO timezone, past dates and the 30-day limit                                                          | `tests/evals/scheduling.eval.ts` |
| `tests/evals/cases/email.json`      | Envelope normalization and deduplication, header injection, protected headers, missing content and conflicting attachment/template inputs                              | `tests/evals/email.eval.ts`      |

From the repository root, after installing dependencies:

```sh
pnpm test:evals
```

Run only the content cases or one stable case ID:

```sh
pnpm exec vitest run --config vitest.evals.config.ts tests/evals/content.eval.ts
pnpm exec vitest run --config vitest.evals.config.ts -t 'content.locale-fallback'
```

For a machine-readable report (the output directory is ignored by Git):

```sh
mkdir -p test-results
pnpm exec vitest run --config vitest.evals.config.ts --reporter=verbose --reporter=json --outputFile.json=test-results/evals.json
```

Every case is required to pass; any failure exits nonzero and includes its case ID and criterion. The normal verbose summary shows passed and failed counts. Duplicate IDs, missing criteria and cases with both or neither an expected result and error fail during discovery. There is no automatic baseline update: when behavior changes intentionally, review the criterion and expected result together.

To add a case, copy an adjacent fixture, give it a unique ID and describe the user-visible behavior. Set a fixed `now` for scheduling so the case remains reproducible. Content cases use `controls`, default English `base` entries and a selected recipient's `locale` entries. An optional `layout` supplies its HTML, translations toggle and version. Successful content expectations contain the full compiled controls and resolved dictionary; rejected cases contain the expected error message fragment.

The suite needs no `.env`, Docker, Redis, external database, email provider, or model credentials. Content cases run migrations in a disposable in-memory PGlite database with a temporary loopback PostgreSQL socket, then call the production compiler through tenant transactions. Workspace aliases load current source rather than a previously built `dist` directory. Schedule tests pass the reference clock explicitly; they do not use today's date.

Passing these cases verifies only the listed behavior. It does not prove provider delivery, Novu action timing, DNS, queue recovery, full PostgreSQL compatibility, browser rendering, MIME Bcc removal, or end-to-end tenant isolation. Those remain in the unit, integration, browser and pinned Compose acceptance suites described in [acceptance.md](acceptance.md). Keep real user email content, secrets and customer addresses out of committed eval fixtures.
