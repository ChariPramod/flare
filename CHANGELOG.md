# Changelog

## Unreleased

- Initial Flare workspace, service scaffold, CI and self-hosting configuration.
- Password/OIDC sessions, TOTP with recovery codes, RBAC, invitations, tenant policies, encrypted credentials, API keys and identity seed.
- Novu workflow control plane, durable trigger queue, subscriber/preferences APIs, Flare-managed topic fan-out, integration metadata and workflow publication.
- Shared email pipeline, durable submission and delivery claims, batch/idempotency/scheduling APIs, sender DNS verification, encrypted DKIM, secure attachments, transport retries/failover, authenticated STARTTLS relay, tracking, Postal/SNS events, org-wide suppression and transactional event outbox.
- Fixed JSON/date serialization for all raw PostgreSQL service queries; added migration startup, demo mail seed, SMTP/database regression tests and a disposable container integration harness.

## Dashboard checkpoint — 2026-10-12

- Added the authenticated responsive dashboard, workflow canvas, subscriber preferences and self-hosted Inbox, activity, domains and email composer/timelines/source, integrations, publishing, and account/team/key settings.
- Added password/SSO/invitation flows using HttpOnly cookies and server-validated tenant switching. Monaco assets stay local.
- Added browser contract tests and a separate live acceptance suite; container acceptance remains pending.

## Operations checkpoint — 2026-10-12

- Added durable webhook fanout/delivery, retry exhaustion alerts, replay, secret rotation, targeted test events, DNS-pinned HTTP dispatch and official Svix signature compatibility.
- Added tenant request logs with bounded credential redaction, search/status filters, CSV export and retention, plus recipient delivery and human engagement metrics.
- Added dashboard endpoint/attempt/log/metric screens, authenticated engine-event ingestion and workflow lifecycle outbox events.
- Expanded database, HTTP and browser coverage; real Redis/PostgreSQL recovery coverage awaits Docker.

## Audience checkpoint — 2026-10-12

- Added contacts, typed properties with fallbacks, atomic CSV import/deduplication, segments, topics and signed public preference pages.
- Added immutable HTML template versions, safe variable rendering/previews, direct-email template references and saved workflow email expansion.
- Added durable throttled broadcasts with frozen audiences, pinned content, sender scope checks, preference/suppression rechecks, cancellation, statistics and signed one-click unsubscribe headers.
- Added audience/template/broadcast screens and database/browser regressions; real queue-loss recovery tests remain pending Docker.

## Automations checkpoint — 2026-10-12

- Added durable event-triggered contact sequences with immutable run snapshots, pinned email templates, wait/event/condition steps, retry history and cancellation.
- Added a sequence canvas, per-step settings, real test-event submission and run/email timelines.
- Added database and browser regressions plus a container recovery test; inbound, layouts, translations and publication remain in progress.

## Inbound checkpoint — 2026-10-12

- Added native signed Postal receipt, raw MIME storage, bounded asynchronous parsing, attachment retrieval, tenant/domain isolation and metadata-only received events.
- Added durable forwarding through the existing mail pipeline, Reply-To preservation, suppression and loop prevention, plus sandboxed message previews and downloads.
- Added database/signature/browser regressions and real concurrent receipt/queue-loss recovery coverage; Docker and live Postal verification remain pending.

## Content checkpoint — 2026-10-12

- Added immutable layout wrappers and workflow locale dictionaries with source preservation, pinned dependencies, per-key default fallback and durable translated trigger payloads.
- Added content editing/import/export, workflow layout/version selection and locale previews.
- Hardened inbound/layout previews by rebuilding resource-free HTML before sandboxing; fixed dynamic iframe rendering and dictionary draft refresh behavior.

## Publication checkpoint — 2026-10-12

- Added resumable workflow/layout/translation promotion, automatic pinned dependencies, stale-diff detection and immutable-version conflict handling.
- Added durable operation history and retry/replacement controls; Production triggers pause while an existing workflow is being reconciled with Novu.
- Added publication recovery and browser coverage; actual pinned Novu interoperability remains a live acceptance requirement.

## Reliability checkpoint — 2026-10-12

- Added configurable atomic API-key/auth token buckets, standard response headers and fail-closed Redis handling.
- Replaced queue-callback workflow retries with durable atomic claims, attempt history, recovery and cancellation compensation; uncertain engine acceptance is quarantined.
- Added tenant-scoped dead letters and audited redrive, preserving operation identity and refusing ambiguous sends.
- Added sanitized request/job tracing, Prometheus metrics, Grafana panels, storage readiness, shutdown deadlines and bounded cleanup. Fixed SSO MFA exchange-token consumption on invalid codes.
- Added recovery/rate-limit/browser tests and the first PostgreSQL/Redis/MinIO/Mailpit CI job. Local Docker and real provider checks remain pending.

## Developer tooling checkpoint — 2026-10-12

- Added a generated OpenAPI contract with drift checks, typed TypeScript SDK, environment-explicit CLI and stdio MCP with validated read-only/mutating tools.
- Added local package installation/consumer checks, webhook verification, typed errors, pagination and credential redaction. No registry packages were published.
- Added immutable publication delegation for owner/admin-created keys, with a dashboard control; ordinary API keys remain unable to publish.
- Replaced unavailable official MinIO binary images with builds from pinned official source commits, including the server security release. Actual container verification remains pending.

### Acceptance harness and deployment operations

- Added a separate pinned Compose CI job, disposable secrets/volumes, upgrade-from-62aaa57 and repeatable seed checks, local authoritative DNS verification, real Novu/SMTP/API scenarios, live browser flows and rate/burst/queue-loss load verification.
- Fixed integration startup waiting on the completed MinIO initializer, relay private-key UID/GID access, and seed reconciliation of editable workflow source and the Novu demo subscriber.
- Added deployment, consistent backup/restore, upgrade, recovery and evidence-ledger documentation. Container acceptance and external provider checks remain pending until their runs pass.

### Automation publication

- Added selected automation promotion to the existing durable publication operation, with stable template identifiers, immutable version snapshots, Production sender validation, atomic activation and preservation of existing runs.
- Added migration, typed contract updates, snapshot/remapping/rollback tests and browser selection coverage. Automation execution remains in Flare; notification workflow publication still verifies Novu.

### CI acceptance capacity

- Real-service integration now passes all 11 PostgreSQL/Redis/MinIO/Mailpit tests in GitHub Actions.
- Full-stack CI exhausted runner disk; free unused hosted-runner toolchains and remove only ephemeral CI build cache after images are created. Local Docker caches remain untouched.

### Container startup and acceptance diagnostics

- Confirmed Flare API/web/worker and the pinned Novu API reach healthy status in CI after the disk repair; both standard and 11 real-service integration checks pass.
- Provision Postal's private config volume for its actual UID 999 and launch Flare services directly with Node, avoiding runtime package-manager cache permissions under the relay's mounted-key owner.
- Stage only Git-visible source, exclude generated browser/cache artifacts from Docker contexts, add bounded redacted failure diagnostics, and cover promoted automation execution and SDK consumer types in acceptance.

## Novu integration compatibility — 2026-10-12

- Reuse the current environment’s preinstalled Novu Inbox instead of creating an invalid second provider; enforce unique engine mappings.
- Use the native primary-selection endpoint for email/SMS and persist actual provider state.
- CI now confirms healthy full-stack startup, baseline migration upgrade, login/bootstrap and local DNS verification. Further end-to-end scenarios remain pending.

- Compile Flare email bodies as explicit HTML and avoid applying an engine layout over an already pinned Flare wrapper. Preserve source definitions and explicit native block content.
