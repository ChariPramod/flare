# Editorial UI refinement

Keep Flare's Source Serif 4 headings, DM Sans controls, ivory surfaces and indigo accents. This pass improves density, accessibility and interaction safety across the existing modules without changing HTTP contracts or database schemas.

## Delivery sequence

1. Repair the Linux browser baseline, restore themes before paint, consolidate shell styles and make Overview policy information visible sooner.
2. Preserve unfinished editor content, distinguish table failures from empty results, link field validation and make pending operations clear.
3. Review every sidebar destination, add Linux visual baselines and interaction regressions, refresh the local demo, then verify the pushed commit in CI.

Continue on `codex/frontend-refinement` and PR #2. Preserve unrelated local documentation. Checkpoint evidence belongs in [PROGRESS.md](../../PROGRESS.md); the plan itself is not evidence that a check passed.

## Design contract

- Body text is 15px; table content is 14px; operational metadata is at least 12px. Page headings are 36px on desktop and 30px on mobile; section headings are 22px.
- Use the 4/8/12/16/24/32/48px spacing scale, 24px desktop panels and 16px mobile panels. Keep borders thin and shadows restrained.
- Restore saved light/dark preferences before body paint using the same-origin theme asset. Storage failure must not block login or theme changes.
- Keep normal-text contrast at least 4.5:1, visible keyboard focus, 44px coarse-pointer targets and 16px mobile text-entry controls. Reduced motion disables animation and transitions.
- Preserve module ordering and permissions. Show policy failures before guidance; distinguish provider acceptance, confirmed delivery and uncertain outcomes.

## Interaction contract

Workflows, layouts, translations and templates keep unfinished raw content in memory, scoped to the current user, organization, environment and resource. Invalid JSON remains editable across tabs and step selection. Saving stays explicit. Leaving an editor retains its draft for same-tab return; refresh/closing warns, while explicit discard, successful context switch, logout and confirmed expiry clear applicable drafts. No draft content is written to browser storage.

Table consumers declare whether search applies locally, externally or not at all. Initial loading, empty results, request errors and failed refreshes have distinct states. Contacts has one server-backed search. Dialogs keep their heading reachable and protect pending requests from accidental dismissal. Authentication and preferences expose retryable service failures without treating them as missing data or revoked authority.

## Verification

Run the full checkpoint, browser contracts, Linux visual comparisons and disposable full-stack acceptance. Exercise narrow screens, short laptop heights, 200% zoom, both themes, keyboard controls, delayed/failed requests, retained drafts, save races and native Inbox read persistence. Generate visual references with the pinned [browser runner](../../ops/Dockerfile.browser-tests); review changes rather than automatically accepting a failed comparison.

Public hosting, provider credentials, physical Postal isolation and external deliverability remain separate staging gates.
