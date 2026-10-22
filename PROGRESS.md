# Flare progress

Updated: 2026-10-22, America/Los_Angeles.

## Current checkpoint — research-driven campaign workbench

- Branch: **`codex/campaign-studio`**, from `45cb4a9`. Work is performed directly without sub-agents. Preserve unrelated local documentation and demo data.
- Research and staged roadmap: [email product research](docs/planning/email-product-research.md), comparing MailSuite, Resend, MailerLite and Postmark official capabilities with mixed public review evidence. Retention explanations are hypotheses, not measured results.
- First implementation: original email starters with replacement confirmation, merge-field insertion, contact-aware server previews sharing dispatch fallback rules, missing-field warnings, desktop/mobile/text views and duplicate-as-draft through the existing idempotent creation path.
- Preview API changes are additive; no migration is required. Existing audience, consent, approval, quota and transport rules remain authoritative. Preview generates no live preference capability and sends no email.
- Build-time advisory follow-up: update Next.js from 16.4.0 to patched 16.4.1; remaining pre-existing package audit findings are tracked as a separate pre-staging task in the research plan.
- **Local verification:** full checkpoint passes with **948 unit/database tests and 25 evals**, documentation, lint, typecheck, generated OpenAPI checks, builds and gitleaks. Installable SDK/CLI/MCP smoke checks pass. The full browser suite passes **129 scenarios** with two Linux-only visual comparisons deferred to CI; all **85 Docker integration tests** pass on the sequential run. Browser coverage includes safe previews, delayed search results, lost-response duplication and unclipped save actions at 390px and 320px.
- **Verification history:** a run concurrent with Docker rebuilding hit one existing five-second upgrade-test timeout and three early broadcast-recovery fixture exits. The original early-exit result was not captured, so no specific application cause is claimed. Preserve clearer recovery-test diagnostics; all four scenarios pass in isolation, ten consecutive repetitions (40 cases), and the subsequent complete integration suite. The upgrade test passes unchanged in the sequential checkpoint. Assertions and timeouts remain intact.
- **Demo:** refreshed API, worker and dashboard while retaining existing volumes, credentials and data. Live login, campaign starters, desktop/mobile/plain-text previews and the additive API response pass; no campaign was saved and no email was sent by these checks. Visually reviewed the 1440px composer and 390px preview and corrected the mobile action footer.
- Delivery is a separate checkpoint on **`codex/campaign-studio`**, stacked on the green contact-import branch. Its own Linux/full-stack CI must pass before merge; the parent run is not evidence for this revision. Later roadmap checkpoints remain planned, not implemented by this entry.
- **CI follow-up:** run `39841682558` passed code/Linux browser, integration, Python and staging checks. Full-stack acceptance failed only the new mixed-preview assertion: the controller's established schema-validation response is `400`, while the fixture expected `422`. Confirm the `400` response and its specific validation message against the live local API, then assert both in acceptance. Runtime validation is unchanged; the corrected branch still requires a fresh green CI run.

## Previous checkpoint — contact imports and campaigns

- Branch: **`codex/contact-campaigns`**, based on frontend checkpoint `60bf814`; preserve unrelated local documentation. Scope is saved in [the implementation plan](docs/planning/contact-import-campaigns.md).
- Add bounded CSV, TSV, JSON and Excel `.xlsx` parsing, worksheet selection, column mapping, validation preview and atomic contact/list imports. Preserve opt-outs, skip deleted contacts, reject unsafe spreadsheet structures and keep source content out of logs.
- Add named tenant-isolated lists and list filtering, campaign draft composition/editing with pinned template versions, recipient eligibility previews, guarded scheduling/cancellation and idempotent campaign creation. Existing delivery approval, suppression, quota and retry protections remain in the shared pipeline.
- **Local verification passed:** full checkpoint rerun with **941 unit/database tests, 25 evals**, documentation, lint, typecheck, generated API checks, builds and gitleaks; installable SDK/CLI/MCP smoke checks; **85 Docker integration tests**, including six new independent-connection campaign concurrency/isolation cases. Changed handwritten files pass formatting. Whole-repository Prettier still reports existing configuration/generated-file differences and preserved local documentation; those unrelated files were not reformatted.
- **Browser evidence:** all five focused import/campaign flows passed. The final complete Chrome run, including the added Inbox lifecycle regressions, passed **124 scenarios**, with two Linux-only visual cases skipped. The initial broad run exposed a queued collapse scroll dismissing the freshly focused sidebar tooltip; synchronizing that test with settled layout passed twelve instrumented repetitions, ten complete tooltip/keyboard assertions and the clean full rerun. Linux visual and full-stack results are reported by the feature PR's CI checks.
- **File-boundary evidence:** eleven isolated child-process cases cover near-2-MiB CSV/JSON at 5,000 rows, 100,000-cell Excel sheets and oversized raw/expanded/row/cell/XML input. Correct an XML-node ceiling that rejected otherwise valid 100,000-cell workbooks. The near-limit XLSX parsed in 311 ms at 244 MiB peak process RSS (including a 149 MiB module baseline); CSV/JSON took 22/13 ms. These are parser measurements, not concurrent service load guarantees. The added boundary regression and related audience/parser suite passed 35 tests.
- **Database import boundary:** a fresh PostgreSQL container imported 5,000 contacts and a named list in 4.40 seconds. Repeating the import created no duplicate contacts or memberships; updates retained all 500 existing opt-outs. Independent observers saw only the complete transaction, and an injected mid-batch database error rolled back contacts, list membership and outbox together. The isolated fixture was removed. This is single-request local evidence, not a deployment throughput guarantee.
- **Hosted acceptance follow-up:** run `39737554767` on `45a3184` passed all 118 Linux browser tests, integration, Python and staging checks. Its new CSV/TSV/JSON/XLSX-to-campaign-to-Mailpit scenario, 12 live browser flows, load, crash recovery and restore checks passed. The aggregate acceptance job failed only the existing signed-forwarding fixture's first request (503 after a liveness check). The fixture now waits for unsigned `/ready` before generating a proof and reports only allowlisted proxy-error metadata. This addresses a Redis startup-readiness race without retrying signed probes or changing production replay protection; the exact original response classification was not logged. The corrected native fixture passed twice against a fresh isolated PostgreSQL/Redis/MinIO/API stack, alongside all 19 forwarding security unit tests; disposable containers and volumes were removed. Run `39741340204` on `d41aa37` then passed the complete acceptance job, including signed forwarding, all four import formats through campaign/Mailpit delivery, 12 live browser flows, load, crash recovery and restore. Integration, Python and staging configuration also passed; the browser selector failure below kept the aggregate run red. The final Inbox follow-up still requires its own green PR checks.
- **Browser selector follow-up:** the subsequent run on `d41aa37` passed 117 browser cases but exposed a failed-login assertion matching both the actual error and Next.js's empty route-announcement alert. Scope the assertion to the login main region and exact `Invalid credentials` text, retaining URL, no-expiry and zero-session-probe checks. All other alert selectors were already scoped. Five session-expiry cases passed five repetitions (25 test runs); no application or authentication behavior changed.
- **Inbox lifecycle follow-up:** the next complete local browser run exposed an intermittent third bootstrap. Instrumented repetition reproduced two initial native session requests from one access-token read and one socket; explicit reconnect itself added exactly one request. The pinned SDK constructed its client during an abandoned React render. A narrowly registered ESM/CommonJS provider patch moves construction after commit, retains configuration/error boundaries and bounds retired-client cleanup. Eight deterministic real-React browser cases pass; the same abandoned-Suspense regression fails against the unpatched SDK with two constructors before commit. All 17 focused lifecycle/Inbox cases and 20 repeated reconnect cases passed with exact bootstrap counts retained; see [the patch contract and removal gate](docs/architecture/novu-gaps.md#inbox-react-lifecycle-patch). The complete local checkpoint passed again (941 unit/database tests, 25 evals, lint, typecheck, OpenAPI, build and gitleaks); the final complete Chrome rerun passed 124 scenarios with two Linux-only visual comparisons skipped locally. The final pushed revision still needs its Linux and full-stack CI checks.
- **Local demo refreshed:** rebuilt API, worker, relay and dashboard, applied additive migration `0019`, and retained all existing demo volumes. All services are healthy. Authenticated live API checks passed contact-list/contact reads and CSV/TSV/JSON/XLSX previews without importing or sending. The local Mailpit route now permits loopback HTTP preference links only when both configured and actual transports are validated sandbox adapters; real sending retains HTTPS requirements. Evidence is under ignored `.tools/contact-campaign/`.
- **Final CI:** `45cb4a9` passed all five jobs in [run 39745096280](https://github.com/ChariPramod/flare/actions/runs/39745096280). PR #3 is ready for review; the final Inbox patch is included.
- **Delivery:** implementation `2c1df29` is pushed in [PR #3](https://github.com/ChariPramod/flare/pull/3), stacked on the frontend branch. The PR's required CI checks are the source of hosted acceptance evidence, including the new disposable API-to-Mailpit campaign scenario. Local counts above do not substitute for those checks or real-provider delivery.
- Updated [the audience guide](docs/product/audience.md) and [the website/backend tour](docs/product/website-and-backend-guide.md). Real provider delivery remains a separate staging gate.

## Previous checkpoint — frontend refinement

- **Implementation complete:** [the approved refinement plan](docs/planning/ui-refinement.md) now covers shared typography/spacing, pre-paint light/dark themes, responsive navigation and a policy-first Overview. Workflows, layouts, translations and templates retain raw drafts in memory through navigation and failed saves. Tables distinguish loading, empty results and failed refreshes; Contacts uses one server-backed search. Forms, dialogs, authentication and preferences expose linked feedback and guarded pending actions. HTTP APIs and database schemas remain unchanged.
- **Checkpoints:** foundations were pushed as `ec3279b`; interaction safety as `8375ba8`. The final checkpoint adds ten reviewed Linux x64 visual references, themed canvas controls, longer Inbox-feed regression coverage and a save/read race fix found during independent review. The latter was reproduced against the prior code: an accepted save incorrectly displayed an intervening older server version after a failed refresh.
- **Local code verification passed:** formatting, documentation links, lint, typecheck, OpenAPI, **904 unit/database tests, 25 evals**, production builds, SDK/CLI/MCP package installation and gitleaks. All **79 Docker integration tests** pass. The full Linux browser run passed **112 scenarios**, including every sidebar module in both themes at desktop/mobile widths; the Chrome run passed 110 with the Linux-only visual cases skipped. The expanded **15-case editor suite and both visual comparisons passed on Linux x64**. All ten final visual references passed a repeated x64 comparison after the canvas contrast correction. A clean staged snapshot passes the documentation guard: 74 Markdown files, 28 compatibility pages, 587 local links and 192 retained historical anchors.
- **Disposable full-stack evidence:** migrations/upgrade, native Novu/Postal and gateway scenarios, load/queue-loss/dispatcher-crash checks, isolated restore and encrypted split-profile restore completed. The initial live suite passed 11/12; its Inbox viewport assertion targeted an older notification below the internal scroll area. After fixing that test to scroll, the real Inbox flow passed, including read-state persistence after reload. The aggregate original run retains its failed status; the clean pushed CI acceptance run is the final gate. The 180-second mixed workload handled 1,802 requests (92 expected throttles), with 171 emails, 18 inbound receipts and nine Inbox operations; sampled API RSS peaked near 273 MiB. This remains simulated/local provider evidence.
- **Visual and diagnostic evidence:** ten references cover Overview, login, a workflow table, editor and dialog in both themes. The pinned runner uses Linux x64 to match CI. Fixture failures retain traces/screenshots/reports; native Inbox failures retain only bounded operation/method/status metadata, without credentials or DOM/network traces. Logs are under ignored `.tools/ui-refinement/`. Navigation and test-writing guidance is updated in the [website/backend tour](docs/product/website-and-backend-guide.md) and [testing guide](docs/development/testing.md).
- **Delivery gate:** preserve unrelated local documentation and demo data. The isolated local dashboard was rebuilt and restarted with demo data preserved. Real-backend browser review passed for Overview in both themes, the workflow canvas and mobile Metrics/Overview; Metrics measures 390px content in a 390px viewport. It is healthy at `http://127.0.0.1:3000`. Check the final pushed revision in [PR #2 checks](https://github.com/ChariPramod/flare/pull/2/checks) before merging; this pull request remains stacked on `codex/docs-organization`. The earlier `8375ba8` CI documentation failure was caused by a plan link to the then-uncommitted browser Dockerfile; the final checkpoint includes that file and checks a clean staged snapshot.

### Earlier frontend checkpoints

- **Corrected redesign CI status:** `7a89de6` failed run `39554695041` on Metrics overflow at 390px, intermittent dark-entry contrast and native Inbox mark-read timing. The exact 9px overflow was reproduced in pinned Linux Chromium. The refinement retains the 4.5:1 contrast threshold, removes theme-color transition races and bounds the Inbox popup without recreating its session. Earlier local passes were not evidence of green CI.

- **Editorial redesign, following the supplied visual reference:** warm ivory and deep indigo replace the orange palette; locally bundled Source Serif 4 headings and DM Sans body/control text replace system-only typography. Thin borders, restrained corners, larger type and quieter spacing run through the shared shell, all module pages, tables, forms, dialogs, charts and workflow/automation canvases. Login, invitations and public preferences share the design; Monaco follows theme changes. Font versions and OFL licenses live beside their assets in `apps/web/app/fonts/`.
- **Redesign verification passed:** full checkpoint with **904 unit/database tests and 25 evals**, documentation links, lint, typecheck, OpenAPI, build and gitleaks; **73 Chrome browser scenarios**. The five design regressions also passed a final focused rerun after extending the route sweep to all **25 modules at 1440px and 390px**. Additional checks cover real local font responses, login/invite/preferences at 320/390/768px, populated tables and workflow editing at 390/768/1440px, live Monaco theme changes, contrast and reduced motion. Logs and screenshots are under ignored `.tools/editorial-redesign/` and `test-results/`.
- **Previous frontend checkpoint `3ccba77`: all five CI jobs passed** in run `39530007384` (check, integration, acceptance, Python and staging configuration). This redesign continues on the same stacked frontend pull request; its own CI must be checked after pushing.
- Branch: **`codex/frontend-refinement`**, based on the documentation checkpoint `0a5aa3d`. Preserve the separate documentation branch and existing local demo/story files.
- Refine the shared visual system, Overview, navigation and tables while retaining all 25 sidebar modules, role/environment boundaries and existing APIs. Overview offers a context-sensitive next step, manual refresh with honest freshness/error states, held/failed filters and recent-email outcomes. Provider acceptance remains separate from delivery.
- Add keyboard-driven grouped page search with descriptions and keywords, a mobile search action, focus restoration and storage-safe sidebar/theme preferences. Shared tables gain page-size controls, clear-search actions, accurate loaded-result ranges and distinct empty/no-match states while preserving independent URL state and remote inbound pagination.
- Fix expired sessions stranded in the authenticated shell. A rejected request asks the session endpoint to confirm expiry before redirecting; an independent provider/transfer rejection must retain a valid login. Cover query, direct mutation and transfer paths in browser regressions.
- **Prior checkpoint verification:** full checkpoint with **904 unit/database tests, 25 evals**, documentation links, lint, typecheck, OpenAPI, build and gitleaks; **68 Chrome browser scenarios**, including 20 new navigation, table, Overview and session regressions. Initial sandbox socket restrictions and the absent Playwright Chromium binary were resolved by allowing local servers and using installed Chrome. Two older browser assertions were updated for exact section names and the explanatory login URL; the complete rerun is green.
- Rebuilt and restarted only the isolated **`flare-demo` dashboard with the editorial redesign**, preserving all data/backend services. It is healthy at `http://127.0.0.1:3000`. Visually checked the 1440px Overview and real workflow canvas, populated dark-theme email rows and 390px phone layout (390px content/viewport width); restored the normal viewport and light theme. New screenshots/logs are under ignored `.tools/editorial-redesign/`; the earlier functional refinement evidence remains under `.tools/frontend-refinement/`. This is not a new full-stack restore/load rehearsal.
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
