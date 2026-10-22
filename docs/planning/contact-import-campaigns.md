# Contact imports and email campaigns

Build on Flare's existing audience, templates and broadcast delivery pipeline. Preserve the editorial dashboard, tenant boundaries, opt-outs, suppressions and sending approval controls.

## Delivery

1. Add bounded CSV, TSV, JSON and Excel `.xlsx` imports with worksheet selection, field mapping, validation preview and atomic writes. Normalize duplicate email addresses and retain existing opt-outs. Keep the legacy CSV API compatible.
2. Save imported cohorts as named contact lists. Lists are isolated by organization and environment and can be selected without accidentally targeting every contact.
3. Expand Broadcasts into a usable campaign flow: choose an audience and sender, compose content or choose a pinned template, save and edit a draft, review eligible/excluded recipients, then explicitly send now or schedule. Inline content editing retains Development/Production restrictions.
4. Cover malformed files, archive limits, duplicate rows, rollback, cross-tenant access, consent, list targeting, draft changes and scheduling. Run the existing quality gates, browser tests and integration checks; update the API contract and navigation guide.
5. Refresh the local demo with existing data preserved. Commit and push a separate feature checkpoint after verification.

## Boundaries

Imports do not grant sending approval or restore consent. Campaign creation and preview do not send mail. Delivery continues through the existing durable marketing pipeline, with preferences rechecked at dispatch. Real provider delivery and public hosting remain separate staging work.

Import content stays out of request logs and browser storage. File parsing is bounded before writes; spreadsheet formulas, external references and unsafe archive expansion are rejected rather than executed.

Progress and actual verification results belong in [PROGRESS.md](../../PROGRESS.md).
