# Durable contact automations

Automations run contact email sequences in Flare's PostgreSQL/BullMQ state machine. Contact preferences, the transactional mail pipeline and contact-event waits require Flare state, so these sequences are not converted to stock Novu workflows. Notification workflows still execute in the unmodified Novu engine.

Create or update `/v1/automations` in Development. Identifiers are immutable; every update increments the revision. Enable a definition to start new runs when matching events are dispatched. Disabling prevents new runs; existing runs retain the definition and template versions captured at their start. Production definitions are read-only. Select automations in the publication dialog or send `automations: [identifier]` to `/v1/publish`. Publication captures the accepted definition/revision and required template versions, remaps stable template identifiers into Production, validates sender-domain availability there, and atomically applies the definition and enabled state. Existing runs keep their pinned snapshots. Domains, contacts, credentials and events are not copied. Failed items use the same audited publication retry/replacement controls.

The dashboard provides a sequence canvas, step configuration, activation, test events and run timelines. A test event is real and can send email through every enabled definition matching that event in the current environment.

## Definition

A definition has `trigger`, `entry` and at most 50 uniquely identified, reachable steps. Cycles are rejected. A null successor finishes the run.

- `send_email`: verified `from`, `template_id`, `template_version`, `next`. Template HTML must include `{{{FLARE_UNSUBSCRIBE_URL}}}`. Variables include property fallbacks, contact names/email, `contact` and triggering `event` data. Both unsubscribe headers are DKIM-signed. Production preference origins must use HTTPS.
- `wait`: `seconds` (1 to 31,536,000), `next`. The persisted deadline starts when this step is first entered, after the worker acquires policy/run/contact locks. Time blocked before entry does not shorten the delay. Entry and deadline use one database wall-clock instant; retries preserve an already initialized window.
- `wait_for_event`: `event`, `timeout_seconds`, `next`, `on_timeout`. Matches events for the same contact/environment created after entry and at or before the deadline. Older events cannot satisfy the wait. An event received during a worker outage can still satisfy it if its persisted timestamp falls within that window.
- `condition`: bounded JSON Logic over `contact` and `event`; successors `then` and `else`. Only scalar comparisons, Boolean operators, `in` and `var` are permitted. No custom operations or loops.

## Events and recovery

Submit `/v1/automation-events` with `contact_id`, `name`, `external_id`, and up to 32 KiB of JSON `data`. Repeating an external ID with identical content returns the original event; changed content returns 409. IDs remain reserved while the event is retained. This endpoint requires unscoped full access; a domain-scoped key cannot trigger a definition sending from another domain.

Contact lifecycle events and events for outgoing mail associated with a contact are also copied from the transactional outbox. The automation consumer has a separate durable cursor from webhooks. Synthetic endpoint test events do not trigger automations. Definitions enabled at dispatch time receive matching events created after the definition itself; each definition/event pair creates at most one run.

Each step holds a PostgreSQL row lock. Email acceptance and step completion commit together, so retries cannot repeat an already committed submission. Jobs use run IDs and reconstruct from due database rows after queue loss. Waits need no in-memory timers. Transient step failures back off exponentially and become failed after five attempts; permanent validation failures stop immediately with a step error. Eligible failures can be inspected and redriven from Dead letters after correcting the cause.

Contact deletion or opt-out cancels future steps; the mail pipeline rechecks preferences and organization-wide suppression before each transport attempt. A completed sequence means its steps finished submitting emails, not that the provider delivered them. Inspect linked email timelines for final delivery.

`POST /v1/automation-runs/:id/cancel` cancels pending steps and email messages whose delivery has not started. An active provider request may finish. Definition updates and cancellation never rewrite completed step history.

## Verification limits

Local PostgreSQL-protocol tests cover event deduplication/conflicts, immutable run snapshots, waits, event timing, timeout branches, recipient opt-out, failure history, forbidden sender scope, and cross-tenant access. A Chrome test covers editing a sequence, triggering a fixture event and canceling its run. The disposable container harness exercises multi-connection PostgreSQL lock races and database connection loss alongside Redis/MinIO recovery. See [the acceptance ledger](../development/acceptance.md) and [progress](../../PROGRESS.md) for completed runs and external-provider boundaries.
