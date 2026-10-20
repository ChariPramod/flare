# Development and verification

Use the [repository README](../../README.md) for installation and the [website and backend guide](../product/website-and-backend-guide.md) to find the implementation behind a screen. The repository remains a monorepo; proposed feature-folder and script moves are tracked in [the cleanup plan](../planning/repository-cleanup-plan.md).

| Task                                                            | Guide                                           |
| --------------------------------------------------------------- | ----------------------------------------------- |
| Choose where a unit, integration, browser or lint check belongs | [Test-writing guide](testing.md)                |
| Add optional pytest checks or run Ruff                          | [Python harness](testing-python.md)             |
| Define deterministic product expectations                       | [Product behavior evals](evals.md)              |
| Use or change the SDK, CLI and local MCP server                 | [Developer tools](developer-tools.md)           |
| Update the public API and generated types                       | [HTTP contract](../api/README.md)               |
| Review executed tests and outstanding acceptance gates          | [Acceptance and evidence ledger](acceptance.md) |

Start with the test that demonstrates the behavior being changed, then use the relevant integration or browser harness. Follow the existing commands and prerequisites in the test-writing guide; some suites create disposable Docker services, while public-provider checks require separately configured infrastructure.

For documentation, edit the grouped canonical page, retain old section IDs when renaming headings, then run `pnpm docs:generate` and `pnpm docs:check`. The offline check validates local links and compatibility pages; it does not fetch external URLs. See the [cleanup compatibility contract](../planning/repository-cleanup-plan.md#compatibility-contract).

Keep test instructions here and behavior expectations in the corresponding [product guide](../product/README.md). Record actual outcomes with their revision in [current progress](../../PROGRESS.md) and the acceptance ledger. Historical passes, skipped external checks and proposed acceptance criteria are not evidence that the current revision or a deployed service has passed.
