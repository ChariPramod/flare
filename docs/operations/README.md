# Deployment and operations

These runbooks cover the services and infrastructure behind Flare. For the dashboard's Webhooks, Logs and Metrics features, use [product operations](../product/operations.md).

## Prepare and deploy

1. Start with the [owner checklist](staging/staging-owner-checklist.md) for accounts, a domain, host access and secret custody. The [shopping list](staging/staging-shopping-list.md) is a dated proposal; confirm current prices and account-specific Postal support before purchasing.
2. Follow the [staging runbook](staging/staging.md) for the chosen Compose profile, HTTPS, secrets, preflight and public verification.
3. For a Vercel dashboard with a persistent backend, also follow [Vercel split hosting](staging/vercel.md). The dashboard and backend have distinct ingress and recovery requirements.
4. Use [deployment and upgrades](deployment.md) for installation, upgrade and troubleshooting procedures.

## Operate and recover

| Need                                                                  | Runbook                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Approve an organization, configure sending routes or assess readiness | [Sender reputation controls](../product/sender-reputation.md)                                 |
| Understand limits, durable recovery, dead letters and shutdown        | [Reliability](reliability.md)                                                                 |
| Configure alerts and record a response drill                          | [Monitoring and alerting](monitoring/alerting.md)                                             |
| Encrypt backups, arrange custody and restore without sending          | [Backup and recovery](recovery/backup-recovery.md)                                            |
| Check what has actually been exercised                                | [Acceptance evidence](../development/acceptance.md) and [current progress](../../PROGRESS.md) |

Keep executable deployment procedures and their prerequisites here. Future rollout steps belong in [the staging execution plan](../planning/staging-execution-plan.md). Local Compose checks do not complete public DNS/PTR, physical Postal pool isolation, receiver authentication, off-host custody or a real-user pilot; each requires its own recorded evidence.
