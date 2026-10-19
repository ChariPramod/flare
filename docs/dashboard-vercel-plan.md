# Flare dashboard polish and Vercel readiness

Saved 2026-10-18. Baseline: `177fa50`. Implementation status and measured verification are tracked in [PROGRESS.md](../PROGRESS.md); this document records the approved plan.

## Summary

Build on the existing Next.js dashboard and pnpm/Turborepo monorepo.

The chosen architecture is:

- **Vercel:** dashboard and its small authenticated proxy requests.
- **Existing Docker backend:** API, workers, PostgreSQL, Redis, MinIO, Novu and Postal.
- **Supabase:** deferred. This milestone preserves the tested database and password/MFA authentication.

The first deliverable is a polished application verified against local Docker and prepared for Vercel. Live deployment follows when the backend host and account access exist. No synthetic demo or marketing website is included.

## Checkpoint 1 — Polish the product dashboard

Preserve the current coral accent and light/dark themes, while improving spacing, typography, hierarchy and responsive behavior.

- Add `/overview` as the default authenticated landing page. Show sending approval, quota usage, domain readiness and recent delivery issues using existing APIs. Unavailable data must remain visibly unavailable.
- Improve navigation with clear environment context, a mobile drawer, keyboard navigation, a skip link and accessible active/expanded states. Keep all existing modules reachable.
- Distinguish **Received email** from the subscriber's **In-app Inbox** throughout navigation and onboarding.
- Polish login/MFA, domain setup, email composition, message timelines, received-email details and subscriber Inbox. Preserve operator separation, Production restrictions and existing permissions.
- Present accepted, delivered, held, failed and ambiguous outcomes distinctly. Make hold reasons, retry timing and required next actions understandable.
- Fix Inbound's double pagination: API pagination becomes authoritative; forwarding-rule search/pagination gets independent URL state. Preserve browser back/forward behavior.
- Add visible focus states, accessible sorting, reduced-motion support, consistent loading/error/empty states and usable dialogs at phone widths.
- Preserve form input during recoverable failures. Validate attachment sizes before encoding, while retaining authoritative backend checks and idempotent submission.

Use shared components for these improvements so other modules benefit without redesigning every screen.

## Checkpoint 2 — Make split hosting safe

Execute this checkpoint in reviewable parts: **2a**, signed forwarding and deployment configuration validation; **2b**, direct browser transfers and the private Inbox gateway; **2c**, split-host ingress/recovery configuration and deployment acceptance. Parts 2a–2b do not establish complete Vercel support; checkpoint 2c must validate ingress, recovery profiles and an actual deployment. Current settings and explicit remaining gates are recorded in [the Vercel guide](vercel.md).

### Vercel configuration and authentication

Configure the existing `apps/web` workspace as the Vercel project, using the pinned Node/pnpm versions, root lockfile and current Monaco preparation/build script. Vercel supports deploying individual applications from a monorepo. [Vercel monorepo guidance](https://vercel.com/docs/monorepos)

- Require explicit HTTPS dashboard and backend origins in deployed mode. Preserve HttpOnly, Secure session cookies and exact-origin mutation checks.
- Add an authenticated web-to-API forwarding mode using a dedicated secret and existing signature helpers. Bind signatures to method, URL, body, authorization, tenant headers and validated client IP; reject tampering, expired signatures and nonce replay.
- Keep existing self-hosted forwarding behavior intact. Signed forwarding must never grant tenant or operator authority.
- Add a restricted `/v1/dashboard/inbox/*` gateway to the private Novu Inbox API. Preserve subscriber authorization; keep Novu administration private. In split mode, expose the Flare-authorized WebSocket relay while native Novu WebSocket service stays private.
- Default Vercel previews to no backend credentials. Display an honest configuration-required state. Connecting a preview requires an explicitly isolated sandbox backend and exact origin.

### Large email transfers

The current email and inbound payloads can exceed Vercel's documented **4.5 MB function request/response limit**. Keep large transfers directly between the browser and Flare's API. [Vercel function limits](https://vercel.com/docs/functions/limitations)

Add session-only `POST /v1/browser-transfers`:

- Accept an allowlisted operation: email send/detail/source, inbound body/raw, or inbound attachment.
- Return a server-built URL, method, temporary token and expiration.
- Bind the token to the session, user, organization, environment and exact resource operation. For sends, also bind the serialized body's byte length, SHA-256 and idempotency key.
- Use a distinct token audience and five-minute maximum lifetime, capped by session expiry. Recheck live session, membership and permissions when executing the transfer.
- Send tokens only in Authorization headers, keep them in memory, and restrict CORS to the exact dashboard origin.
- Allow identical send retries through existing durable idempotency; reject altered payloads or keys.

Preserve current email schemas, storage journals and cleanup behavior. No new attachment staging lifecycle is needed. Add optional binary responses to existing inbound download endpoints while preserving JSON/base64 compatibility. Keep the configurable 10 MiB attachment and 25 MiB MIME defaults.

### Deployment compatibility

Checkpoint 2c implements the optional split-web staging configuration: dashboard DNS belongs to Vercel; API, tracking, authenticated WebSocket ingress and Postal endpoints remain on the backend. Local full-stack, ingress, browser and encrypted recovery checks passed as recorded in the acceptance ledger. An actual Vercel/backend deployment remains pending, so the external deployment gate stays open.

The concrete work is:

- Merge `docker-compose.staging-split-web.yml` after the base and staging files; append the optional Postal receiving overlay last. Use the corresponding `staging-split-web` or `staging-split-web-inbound` backup profile. Retain private `flare-web` for rollback and the same nine staging volumes/six isolated recovery stores.
- Route split WS ingress through Flare, never directly to native Novu. Bind access to the live Flare session/subscriber and Redis state, recheck before every event, stop idle unauthorized forwarding within a conservative nine-second application budget, and cap native transport reconnects at five attempts. Preserve the all-Compose path.
- Make preflight validate split origins, dedicated forwarding key, exact trusted proxy and private WS endpoint. Validate both Caddy profiles with synthetic isolated transport/header/log-privacy checks.
- Add public manifest version 2 for a separately hosted dashboard: validate all public A/AAAA answers and pin each HTTPS connection with hostname/SNI verification. Keep backend hosts IPv4-pinned, with tracking CNAME and mail PTR checks. Preserve version 1 unchanged for all-Compose.
- Rehearse encrypted split-profile restoration with populated stores, private key/assets and inactive Caddy volumes. Document Vercel project/secret custody separately from the backend bundle.
- Exercise actual pinned SDK events/reconnect, revocation, viewer behavior and binding-loss recovery in local acceptance, then repeat through public TLS and the actual Vercel deployment. Local gateway evidence does not establish the platform network boundary.

Commands, configuration and the remaining deployment checklist are in [vercel.md](vercel.md), [staging.md](staging.md) and [backup-recovery.md](backup-recovery.md). Record actual pass/failure evidence in [acceptance.md](acceptance.md) before marking a gate complete.

## Checkpoint 3 — Verification and delivery

Use three specialist agents for shared UI, Email/Inbox journeys, and deployment/security integration. The primary agent owns shared contracts, integration review and checkpoint delivery.

Required verification:

- Real-browser login/MFA, session revocation, environment switching, viewer restrictions and operator step-up.
- Desktop, tablet and 390 px phone layouts; keyboard-only navigation, focus management, contrast and reduced motion.
- Inbound pagination/search independence, empty/error states and held/ambiguous message visibility.
- Email attachments and inbound bodies/downloads above 4.5 MB, including configured size boundaries.
- Transfer expiry/tampering, cross-tenant access, role changes, invalid origins and lost-response retries producing one logical send.
- Forwarded-IP spoofing, signature replay, Redis failure and restricted Inbox gateway access.
- Sandboxed received HTML, blocked remote images, credential/content log redaction and browser-bundle secret checks.
- Existing local Compose, JSON API, SDK and browser compatibility.

At each coherent checkpoint, update progress/changelog, run lint, typecheck, OpenAPI checks, unit tests, evals, relevant integration/browser tests, build and gitleaks; then commit, push and confirm CI.

Document Vercel import settings, environment variables, backend requirements, deployment verification and rollback. Mark live Vercel connectivity, public DNS and real Postal delivery pending until tested on provisioned infrastructure.
