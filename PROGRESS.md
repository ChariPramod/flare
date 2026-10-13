# Flare progress

Updated: 2026-10-12, America/Los_Angeles.

## Phase status

| Phase                                           | Status                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| 0 — Scaffold, CI, Compose                       | Local checkpoint passed; container startup unverified            |
| 1 — Auth, RBAC, environments, keys              | Local checkpoint passed; live OIDC/container tests pending       |
| 2 — Novu wrapper                                | Core API/queue checkpoint; live engine validation pending        |
| 3 — Email pipeline                              | Local checkpoint passed; container/provider verification pending |
| 4 — Dashboard                                   | Local checkpoint; live-stack acceptance pending                  |
| 5 — Webhooks, logs, metrics                     | Local checkpoint; live engine/container tests pending            |
| 6 — Audience, broadcasts, templates             | Pending                                                          |
| 7 — Automations, inbound, translations, layouts | Pending                                                          |
| 8 — Hardening, SDK, CLI                         | Pending                                                          |

## Checkpoint log

- 2026-10-12: Created strict TypeScript monorepo, NestJS/Next.js/service scaffold, committed SQL migration runner, local secret setup, isolated Compose services, CI and checkpoint scripts. Node 22.23.3 / pnpm 10.32.1 installed locally. Lint, strict typecheck, 4 tests, production build and gitleaks passed.

- 2026-10-12: Added password sessions, OIDC with PKCE/state/nonce, optional TOTP and single-use recovery codes, invitation acceptance, team roles, last-owner protection, encrypted environment credentials, immutable scoped API keys, audit records and repeatable identity seed. 13 tests pass, including PostgreSQL RLS tests using PGlite.

- 2026-10-12: Added validated workflow CRUD, production guard and selected-workflow promotion, durable queued triggers and cancellation, subscriber upsert, preferences, exact-context topic subscriptions, integrations with encrypted credentials and an activity API. Lint/typecheck/build/gitleaks and 17 tests passed.

- 2026-10-12: Implemented the shared API/SMTP email pipeline, scoped domain/key constraints, durable delivery claims, schedules, batch/idempotency, encrypted DKIM, MinIO attachments, SSRF-safe downloads, Postal/SES/SMTP transports, DNS polling/drift, signed tracking, native Postal/SNS verification, suppression, event outbox, and STARTTLS relay. Fixed a shared postgres.js codec conflict exposed by protocol tests. Lint/typecheck/build/gitleaks and 58 tests passed. Added a disposable container integration harness and provider setup guide.

- 2026-10-12: Added the authenticated Next.js dashboard, HttpOnly session proxy, SSO/invitation/MFA views, organization/environment switching, React Flow workflow editor/test trace, subscriber preferences/Novu Inbox, topics/integrations, publication, domain/email/suppression screens, raw signed MIME, team/keys/settings and responsive light/dark layouts. Lint/typecheck/build/gitleaks, 58 backend tests and three Playwright browser contract flows pass; screenshots inspected. Standard Monaco textarea input avoids experimental EditContext corruption. The Inbox-only proxy preserves internal Novu administration. Full live-stack acceptance is separately configured and remains unrun.

- 2026-10-12: Added durable Svix-compatible webhook fanout, atomic delivery claims, retries/recovery/replay, rotating secrets, endpoint alerts, native engine callback verification, redacted request logs/search/CSV/retention, and delivery metrics with dashboard screens. Lint/typecheck/build/gitleaks and 77 tests pass, including official Svix interoperability and loopback HTTP checks. All four Playwright browser contract flows pass; screenshots inspected. Real PostgreSQL/Redis webhook recovery tests are added but unrun without Docker.

## Known issues and verification limits

- This host has no Docker runtime. Full-stack startup, official image pulls and container integration tests cannot be validated here yet.
- GitHub connector returned 404 for `ChariPramod/flare`; GitHub CLI has no authenticated account; SSH remote verification failed because GitHub host trust is not configured. No private repository was created.
- Real PostgreSQL/Redis/MinIO/Mailpit integration harness is committed but unrun without Docker. Local PGlite tests use a single connection; real concurrency verification remains pending.
- Postal/SES identities require provider-side authorization. Native callback interoperability, real DNS verification, and Novu → STARTTLS relay delivery need live verification.

- OIDC provider interoperability and full HTTP session flows still require live integration verification; passing unit/database tests do not certify those deployments.

## Pending pushes

`68c47e9 chore(scaffold): initialize Flare monorepo and self-hosting stack` — pending GitHub authentication and private repository creation.

`90eaa36 feat(auth): add tenant isolation, team roles and secure authentication` — pending the same GitHub setup.

`e3a3d75 feat(workflows): add Novu control plane and durable trigger dispatch` — pending GitHub setup.

`e4fda65 feat(mail): add durable shared email pipeline and authenticated relay` — pending GitHub setup.

`22f693a feat(dashboard): add authenticated notification and email control plane` — pending GitHub setup.

`feat(operations): add durable webhooks, redacted logs and delivery metrics` — local checkpoint, pending GitHub setup.

## Next

Implement audience contacts/properties/segments/preferences, versioned templates and throttled broadcasts. Full Compose verification remains a prerequisite for production readiness.
