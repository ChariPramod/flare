# Flare progress

Updated: 2026-10-12, America/Los_Angeles.

## Phase status

| Phase | Status |
| --- | --- |
| 0 — Scaffold, CI, Compose | Local checkpoint passed; container startup unverified |
| 1 — Auth, RBAC, environments, keys | Local checkpoint passed; live OIDC/container tests pending |
| 2 — Novu wrapper | Pending |
| 3 — Email pipeline | Pending |
| 4 — Dashboard | Pending |
| 5 — Webhooks, logs, metrics | Pending |
| 6 — Audience, broadcasts, templates | Pending |
| 7 — Automations, inbound, translations, layouts | Pending |
| 8 — Hardening, SDK, CLI | Pending |

## Checkpoint log

- 2026-10-12: Created strict TypeScript monorepo, NestJS/Next.js/service scaffold, committed SQL migration runner, local secret setup, isolated Compose services, CI and checkpoint scripts. Node 22.23.3 / pnpm 10.32.1 installed locally. Lint, strict typecheck, 4 tests, production build and gitleaks passed.

- 2026-10-12: Added password sessions, OIDC with PKCE/state/nonce, optional TOTP and single-use recovery codes, invitation acceptance, team roles, last-owner protection, encrypted environment credentials, immutable scoped API keys, audit records and repeatable identity seed. 13 tests pass, including PostgreSQL RLS tests using PGlite.

## Known issues and verification limits

- This host has no Docker runtime. Full-stack startup, official image pulls and container integration tests cannot be validated here yet.
- GitHub connector returned 404 for `ChariPramod/flare`; GitHub CLI has no authenticated account; SSH remote verification failed because GitHub host trust is not configured. No private repository was created.
- SMTP listener, seed data and product modules are introduced in their corresponding phases; scaffold health endpoints do not imply feature completion.

- OIDC provider interoperability and full HTTP session flows still require live integration verification; passing unit/database tests do not certify those deployments.

## Pending pushes

`68c47e9 chore(scaffold): initialize Flare monorepo and self-hosting stack` — pending GitHub authentication and private repository creation.

`feat(auth): add tenant isolation, team roles and secure authentication` — pending the same GitHub setup.

## Next

Implement the Novu wrapper. Full Compose verification remains a prerequisite for production readiness.
