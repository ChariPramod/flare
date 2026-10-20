# Flare: Codex Build Prompt for Pareto Labs' In-House Notification Platform

This is the historical build brief. On 2026-10-13 the repository owner explicitly changed the visibility requirement to **public**. Current implementation and verification evidence are maintained in [PROGRESS.md](../../PROGRESS.md) and [the acceptance ledger](../development/acceptance.md); unverified research assumptions below are not runtime findings.

Paste the prompt below into Codex. It tells Codex to build **Flare**: run self-hosted Novu, unmodified, as the multi-channel workflow engine, and wrap it in a Pareto-owned control plane. That control plane adds the Resend-style email product, team auth, delivery tracking and a single dashboard that looks like Novu's.

## TL;DR

- **Name: Flare.** A flare stack is a signal every oil and gas operator recognizes, and the name is short enough for a CLI, an SDK and a repo. Alternates if you want another option: **Relay** and **Telegraph**.
- **Architecture: don't fork Novu. Run the pinned Novu community images (API, worker, WS) headless and build a Flare layer around them.** The community edition is missing things Pareto needs: it allows 1 team member, has no RBAC, has no email delivery or engagement tracking, and caps you at 2 environments. Novu's "Delivery Retry Policy" docs also say "a provider send is attempted once," with a 429 or 503 "handled the same way as a 400 Bad Request." If that provider fails, "Novu does not fall back to another configured integration for the same channel." Flare's layer has to supply all of that, along with every Resend feature.
- **Email transport: self-hosted Postal by default, Amazon SES as a fallback adapter, both behind one transport interface.** Novu's email integration points at Flare's own SMTP relay, so all mail, whether it starts as a workflow or an API call, goes through one pipeline: suppression, DKIM, tracking, events.

## Key Findings that shaped the prompt

**Assumptions baked in**

- Repo: `github.com/ChariPramod/flare`, private. If it doesn't exist, Codex creates it with the GitHub CLI. The remote URL is a placeholder you confirm.
- Stack: TypeScript end to end, to match Novu's NestJS/Node codebase and SDKs. Codex makes every frontend decision inside the constraints the prompt sets.
- Scope: one Pareto organization at MVP. The data model is multi-org from day one.

**Why wrap and not fork.** Novu is open core. The core is MIT, but the `/enterprise` folder carries a commercial license that allows internal use only, and Novu's written approval is required before you can use it. A fork would make every Novu upgrade a merge exercise and would put you close to licensed code. Running unmodified images keeps upgrades to a tag bump. Pin 3.19.0 (released August 2026). Don't run anything older than 3.18.0. That release patched CVE-2026-75510 (GHSA-8gr3-5j6f-25gp), a stored XSS in the in-app Inbox through a `javascript:` notification redirect URL. The GitHub Advisory Database calls it "Confirmed live-exploitable on v3.15.0 (Docker community compose, default config, default roles)."

**Gaps in Novu's community edition that Flare must fill**, per Novu's official comparison matrix: email activity tracking (delivery and engagement events) is cloud-only. Max team members is 1. RBAC, SSO and MFA are not available. You get at most 2 environments. The answer on outbound webhooks and translations is unclear. An undated Novu Discord thread ("Cloud vs self hosted feature availability", indexed on AnswerOverflow) said "layouts, webhooks, and translations are cloud-only features ... topics will be available with new docker images." The current matrix shows layouts as available and doesn't list webhooks or translations, so the prompt has Flare implement its own webhooks either way.

**Novu behaviours the prompt encodes, because Codex would otherwise assume otherwise:**

- A provider send is attempted once. Novu's Delivery Retry Policy says a 429 or 503 from the provider "is handled the same way as a 400 Bad Request".
- When the selected integration fails, Novu does not fall back to another configured integration for the same channel.
- A failed channel step doesn't stop the workflow. A failed digest, delay or throttle step cancels every remaining step.
- Bridge calls are retried 3 times with "2^attempt × 500ms" backoff (1s, 2s, 4s). Retries happen on HTTP 408, 429, 500, 503, 504, 521, 522 and 524, and on ECONNREFUSED, ECONNRESET, ETIMEDOUT and ENOTFOUND. "Each request has a 5 second timeout."
- Preferences resolve in layers: workflow defaults set in code, then workflow channel preferences set in the dashboard, then the subscriber's global preferences, then the subscriber's per-workflow preferences. Critical workflows discard both subscriber layers.
- Publishing promotes workflows, layouts and translations. Subscribers, integrations and topics are environment-specific and are never published. Production is view-only for workflows.

**Resend features verified for 2026:**

- Sending: single, batch (up to 100) and scheduled sends. Idempotency keys up to 256 characters, kept for 24 hours.
- Domains: statuses are not_started, pending, verified, failed and temporary_failure. You pick a region. Each domain has sending and receiving capabilities. Open and click tracking are off by default, and the tracking subdomain can be custom.
- API keys: two permissions, full_access and sending_access. A sending key can be scoped to one domain. Permission and scope are fixed when the key is created.
- Audiences: global Contacts with custom Properties, Segments and Topics. Unsubscribe pages are managed for you.
- Broadcasts.
- Automations, launched April 13, 2026.
- Inbound receiving.
- Managed suppression lists, launched July 28, 2026. Bounces and complaints suppress an address across every domain.
- Logs search and the Logs API.
- Svix-signed webhooks. Event types include email.sent, delivered, delivery_delayed, bounced, complained, opened, clicked, failed, scheduled, suppressed and received, plus domain, contact, suppression and topic events.
- An SMTP relay.
- A CLI and an MCP server.

## The Codex Prompt

```text
You are building FLARE, Pareto Labs' internal notification platform. Pareto Labs builds AI for oil and gas and telecom and runs its own cloud, so Flare must be fully self-hostable with no required SaaS dependency. The owner is a backend engineer, not a frontend engineer: make every frontend decision yourself within the constraints below and do not ask.

GOAL
Flare = self-hosted Novu (multi-channel workflow engine) + a Flare control plane that adds every Resend feature (transactional email API, domains, API keys, audiences, broadcasts, automations, inbound, suppressions, webhooks, logs, metrics) + one unified dashboard modeled closely on the Novu web dashboard.

CORE DECISION: WRAP NOVU, DO NOT FORK IT
- Run official Novu community images, pinned (ghcr.io/novuhq/novu/{api,worker,ws}:3.19.0, never below 3.18.0). Do not modify Novu source. Never copy or import anything from Novu's /enterprise folder (commercial license).
- Flare talks to Novu only through its REST API and SDK (@novu/api), using per-environment Novu secret keys stored encrypted in Flare.
- Novu community limits Flare must compensate for: 1 team member, no RBAC/SSO/MFA, no email delivery/engagement tracking, max 2 environments, provider sends attempted once with no automatic failover. Flare owns auth, RBAC, email event tracking, retries/failover for email, outbound webhooks and analytics.
- Keep the stock Novu dashboard container internal-only (admin/debug); users use the Flare dashboard.

STACK
- Monorepo: pnpm workspaces + Turborepo, TypeScript strict everywhere, Node 22.
- apps/api: NestJS (REST, OpenAPI generated, Zod/class-validator DTOs). apps/worker: BullMQ workers. apps/smtp-relay: SMTP ingress (smtp-server lib). apps/web: Next.js App Router dashboard. packages/sdk (typed client, Resend-compatible method names), packages/db, packages/shared, packages/email-templates (React Email), packages/cli (later).
- Flare data: PostgreSQL (Drizzle ORM, migrations committed). Queues/cache/rate limits: Redis + BullMQ (separate Redis DB from Novu, AOF on). Object storage: MinIO (S3 API) for attachments and inbound raw mail. Novu keeps its own MongoDB + Redis.
- Email transport: TransportAdapter interface with PostalAdapter (default, self-hosted MTA) and SesAdapter (fallback); SmtpAdapter for generic relays.
- Frontend: Next.js + Tailwind + shadcn/ui (Radix) + lucide icons + TanStack Query + TanStack Table + React Flow (@xyflow/react) for the workflow canvas + Recharts + react-hook-form/Zod + Monaco for code/JSON editors. Embed @novu/react <Inbox/> for the in-app demo pointed at the self-hosted WS.

ARCHITECTURE AND DATA FLOW
1. Workflow notifications: client calls Flare POST /v1/events/trigger; Flare authenticates, resolves org/env, applies rate limits and idempotency, then calls Novu trigger. Novu runs steps and channels.
2. Novu's email integration is a Custom SMTP integration pointing at Flare's smtp-relay. Every email (workflow or direct API) therefore enters one Flare email pipeline: validate sender domain, check suppression, inject tracking, DKIM via transport, send through Postal/SES, record events.
3. Resend-style direct email: POST /v1/emails goes straight to the Flare email pipeline (no Novu).
4. Transport events (Postal webhooks, SES via SNS) are normalized into Flare email_events, update message status, drive suppression, feed metrics, and fan out to Flare outbound webhooks. Novu message.* events are pulled or received and merged into the Activity feed.

COMPONENTS AND THE LOGIC EACH MUST HANDLE

Novu engine components (Flare UI + API over Novu):
- Workflows: CRUD via Novu v2 workflows API; identifier immutable after create; tags, severity (high/medium/low/none), critical flag, payload schema (JSON Schema) validated before trigger; status active/inactive. Edits only in Development; Production read-only.
- Steps: channel steps (in_app, email, sms, push, chat) and action steps (delay, digest, throttle, http_request). Delay: fixed duration, until timestamp, or payload-driven. Digest: regular window, backoff, and scheduled (cron-like) modes; groups by subscriberId by default plus optional digestKey; downstream steps run once per window with events[] available to templates. Throttle: count triggers per subscriber (plus optional key) in a window; over threshold halts downstream steps. Step conditions: JSON Logic over payload, subscriber, context, and prior step results (e.g. steps.inapp.read); visual condition builder in UI. Encode Novu failure semantics in UI explanations: a failed channel step continues; a failed action step cancels the remaining steps.
- Triggers: to = subscriber(s), topic(s), or broadcast; payload, overrides (including integrationIdentifier per channel), actor, transactionId (support cancel by transactionId), context (max 5 keys). Flare adds Idempotency-Key header (24h, 256 chars) and bulk trigger.
- Subscribers: subscriberId unique per environment; profile (name, email, phone, avatar, locale in xx_YY format, timezone, data JSON); channel credentials (push device tokens, chat webhook URLs); just-in-time upsert on trigger; per-subscriber preferences view; message history tab.
- Topics: key immutable; add/remove subscribers in bulk; fan-out per subscription; context exact-match (no context means default scope, not wildcard); optional JSON Logic conditions per subscription; exclude actor from fan-out.
- Preferences: resolve per channel in this order: workflow defaults in code, then workflow channel preferences in dashboard, then subscriber global, then subscriber per-workflow. Critical workflows ignore both subscriber layers and are hidden from the preferences UI. Show the resolved result with a "why" explanation on the subscriber page.
- Integrations store: catalog grouped by channel (email, sms, push, chat, in-app); multiple integrations per provider; one primary per channel for email and SMS; active toggle; integration conditions; credentials encrypted at rest (AES-256-GCM, key from env), never returned to API-key callers. Flare adds failover groups: on transport error or 429/5xx, retry with exponential backoff (max 3) then fail over to next integration in priority order; log each attempt.
- Content editors: email block editor plus HTML/code editor, Liquid variables, live preview with sample payload, test send; in-app (subject, body, avatar, primary/secondary action, redirect); SMS with segment counter; push title/body/data; chat.
- Layouts: reusable email wrappers per environment; no payload variables inside layouts; translations toggle.
- Translations: per-workflow locale JSON (en_US default), import/export, fallback to default locale when key or locale missing. Implement in Flare at render time if Novu community lacks it.
- Environments: Development and Production per org. Publish diff UI: choose workflows, layouts, translations to promote; subscribers, integrations, topics never promoted. Separate API keys per environment.
- Framework bridge: support registering a bridge URL per environment for @novu/framework code-first workflows; show status; document npx novu dev usage.
- Inbox: in-app feed via Novu WS; read/unread/seen/archive, bulk actions, unread count; subscriberHash (HMAC) required in production.
- Activity feed: list workflow runs with filters (workflow, subscriber, channel, status, transactionId, date); run detail shows step timeline, execution details, provider responses, retries and failover attempts.

Resend-equivalent Flare modules:
- Emails API: POST /v1/emails (from, to up to 50, cc, bcc, reply_to, subject, html, text, react template id, headers, attachments by content or URL with size limit, tags name/value, scheduled_at as ISO or natural language). POST /v1/emails/batch (max 100, atomic by default, validation mode strict|permissive). GET, PATCH (reschedule), POST cancel for scheduled. States: queued, scheduled, sent, delivered, delivery_delayed, bounced, complained, failed, suppressed, canceled; enforce valid transitions only. Idempotency: same key + same body returns original ids; same key + different body returns 409.
- Domains: add domain with region; generate DKIM keypair (store private key encrypted), SPF include, return-path MX, optional DMARC suggestion, tracking CNAME. Verification job polls DNS with backoff (not_started, pending, verified, failed, temporary_failure); per-record status; re-verify on demand; periodic re-check that downgrades on drift. Toggles: open tracking, click tracking (off by default), custom tracking subdomain, enforce TLS. Capabilities: sending, receiving. Sending from an unverified domain returns 403 naming the domain.
- API keys: full_access or sending_access; sending keys optionally scoped to one domain; token shown once, store only a hash plus prefix; permission and scope immutable; last-used timestamp; revoke.
- SMTP relay: AUTH with API key as password, STARTTLS, same pipeline as Emails API.
- Contacts, Properties, Segments, Topics (audience): global contacts keyed by email; custom properties with type and fallback; CSV import with column mapping and dedupe; segments for targeting; audience topics shown on a hosted preference page; unsubscribed flag stops all broadcasts.
- Broadcasts: draft, scheduled, sending, sent, canceled; target segment, optional topic; template with contact properties and required {{{FLARE_UNSUBSCRIBE_URL}}}; add List-Unsubscribe and List-Unsubscribe-Post (one-click) headers; send in throttled chunks; skip unsubscribed, topic opt-outs, and suppressed addresses; per-broadcast stats.
- Automations: event-triggered email sequences (trigger, send email, wait, wait for event, condition branch) for contacts. Implement by compiling to a Novu workflow when possible; otherwise a Flare state machine on BullMQ. Runs view with per-step status.
- Templates: versioned React Email or HTML templates with variables and preview; usable by Emails API, broadcasts and Novu email steps.
- Inbound: MX to Postal inbound route, store raw MIME in MinIO, parse headers, body, attachments; email.received webhook carries metadata only; API to fetch body and attachments; optional forwarding rules.
- Suppressions: auto-add on hard bounce and complaint, manual add; scope is org-wide across all domains; soft bounce counts, suppress after 3 within 7 days; checked before every send (transactional, broadcast, Novu email); suppressed sends emit email.suppressed and never reach transport; remove via UI or API with audit log.
- Tracking: open pixel and click redirect served from the tracking subdomain; signed link tokens; dedupe opens within a short window; flag likely machine opens (Apple MPP, scanners).
- Outbound webhooks: per-org endpoints with event filter; Svix-compatible signing (svix-id, svix-timestamp, svix-signature HMAC-SHA256 over id.timestamp.body, secret prefixed whsec_), reject timestamps older than 5 minutes in our verify helper; at-least-once delivery from an outbox table; retry schedule immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h then disable endpoint and alert; per-attempt log, manual replay, secret rotation, test event. Events: email.*, domain.*, contact.*, suppression.*, broadcast.*, plus workflow and message events mirrored from Novu.
- Logs: every API request logged (method, path, status, key id, latency, request/response bodies with secrets redacted); search by id, filter by status class and code, CSV export; retention configurable.
- Metrics: dashboards for sent, delivered, bounce rate, complaint rate, open and click rate, by domain, tag, workflow, channel, time range; alert banners when bounce rate exceeds 4% or complaint rate exceeds 0.08%.

AUTH, MULTI-TENANCY, RBAC
- Email/password plus OIDC (generic) login; optional TOTP MFA. Orgs, members, invites. Roles: owner, admin, developer (no publish to Production, no member management), viewer (read-only). Enforce in API guards, not only UI.
- Every row scoped by org_id and environment_id; tests prove cross-org access is impossible.
- MVP maps one Flare org to one Novu organization; namespace subscriber ids if multiple Flare orgs share it later.
- Audit log for key, domain, member, publish, suppression and integration changes.

RATE LIMITING AND RELIABILITY
- Per-API-key token bucket in Redis (default 10 req/s, configurable); 429 with Retry-After and ratelimit headers.
- All external sends via queues; jobs idempotent by message id; dead-letter queue with UI to inspect and re-drive.
- Graceful shutdown, health and readiness endpoints for every service.

DASHBOARD (replicate the Novu dashboard closely)
- Layout: left sidebar with org switcher, environment switcher (Development/Production badge), and sections: Workflows, Subscribers, Topics, Activity Feed, Integrations Store, Layouts, Translations, Analytics; then an Email group: Emails, Domains, Audience (Contacts, Properties, Segments, Topics), Broadcasts, Automations, Templates, Inbound, Suppressions, Webhooks, Logs, Metrics; then Developer: API Keys, Environments, Bridge, Settings, Team. Top bar: search (cmd+K), Publish changes button in Development, bridge status indicator, user menu.
- Workflow editor: vertical step canvas (React Flow) with add-step buttons between nodes, step side panel with Configure / Content / Conditions tabs, preview pane, Test workflow drawer with payload JSON editor and live run trace.
- Emails page modeled on Resend: list with status pills, detail page with event timeline, rendered HTML, plain text, headers, raw source.
- Standards: dark and light mode, responsive down to tablet, skeleton loading states, empty states with a primary action and code snippet, toast feedback, confirm dialogs for destructive actions, accessible keyboard navigation, copy buttons on ids and keys, URL-synced filters and pagination.

LOCAL SELF-HOSTING
- docker-compose.yml at repo root: postgres, redis (Flare), minio, postal (with its MariaDB), novu-mongodb, novu-redis, novu-api, novu-worker, novu-ws, novu-dashboard (internal), flare-api, flare-worker, flare-smtp-relay, flare-web, mailpit (dev sink). Healthchecks and depends_on conditions. A make up / make seed path that boots everything and seeds a demo org, workflow, subscriber, domain and API key.
- .env.example documents every variable (JWT_SECRET, STORE_ENCRYPTION_KEY of 32 chars, NOVU_SECRET_KEY, Flare encryption key, Postal and SES credentials). Never commit real secrets; add a secret scan (gitleaks) to CI.

OBSERVABILITY
- Pino structured JSON logs with request id and org id; OpenTelemetry traces across api, worker, relay and Novu calls; Prometheus metrics (queue depth, send latency, failures by provider, webhook backlog); Grafana dashboard JSON in /ops.

TESTING
- Unit tests (Vitest) for preference resolution, digest grouping, idempotency, state transitions, suppression, signature signing and verification, DNS verification parsing.
- Integration tests with Testcontainers (Postgres, Redis, Mailpit) for the email pipeline and webhook delivery.
- E2E (Playwright) for login, create workflow, trigger, see activity, add domain, send email, view logs.
- CI on GitHub Actions: lint, typecheck, test, build, gitleaks.

BUILD PHASES (in order; finish and push each before starting the next)
0. Scaffold monorepo, CI, docker-compose with Novu running, .env.example, README, PROGRESS.md.
1. Auth, orgs, members, RBAC, environments, API keys.
2. Novu wrapper: workflows CRUD, steps, triggers, subscribers, topics, preferences, integrations store.
3. Email pipeline: transport adapters, smtp-relay, domains and DNS verification, Emails API (single, batch, scheduled, idempotency), suppressions, tracking, event ingestion.
4. Dashboard shell plus Novu-equivalent pages including the workflow canvas and activity feed.
5. Outbound webhooks, logs, metrics.
6. Audience, broadcasts, templates.
7. Automations, inbound, translations, layouts.
8. Hardening: rate limits, failover, DLQ, observability, load test, docs, SDK and CLI.

GIT AND PUSH CADENCE (follow exactly)
- Initialize git on branch main. Remote: git@github.com:ChariPramod/flare.git  <REPLACE_IF_DIFFERENT>. If the repo does not exist and gh is authenticated, run: gh repo create ChariPramod/flare --private --source=. --remote=origin. It must be private. Never make it public.
- Work in checkpoints of roughly one hour of development. A checkpoint ends only when a coherent unit of work is complete and scripts/checkpoint.sh passes (lint, typecheck, tests, build, gitleaks).
- At each checkpoint: update PROGRESS.md (timestamp, phase, what was done, what is next, known issues), then make ONE commit with a Conventional Commit message (feat:, fix:, chore:, docs:, test:, refactor: with a scope, e.g. feat(domains): add DNS verification job), then git push origin main.
- Commits are sequential and in phase order. Never batch unrelated changes into one commit. Never force push, never rewrite pushed history, never commit secrets or .env files.
- If a push fails (auth or network), keep the local commit, record it in PROGRESS.md under Pending pushes, and retry at the next checkpoint. Do not stop working.
- Provide scripts/checkpoint.sh that runs the checks and, if they pass, prints the suggested commit scope. Optionally add a scripts/autopush.sh plus a documented crontab line (0 * * * *) that pushes already-committed work hourly when Flare is run on a dev machine; it must never create commits on its own.

DEFINITION OF DONE
- docker compose up on a clean machine boots the full stack; seed script works; README explains setup, DNS records and Postal/SES configuration.
- A workflow with in-app, digest, email and SMS steps can be built in the UI, triggered via API, and observed end to end in the activity feed.
- A domain can be added, verified, and used to send a tracked email through the Emails API and the SMTP relay; bounces and complaints suppress the address and emit signed webhooks that verify with the standard Svix libraries.
- RBAC enforced and tested; no cross-org leakage; secrets encrypted; CI green; PROGRESS.md and CHANGELOG.md current.

STYLE
- Keep code idiomatic, typed and tested. Document decisions in /docs/adr. No placeholder TODOs in merged phases. When something in Novu's community edition is missing or behaves differently than expected, implement it in Flare and note it in /docs/novu-gaps.md.
```

## Caveats

- **Running your own MTA is the biggest operational risk.** Postal is MIT-licensed, and v3.3.7 (June 2026) is a security release. It covers the transport features Flare needs: DKIM signing, IP pools, click and open tracking, webhooks and a suppression list. New IPs still need warm-up, reverse DNS and an open port 25, though. Keep SES configured as the failover adapter until Postal's reputation is established.
- **Some community-edition limits haven't been verified.** Nobody has confirmed on 3.19.0 whether outbound webhooks, translations and topics ship in the self-hosted build. The prompt hedges by building Flare-side webhooks and translations either way and logging the findings in `docs/novu-gaps.md`.
- **The hourly push is approximate.** Codex works in sessions and can't keep a true cron running. The prompt treats "hourly" as a checkpoint discipline: one tested, logical commit pushed about every hour of work, plus an optional crontab script for a dev machine that pushes commits that already exist. If you run Codex in the cloud, its sandbox may not have push credentials. In that case it records pending pushes in PROGRESS.md, and you push or merge its PRs yourself.
- **Two thresholds in the prompt are my own defaults, not vendor figures.** The metric alerts (bounce rate 4%, complaint rate 0.08%) and the soft-bounce rule (3 within 7 days) are set conservatively below the AWS SES review thresholds. Per AWS's "Sending review process FAQs", "If your bounce rate is 5% or greater, we'll place your account under review" (sending may be paused at 10%), and "If your complaint rate is 0.1% or greater, we'll place your account under review" (paused at 0.5%). AWS recommends keeping bounces below 2%. Tune them to your sending volume.

## Research basis

- Novu architecture, sizing and edition matrix:
  - Novu docs pages "Self-Host Novu" and "Self-Hosted and Novu Cloud".
  - Railway's Novu templates (images 3.15 to 3.18).
  - Novu GitHub README for the open-core license.
  - Novu v3.19.0 release notes for the community image tag.
- Novu engine logic, from these Novu docs pages:
  - "Delivery Retry Policy": single send attempt, no failover, failure semantics, bridge retries, and outbound webhooks retried "8 attempts over roughly 27.5 hours, starting immediately and backing off to a 10 hour ceiling". Novu's Webhooks page adds that an endpoint is disabled if every attempt fails for 5 days.
  - "Notification Preferences Concepts": resolution order and critical workflows.
  - "Digest Step" and the Glossary: regular, backoff and scheduled digests; up to 5 contexts per trigger.
  - "Topics": context exact-match fan-out.
  - "Integrations": primary per channel.
  - "Environments": publish scope.
- Resend features, from these Resend docs and changelog pages:
  - Webhook Event Types.
  - Create Domain and Open and Click Tracking.
  - Create API key and the resend-skills API keys reference.
  - Send Batch Emails and Batch Idempotency Keys.
  - Contacts, Segments and Broadcasts docs.
  - Email Suppressions changelog (July 28, 2026).
  - Introducing Automations (April 13, 2026).
  - Inbound Emails.
  - Improved Logs Visibility.
  - Official MCP Server.
- Transport:
  - Postal docs, feature list and GitHub releases.
  - Novu Custom SMTP and Amazon SES provider docs.
  - AWS SES docs on event publishing and the account-level suppression list.
