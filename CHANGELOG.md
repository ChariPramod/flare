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
