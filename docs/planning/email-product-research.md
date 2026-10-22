# Flare email product research and execution plan

Researched October 22, 2026. Implementation starts on `codex/campaign-studio`, from green checkpoint `45cb4a9`. Work is performed directly by the primary agent, without delegated agents.

## Product direction

Make Flare useful for both the person writing a campaign and the developer operating email. The recurring job is: bring contacts in → prepare a relevant message → review the recipients and content → send deliberately → understand what happened → decide the next action.

Flare already has imported lists, segments, versioned templates, campaigns, schedules, durable delivery, tracking, suppressions, an event outbox, inbound mail, workflows, an SDK/CLI/MCP server and operator policy. The best next investment is making these capabilities easier to use together. This is an incremental product plan, not a replacement stack or a claim of provider parity.

## Research method and limits

Use official product documentation for capabilities and public user reviews for perceived value and friction. Read positive and negative examples, including review-source labels. G2/Capterra include incentivized and vendor-invited reviews; Reddit is anecdotal and can contain promotion; Resend's Trustpilot profile has a small, complaint-heavy sample. No source here establishes representative retention rates, independent deliverability rankings or why every customer stays. The retention explanations below are product hypotheses to test with Flare users. Vendor guarantees and review allegations are not adopted as verified facts.

## What to learn from each platform

| Platform              | Documented strengths and review themes                                                                                                                                                                                                                                        | Why someone may return — hypothesis                                                                       | Implication for Flare                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MailSuite / Mailtrack | Gmail-integrated tracking, per-recipient activity, mail merge and follow-up reminders. Reviews value familiar workflows, Google Sheets integration and straightforward templates. Friction includes setup, paid-feature limits, upgrade prompts and opaque account decisions. | It helps answer “what happened to my email, and who needs attention?” without rebuilding a daily routine. | Make personalization and recipient outcomes accessible; add reviewable follow-up tasks later. A Gmail extension is a separate integration project.                                         |
| Resend                | Developer-oriented API/SDKs, templates, broadcasts, events and testing. Its newer editor improves reusable styles, variables and content authoring. Developer discussions praise quick setup; sampled negative reviews describe unclear restrictions and slow support.        | Fast first success plus good debugging reduces ongoing engineering work.                                  | Retain simple APIs and reproducible drafts, improve previews and actionable diagnostics, and explain approval/hold state clearly.                                                          |
| MailerLite            | Multiple editing modes, mobile/desktop previews, personalization and automation. Reviewed users often value ease of editing, affordability and helpful support; others report editor friction, automation limits and changes to free tiers.                                   | A small team can repeatedly publish useful campaigns without specialist help.                             | Add useful starting content, field insertion, responsive previews and campaign reuse before attempting a complex canvas.                                                                   |
| Postmark              | Explicit transactional/broadcast streams and delivery diagnosis. Reviews praise setup, clear statistics and dependable transactional use; some mention pricing and support response time.                                                                                     | Trust and understandable failures matter for business-critical messages.                                  | Keep acceptance distinct from delivery and preserve traffic boundaries, ambiguous-outcome quarantine and clear recovery actions. Physical resource isolation still needs staging evidence. |

Sources supporting the table:

- MailSuite [official features](https://mailsuite.com/en/?library=true), [G2 user examples and source labels](https://www.g2.com/sellers/mailsuite), [Capterra review themes](https://www.capterra.com/p/164512/MailTrack/) and [a negative account-decision review](https://www.g2.com/products/mailsuite-mailtrack/pricing).
- Resend [API](https://resend.com/features/email-api), [editor release](https://resend.com/changelog/introducing-the-new-email-editor), [test-event documentation](https://resend.com/docs/dashboard/emails/send-test-emails), [developer discussion](https://www.reddit.com/r/webdevelopment/comments/1rv7q28/what_email_api_is_the_easiest_to_set_up/) and [mixed Trustpilot reviews](https://www.trustpilot.com/review/resend.com). Individual suspension complaints are reported experiences, not an independently established explanation of provider decisions.
- MailerLite [editor choices](https://www.mailerlite.com/features/newsletter-editors), [preview/test workflow](https://www.mailerlite.com/help/drag-and-drop-editor) and [Capterra reviews, including incentive labels](https://www.capterra.com/p/136603/MailerLite/reviews/).
- Postmark [Message Streams](https://postmarkapp.com/message-streams), [G2 review examples](https://www.g2.com/products/activecampaign-postmark/reviews?page=2&qs=pros-and-cons) and [reviewed tradeoffs](https://www.g2.com/products/activecampaign-postmark/pricing).

## Current implementation and real gaps

| Job                   | Already in Flare                                                                              | Gap to address                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Bring an audience in  | CSV/TSV/JSON/XLSX mapping, atomic imports, named lists, opt-out preservation                  | Import history/reusable mappings and provider integrations are later improvements. |
| Write relevant emails | Raw HTML/text, pinned templates and scalar merge variables                                    | Discoverable variables, useful starters, representative previews and simple reuse. |
| Send safely           | Recipient eligibility, deliberate confirmation, scheduling/cancellation, quotas and approvals | One coherent preflight explanation and a separate controlled test-send action.     |
| Understand delivery   | Message timeline, recipient states, tracking events, provider diagnostics                     | Searchable campaign-recipient report, filters and safe exports.                    |
| Follow up             | Durable automations and inbound MIME                                                          | Reliable reply correlation, task ownership and stop-on-reply rules.                |
| Develop and operate   | OpenAPI, SDK, CLI, MCP, logs, webhooks and recovery                                           | Contextual examples, a guided sandbox and explanation of blocked work.             |

Code inspected: `campaign-pages.tsx`, `campaigns.ts`, `broadcasts.ts`, the audience controller, shared template renderer, import/browser acceptance and current progress. A feature appearing in a sidebar is not automatically proof that all its proposed refinements are complete.

## Execution order

### Checkpoint A — campaign workbench

Implemented in this checkpoint. See [the current verification record](../../PROGRESS.md) for local checks and the separate CI/deployment status. Checkpoints B–E below remain planned.

1. Three original starter emails: product update, event invitation and personal announcement. Applying one requires confirmation before replacing content; audience/sender remain intact. No competitor copy or branding.
2. A merge-field picker for recipient name/email and configured contact properties. Insert into the focused subject, HTML or text field without discarding existing content.
3. Server-rendered personalized preview using sample values or a selected contact in the current environment. Use the same property fallback and recipient precedence as actual dispatch. Show unresolved/empty values rather than pretending the preview validates the whole audience.
4. Desktop, mobile and plain-text preview modes. Keep scripts, forms and automatic remote assets disabled. State clearly that browser previews are not Gmail/Outlook rendering certification.
5. Duplicate any visible campaign into a new unscheduled draft with its pinned content/audience choices. Opening duplication creates nothing; explicit save uses the existing idempotent creation path. Never copy recipients' execution state, scheduling, IDs or old idempotency keys. Revalidate selectors and eligibility when saved/scheduled.
6. Preserve in-memory drafts, role/environment restrictions, failed-save recovery and stale-response guards. Existing APIs stay compatible; preview additions are additive. No database migration is needed for this checkpoint.

Acceptance: empty and false/zero personalization values; escaped hostile values; cross-tenant/deleted contact denial; fallback parity; no preview writes/sends or live unsubscribe capabilities; late preview responses cannot replace newer content; starter confirmation; correct caret insertion; duplicate remains a draft and retries create one copy; keyboard/mobile views and retained edits. Run full checkpoint checks and browser tests, update docs/progress, push a distinct reviewable checkpoint and refresh the local demo without deleting data.

### Checkpoint B — preflight and controlled test sends

- Consolidate sender ownership, transport readiness, organization approval, marketing route, quota, content and audience exclusions into a readable checklist with links to fixes. Distinguish blockers from warnings; recheck on the server at dispatch.
- Send a deliberately requested test to a small explicit recipient set through the shared pipeline. Keep it outside the campaign audience snapshot, tag it as a test, preserve idempotency/quotas/suppressions, and prevent test preference links from modifying another contact. Preview never sends automatically.
- Add a “first email” sandbox path and contextual API examples with placeholders, not real keys. Use Mailpit/simulated events until real provider configuration exists.

Acceptance: no audience fan-out from a test; no approval or quota bypass; exact retry identity; role/scope denial; clear sandbox vs real-send labels; safe example copying and redacted logs.

### Checkpoint C — actionable campaign results

- Paginated recipient timeline with delivered, accepted, held, deferred, bounced, complained, suppressed and unknown outcomes. Show provider evidence only when available.
- Filtered CSV exports with tenant isolation, bounded streaming, spreadsheet-formula protection and explicit data scope. This also makes external analysis/CRM use easier; [Resend documents export workflows](https://www.resend.com/changelog/exports-general-availability).
- Link failure/hold reasons to the existing operational recovery pages. Show a campaign's current policy and quota state without exposing credentials.
- Treat opens/clicks as observed signals, not proof of reading or buying intent. Apple Mail Privacy Protection can obscure opens ([Apple](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/)); scanners and proxies complicate interpretation. Do not automatically resend merely because an open was not recorded.

Acceptance: duplicate/out-of-order events, unavailable denominators, scanner signals, cross-tenant export attempts, spreadsheet injection and stable pagination during new events.

### Checkpoint D — follow-up workspace

- Manual follow-up reminders first: due date, assignee, contact, source message/campaign, completed/snoozed state and an in-app queue. Keep reminders out of the recipient's message thread.
- Then optional sequences using existing durable automations, with explicit consent, contact-level frequency limits, unsubscribe checks and stop-on-reply.
- Build trustworthy inbound reply correlation from Message-ID/In-Reply-To/References before promising reply-aware automation. Unknown or ambiguous matches stay visible for manual review.

Acceptance: no duplicate reminder on retries, cancellation and restart safety, opt-outs stop future mail, ambiguous reply does not modify unrelated contacts, no inferred reply from an open event.

### Checkpoint E — richer authoring and integrations

- A small, versioned block editor (text, heading, image, button, divider) with accessible controls, undo/redo and preserved HTML escape hatch; keep editable source separate from compiled HTML.
- Shared brand styles and approved reusable layouts. Publication pins dependencies; editing a shared template cannot change an already accepted campaign.
- Evaluate Google Sheets/Gmail/Outlook imports/connectors only after a pilot confirms demand and required OAuth scopes are reviewed. No account linking or external provider subscription is part of this task.
- Consider A/B experiments after cohort locking, stop rules and meaningful result attribution exist. Avoid declaring a winner from noisy open pixels alone.

## Product validation

Measure first successful import-to-draft time, first preview time, campaign reuse, draft abandonment, errors corrected before scheduling and recurring weekly campaign use. Define events without storing outgoing content or full contact data. Establish a local/demo baseline, then compare with a consented pilot; do not invent conversion or retention improvements.

A useful first usability test is a non-developer importing a small consented list, personalizing an update, previewing two contacts, creating a duplicate draft and explaining the difference between accepted and delivered. Record where they hesitate before adding more modules.

## Boundaries and delivery

No hosting purchase, Gmail extension, scraped lead acquisition, live customer emailing, real-provider deliverability guarantee or full visual editor is implied by Checkpoint A. Existing sending protection remains authoritative. Keep unrelated local documentation intact. Each subsequent checkpoint is a separate implementation and verification unit, with this document updated as actual evidence arrives.

## Dependency finding during implementation

The build surfaced newly indexed Next.js advisories affecting the installed 16.4.0. This checkpoint updates to 16.4.1, the patched release listed for [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and [typed-array cache handling](https://github.com/advisories/GHSA-673q-mjm6-r5xr). Re-run the full web checks after the patch; a previous passing build is not security evidence.

The broader package audit also reports existing findings in transport, database, test tooling and transitive packages (including Nodemailer, Drizzle, Tinypool, braces and DOMPurify). They are not represented as fixed by this product checkpoint. Add a dedicated compatibility-tested dependency upgrade/triage checkpoint before external staging, including reachability, available patches and any no-fix advisory. The raw reports remain in ignored local evidence; never publish credentials or environment files with diagnostic artifacts.
