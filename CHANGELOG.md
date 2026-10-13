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
