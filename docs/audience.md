# Audience, templates and broadcasts

Contacts, typed properties, segments, audience topics, templates and broadcasts belong to one organization/environment. Composite foreign keys and forced tenant policies prevent cross-environment references. Suppression remains organization-wide. Audience contacts are separate from Novu subscribers; audience topics are distinct from notification fan-out topics.

## Contacts and preferences

`/v1/contacts` supports upsert, paged search and segment filtering. Contact detail supports updates, soft deletion, topic preferences and signed preference-link creation. `/v1/contact-properties` defines string, number, boolean or date properties with validated fallbacks. Define properties before importing values. Segment rules support all/any matching, equality, inequality, containment, numeric comparison and existence; values are bound SQL parameters.

CSV preview/import accepts at most 2 MiB, 5,000 contacts, 100 columns and 4,000 characters per cell. Map source headers to email, first_name, last_name, unsubscribed or properties.NAME. Imports validate and commit atomically. Case-insensitive duplicate addresses use the last row's fields while preserving any opt-out. Imports never re-subscribe contacts and retain names whose columns were not mapped.

Preference links are signed bearer capabilities, scoped to one contact and environment, and expire after one year. Anyone with a link can change that contact's broadcast preferences; do not distribute them outside the recipient's email. Request logs redact the token. The public page requires no dashboard session. Global opt-out overrides topic defaults and explicit topic choices. Opt-out does not remove organizational bounce/complaint suppressions, or change transactional notification preferences.

Broadcast MIME includes List-Unsubscribe and List-Unsubscribe-Post, with both fields covered by DKIM. The one-click endpoint accepts URL-encoded or multipart `List-Unsubscribe=One-Click` POST bodies without cookies; GET does not unsubscribe. Production requires HTTPS PUBLIC_API_URL and WEB_ORIGIN, following [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html). Mailbox-provider interoperability still needs live validation.

## Versioned templates

`/v1/templates` creates a named identifier; `/v1/templates/:id/versions` appends immutable subject/HTML/plain-text/variable-fallback content. Editing is limited to Development. Select a version for preview or direct email submission with `template: { id, version, variables }`. Omitting version pins the current version during submission. Idempotency hashes the original validated request before resolving templates, so a replay retains its original message even after the template changes.

The renderer supports scalar `{{variable}}` and nested `{{payload.name}}` lookups with HTML escaping. It does not execute JavaScript, helpers, partials or arbitrary React components. Broadcast HTML must contain `{{{FLARE_UNSUBSCRIBE_URL}}}`; the generated URL is still escaped. The dashboard preview blocks scripts and remote assets.

Workflow email control values may reference `templateId` and optional `templateVersion`. Flare copies that version's subject and HTML into the saved workflow; Novu performs subscriber/payload interpolation at execution. Template fallback variables are for Flare email rendering, not injected into Novu. Re-save a workflow to select changed content. Publication support for template definitions is part of the following checkpoint.

## Broadcast delivery

Create/edit drafts at `/v1/broadcasts`, pinning a template version, sender, optional segment/topic and rate of 1–50 messages per second. Scheduling accepts the shared ISO/timezone or natural-language schedule format. Scheduling requires a verified sending domain and honors immutable API-key domain scope. Audience membership is frozen atomically at scheduling; rescheduling a not-yet-started campaign rebuilds the snapshot.

Workers claim a broadcast in PostgreSQL and process at most one rate-sized chunk per second. Each recipient's message and campaign progress commit together. PostgreSQL is authoritative; queue entries can be reconstructed after Redis loss. Preferences, deleted contacts, topic opt-outs and organization-wide suppressions are checked at submission and again before delivery. Property fallbacks fill absent/null values.

Canceling prevents future audience submissions and cancels queued messages that have not started delivery. An active transport request may finish. Broadcast status `sent` means audience submission finished, not that every email was delivered. The detail screen separately reports skipped/failed audience entries, message states and unique human engagement. Provider acceptance and confirmed delivery retain their separate meanings.

Broadcast/contact lifecycle events use the transactional outbox and existing webhook delivery system. A processing error rolls back the chunk and backs off one minute. Per-recipient validation errors are recorded without stopping valid recipients. Attachments/MIME objects left by rolled-back transactions require the object-retention cleanup planned in hardening.

## Verification

Local database tests cover atomic CSV import, opt-out preservation, numeric/fallback segments, template immutability, original-request idempotency, frozen audiences, DKIM unsubscribe headers, preference rechecks, throttling/cancellation and tenant/domain scope. Browser coverage uses the real dashboard with an explicit test API fixture. Real PostgreSQL/Redis/MinIO recovery and live SMTP/provider checks are configured separately and remain pending without Docker.
