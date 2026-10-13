# Durable publication

Development owners/admins publish selected workflows, layouts and workflow translation dictionaries. Production content editing remains disabled. Ordinary API keys cannot publish. An owner/admin user can explicitly delegate publication to a new unscoped full-access key using `allow_publish: true` (also available in the API key dashboard). This grant is immutable and audited. Subscribers, integrations, topics, contacts and credentials are never copied.

`GET /v1/publish/diff` returns resource comparisons, workflow dependency snapshots and a `diff_token`. `POST /v1/publish` accepts `{workflows:[],layouts:[],translations:[],diff_token?}`; translation selections are workflow identifiers. Existing workflow-only request bodies remain valid. Send the reviewed token to reject changes since the diff was read. Without it, the request snapshots the current selection.

Publication now returns `{id,status:"pending",items}`. Poll `GET /v1/publications/:id` for per-item status, attempts and errors; list recent operations with `GET /v1/publications`. A pending response is not completion. The dashboard shows this timeline and retains failed operations for inspection. Only one active publication per target environment is allowed, preventing an old replay from overwriting a newer publication. A failed operation can be superseded with a fresh reviewed snapshot only when the replacement includes every unfinished resource. Completed items remain published; superseded operations cannot be retried. This provides a recovery path for immutable-version conflicts after correcting Development content.

## Dependencies and recovery

Every workflow item embeds its editable source, compiled definition, pinned layout/template content and current locale dictionaries. Template UUIDs are resolved to stable identifiers in the snapshot, then remapped to Production UUIDs. Selecting translations for a workflow absent from Production includes that workflow and its dependencies. Immutable version conflicts fail explicitly rather than overwriting an existing version.

A database-backed worker advances items in order. It copies local content transactionally, reads Novu before applying changes, and reads it again afterward to verify the requested workflow fields. If Novu already matches, no redundant write occurs. Remote success followed by local rollback is recoverable from the saved snapshot. Transient failures retry five times; permanent errors and exhausted retries mark the operation failed. POST `/v1/publications/:id/retry` restarts failed work with the original snapshot and retains completed items and attempt counts.

When updating an existing workflow, a committed `publication_blocked` guard rejects new Flare triggers with 503 until the worker reconciles its local and engine state. Other workflows remain usable. A new workflow becomes visible only when its content and verified engine update commit. A failed publication may require correcting Production credentials/provider configuration before retry. Do not delete failed records or clear the guard manually. Already accepted Novu executions follow Novu's runtime update semantics; this mechanism cannot roll back executions already accepted by the engine.

The operation is resumable, not an atomic transaction across multiple workflows or across Novu and PostgreSQL. Previously completed items remain published if a later item fails. Completion is reported only when every selected item has committed and each workflow's engine fields have been verified.

## Verification

Tests cover pinned dependency copying, template ID remapping, cross-tenant reads, role/key restrictions, stale diffs, overlapping operations, immutable-version conflicts and remote-success/local-failure recovery. Browser coverage exercises selection and the durable completion timeline. A real PostgreSQL/Redis recovery case is included in the container harness. Actual pinned Novu response compatibility remains a full-stack acceptance gate; mismatched engine responses leave the operation pending/failed rather than falsely successful.

Automations are also selectable by stable identifier. Their accepted definition, activation state, revision and pinned template versions are copied atomically; existing runs retain their own snapshots. Sender domains must already exist in Production. These Flare-native automations do not issue Novu workflow mutations.
