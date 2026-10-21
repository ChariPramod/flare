# Flare progress

Updated: 2026-10-20, America/Los_Angeles.

## Current work — frontend refinement

- Branch: **`codex/frontend-refinement`**, based on the documentation checkpoint `0a5aa3d`. Preserve the separate documentation branch and existing local demo/story files.
- Refine the shared visual system, Overview, navigation and tables while retaining all 25 sidebar modules, role/environment boundaries and existing APIs. Overview offers a context-sensitive next step, manual refresh with honest freshness/error states, held/failed filters and recent-email outcomes. Provider acceptance remains separate from delivery.
- Add keyboard-driven grouped page search with descriptions and keywords, a mobile search action, focus restoration and storage-safe sidebar/theme preferences. Shared tables gain page-size controls, clear-search actions, accurate loaded-result ranges and distinct empty/no-match states while preserving independent URL state and remote inbound pagination.
- Fix expired sessions stranded in the authenticated shell. A rejected request asks the session endpoint to confirm expiry before redirecting; an independent provider/transfer rejection must retain a valid login. Cover query, direct mutation and transfer paths in browser regressions.
- **Local verification passed:** full checkpoint with **904 unit/database tests, 25 evals**, documentation links, lint, typecheck, OpenAPI, build and gitleaks; **68 Chrome browser scenarios**, including 20 new navigation, table, Overview and session regressions. Initial sandbox socket restrictions and the absent Playwright Chromium binary were resolved by allowing local servers and using installed Chrome. Two older browser assertions were updated for exact section names and the explanatory login URL; the complete rerun is green.
- Rebuilt and restarted only the isolated **`flare-demo` dashboard**, preserving all data/backend services. It is healthy at `http://127.0.0.1:3000`. Visually checked 1440px desktop, 390px phone (no horizontal overflow), dark-theme email rows, keyword navigation, filtering and page size using real local APIs; restored the normal viewport and light theme. Local screenshots/logs are under the ignored `.tools/frontend-refinement/` folder. This is not a new full-stack restore/load rehearsal.
- Delivery uses this frontend branch and a stacked pull request against `codex/docs-organization`. Its CI result must be checked independently; the baseline documentation run is not evidence for these application changes.

### Frontend follow-through

1. Review this frontend checkpoint and its CI results, then merge the documentation base before the frontend branch.
2. Rehearse the module-by-module demo using the refreshed local application. Keep real-provider readiness limitations visible.
3. Continue staging account/domain setup and real Email + Inbox validation below. UI refinement does not establish public DNS, Postal pool isolation or external deliverability.

## Previous checkpoint — documentation organization

- Branch: **`codex/docs-organization`**, based on `db4f0a4`. This checkpoint reorganizes documentation; source feature folders and script relocation remain later work in [the cleanup plan](docs/planning/repository-cleanup-plan.md).
- Added [task-based documentation indexes](docs/README.md), grouped canonical guides and the [website/backend tour](docs/product/website-and-backend-guide.md). Legacy document paths and section anchors are retained through generated compatibility pages; repository Markdown links point to canonical guides.
- Full previous progress is preserved in [the archive](docs/archive/progress-through-2026-10-19.md), including original failure reports, dated pending checks and test counts. Old section links at the end of this handoff lead to their historical context.
- Added an offline documentation guard for compatibility-page drift, local targets/fragments and **192 original anchors** across 29 paths, wired into the standard checkpoint and CI. A heading rename cannot regenerate away an old bookmark without retaining an explicit alias.
- **Local cleanup verification passed:** 73 Markdown files, 28 compatibility pages and 580 local links; all seven guard regressions; full checkpoint with **897 unit/database tests, 25 evals**, lint/types/OpenAPI/build/gitleaks. Independent review confirmed all 171 moved headings, 35 fenced examples and 20 historical progress section anchors are preserved. The staged snapshot passes without unrelated local story files. No application/runtime files changed; container/browser acceptance is left to the existing pull-request CI jobs for this docs/tooling-only change.
- Delivery uses the cleanup branch and a reviewable pull request; require its independent CI checks before merging. Do not treat the baseline implementation run below as CI evidence for this documentation revision.
- Existing local `AGENTS.md` and story-memory edits are preserved and excluded from this cleanup commit.

## Last verified implementation

**`db4f0a4` is pushed to main.** [CI 39343365896](https://github.com/ChariPramod/flare/actions/runs/39343365896) passed all five jobs; the exact revision and job conclusions were rechecked before this cleanup.

The application includes authentication/MFA and operator policy, workflows/subscribers/Inbox, durable mail and inbound processing, audiences/broadcasts/automations, content/publication, operations and developer packages. Signed forwarding, direct transfers, private Inbox HTTP/WebSocket gateways, split-host ingress and recovery profiles are implemented. The monorepo and existing PostgreSQL/authentication stay in place; Supabase migration is not part of the current work.

Local checkpoint evidence: **890 unit/database tests, 25 evals, 79 integration tests, 48 browser contracts, 12 live browser flows, 45 Python tests with four external skips**, plus lint/types/OpenAPI/build/gitleaks, package checks, local full-stack/load/upgrade/recovery. The split-profile encrypted restore covered nine volumes. See [the acceptance ledger](docs/development/acceptance.md) and [the detailed archived checkpoint](docs/archive/progress-through-2026-10-19.md#current-checkpoint--split-host-ingress-recovery-and-inbox-websocket-safety-2c) for measurements and excluded attempts.

## Deployment boundary and next actions

The next product milestone is real staging validation, then a small Pareto Labs pilot. Local tests establish controlled behavior; they do not establish external deliverability or operating readiness.

1. Review this documentation checkpoint and its branch CI; follow the cleanup plan for subsequent source/script moves.
2. Arrange accounts, host, region, domain and DNS; confirm Postal outbound port 25 and PTR control. Use the [owner checklist](docs/operations/staging/staging-owner-checklist.md) and [dated shopping proposal](docs/operations/staging/staging-shopping-list.md).
3. Deploy the persistent backend and optional Vercel dashboard using [staging](docs/operations/staging/staging.md) and [Vercel](docs/operations/staging/vercel.md). Keep exact origins, private services and credentials scoped correctly.
4. Verify real Postal Email + Inbox with password/MFA: public DNS, physical sending resources, receiver authentication and authenticated feedback. Public hosting, inbox placement and these provider checks remain unverified.
5. Prove [off-host encrypted recovery](docs/operations/recovery/backup-recovery.md), key custody, real alerts and host upgrade/rollback/reboot behavior, then release a limited pilot. Follow the [ordered staging plan](docs/planning/staging-execution-plan.md).

No infrastructure was purchased or deployed by this cleanup. External SES/SNS, SMS/push/chat and OIDC provider checks remain separate from the Email + Inbox pilot.

## Historical section links

The following anchors preserve older links to this file. Their records are historical, not active work queues. Edit current status above; consult the archive for original evidence. Source line numbers change during cleanup, so prefer these section links.

<a id="current-checkpoint--split-host-ingress-recovery-and-inbox-websocket-safety-2c"></a>

- [Current checkpoint — split-host ingress, recovery and Inbox WebSocket safety (2c)](docs/archive/progress-through-2026-10-19.md#current-checkpoint--split-host-ingress-recovery-and-inbox-websocket-safety-2c)

<a id="previous-checkpoint--direct-transfers-and-private-inbox-2b"></a>

- [Previous checkpoint — direct transfers and private Inbox (2b)](docs/archive/progress-through-2026-10-19.md#previous-checkpoint--direct-transfers-and-private-inbox-2b)

<a id="previous-checkpoints--dashboard-polish-and-signed-forwarding"></a>

- [Previous checkpoints — dashboard polish and signed forwarding](docs/archive/progress-through-2026-10-19.md#previous-checkpoints--dashboard-polish-and-signed-forwarding)

<a id="previous-checkpoint--deployment-recovery-and-alerting"></a>

- [Previous checkpoint — deployment recovery and alerting](docs/archive/progress-through-2026-10-19.md#previous-checkpoint--deployment-recovery-and-alerting)

<a id="previous-checkpoint--2026-10-16-staging-execution-and-broadcast-recovery"></a>

- [Previous checkpoint — 2026-10-16: staging execution and broadcast recovery](docs/archive/progress-through-2026-10-19.md#previous-checkpoint--2026-10-16-staging-execution-and-broadcast-recovery)

<a id="previous-checkpoint--2026-10-16-publication-pacing-and-operator-expiry-audit"></a>

- [Previous checkpoint — 2026-10-16: publication, pacing and operator expiry audit](docs/archive/progress-through-2026-10-19.md#previous-checkpoint--2026-10-16-publication-pacing-and-operator-expiry-audit)

<a id="previous-checkpoint--2026-10-16-wait-entry-timing-and-staging-purchase-proposal"></a>

- [Previous checkpoint — 2026-10-16: wait entry timing and staging purchase proposal](docs/archive/progress-through-2026-10-19.md#previous-checkpoint--2026-10-16-wait-entry-timing-and-staging-purchase-proposal)

<a id="previous-verified-checkpoint--2026-10-16-atomic-automation-recovery"></a>

- [Previous verified checkpoint — 2026-10-16: atomic automation recovery](docs/archive/progress-through-2026-10-19.md#previous-verified-checkpoint--2026-10-16-atomic-automation-recovery)

<a id="previous-verified-checkpoint--2026-10-16-audit-hardening"></a>

- [Previous verified checkpoint — 2026-10-16: audit hardening](docs/archive/progress-through-2026-10-19.md#previous-verified-checkpoint--2026-10-16-audit-hardening)

<a id="previous-verified-checkpoint--2026-10-16"></a>

- [Previous verified checkpoint — 2026-10-16](docs/archive/progress-through-2026-10-19.md#previous-verified-checkpoint--2026-10-16)

<a id="previous-checkpoint--2026-10-15"></a>

- [Previous checkpoint — 2026-10-15](docs/archive/progress-through-2026-10-19.md#previous-checkpoint--2026-10-15)

<a id="phase-status"></a>

- [Phase status](docs/archive/progress-through-2026-10-19.md#phase-status)

<a id="checkpoint-log"></a>

- [Checkpoint log](docs/archive/progress-through-2026-10-19.md#checkpoint-log)

<a id="known-issues-and-verification-limits"></a>

- [Known issues and verification limits](docs/archive/progress-through-2026-10-19.md#known-issues-and-verification-limits)

<a id="github-delivery"></a>

- [GitHub delivery](docs/archive/progress-through-2026-10-19.md#github-delivery)

<a id="next"></a>

- [Next](docs/archive/progress-through-2026-10-19.md#next)

<a id="completed-acceptance-checkpoint--2026-10-14"></a>

- [Completed acceptance checkpoint — 2026-10-14](docs/archive/progress-through-2026-10-19.md#completed-acceptance-checkpoint--2026-10-14)

<a id="next-work-that-does-not-require-hosting"></a>

- [Next work that does not require hosting](docs/archive/progress-through-2026-10-19.md#next-work-that-does-not-require-hosting)

<a id="larger-roadmap--deployment-validation-and-internal-pilot"></a>

- [Larger roadmap — deployment validation and internal pilot](docs/archive/progress-through-2026-10-19.md#larger-roadmap--deployment-validation-and-internal-pilot)

<a id="acceptance-execution-history"></a>

- [Acceptance execution history](docs/archive/progress-through-2026-10-19.md#acceptance-execution-history)
