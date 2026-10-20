# Flare documentation

Start with the [website and backend guide](product/website-and-backend-guide.md) for dashboard navigation, implemented features, services and source locations. Use [current progress](../PROGRESS.md) to see what is being worked on and what remains unverified.

## Find the right guide

| I want to…                              | Reading path                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use the dashboard                       | [Website tour](product/website-and-backend-guide.md) → [product guides](product/README.md)                                                                       |
| Understand the architecture             | [Architecture](architecture/README.md) → [Novu compatibility](architecture/novu-gaps.md)                                                                         |
| Change code or add tests                | [Development](development/README.md) → [test-writing guide](development/testing.md) → [product evals](development/evals.md)                                      |
| Integrate with Flare                    | [API contract](api/README.md) → [SDK, CLI and MCP](development/developer-tools.md)                                                                               |
| Arrange staging accounts                | [Owner checklist](operations/staging/staging-owner-checklist.md) → [dated shopping proposal](operations/staging/staging-shopping-list.md)                        |
| Deploy the dashboard or backend         | [Operations](operations/README.md) → [staging runbook](operations/staging/staging.md) → [Vercel split hosting](operations/staging/vercel.md)                     |
| Operate sending safely                  | [Sender approval and reputation controls](product/sender-reputation.md) → [reliability](operations/reliability.md) → [alerts](operations/monitoring/alerting.md) |
| Recover or upgrade a deployment         | [Deployment and upgrades](operations/deployment.md) → [encrypted backup and isolated restore](operations/recovery/backup-recovery.md)                            |
| See the next work or previous decisions | [Plans](planning/README.md) → [current progress](../PROGRESS.md) → [history](archive/README.md)                                                                  |

## Documentation groups

- [Architecture](architecture/README.md): system boundaries and compatibility decisions.
- [Product](product/README.md): dashboard behavior, email, content, audiences and user-facing operations.
- [Development](development/README.md): tests, evals, developer packages and verification evidence.
- [Operations](operations/README.md): deployment, staging, monitoring and recovery runbooks.
- [Planning](planning/README.md): ordered work and acceptance gates; a plan is not completion evidence.
- [Archive](archive/README.md): the original brief and previous progress records.
- [API](api/README.md): the generated HTTP contract and its update process.
- [Learning memory](memory/README.md): optional storytelling context, not current execution status.

## Status and maintenance

Implementation, local tests, CI and deployed-provider verification are separate claims. Check [current progress](../PROGRESS.md), the [acceptance ledger](development/acceptance.md) and the linked run for the revision you are evaluating. Local Mailpit, Postal fixtures and Docker recovery checks do not prove public DNS, sending reputation or off-host recovery.

Keep behavior with the relevant product guide, commands with the relevant runbook, and checkpoint outcomes in progress and acceptance records. New work should link to these grouped canonical pages. Older document paths remain compatibility pages so existing bookmarks and repository links can still reach their destination. Follow the canonical page when updating content.
