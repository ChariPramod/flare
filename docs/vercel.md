# Vercel dashboard deployment

This is a staged implementation of the [approved dashboard plan](dashboard-vercel-plan.md). The dashboard remains in the existing monorepo. PostgreSQL, Redis, MinIO, API/workers, Novu and Postal stay on a persistent backend host. Supabase migration is deferred.

## Current boundary

Checkpoint 2a adds signed dashboard forwarding and configuration validation. It is **not the complete split-host deployment**: direct transfers above the function payload ceiling, the private Inbox gateway, split-host ingress/preflight and recovery-profile changes remain pending. In Vercel mode, Inbox requests return a configuration-required response and ordinary proxy requests/responses are capped at 4 MiB. The existing all-Compose deployment retains its behavior. Live Vercel connectivity has not been verified.

## Project import settings

Import the existing GitHub repository as one Next.js project with root directory `apps/web`. Enable access to source files outside that directory so the shared workspace package and root lockfile are available. Select Node.js 22.x and the repository-pinned pnpm version (10.32.1). Use:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `cd ../.. && pnpm exec turbo run build --filter=@flare/web...`
- Output directory: Next.js default `.next` under `apps/web`

The filter includes the shared package build before the web build. The existing web script prepares Monaco before running Next.js. See [Vercel monorepo guidance](https://vercel.com/docs/monorepos). These settings still require validation on an actual Vercel project.

## Runtime configuration

Set server-only variables in the Vercel project; do not prefix them with `NEXT_PUBLIC_`.

| Variable                       | Required value                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `WEB_ORIGIN`                   | Exact dashboard HTTPS origin, with no path or trailing slash                         |
| `FLARE_API_URL`                | Exact backend API HTTPS origin, with no path or trailing slash                       |
| `FLARE_DASHBOARD_PROXY_SECRET` | Dedicated `fdp_` secret described below, also set on the API                         |
| `FLARE_VERCEL_PREVIEW_BACKEND` | Leave unset for previews; only set `true` for an explicitly isolated sandbox backend |

Vercel supplies `VERCEL=1` and `VERCEL_ENV`. The deployed mode requires explicit configuration and refuses a request whose runtime origin differs from `WEB_ORIGIN`. Session cookies remain HttpOnly/Secure, and mutations require the exact configured browser Origin. Missing configuration yields a configuration-required response without attempting a localhost backend connection.

Leave backend credentials unavailable to preview deployments by default. Connecting a preview requires its own exact dashboard origin and isolated backend configuration; never add a wildcard preview origin. The preview opt-in alone does not supply credentials or relax origin checks.

Generate a dedicated forwarding key in a trusted terminal and store it in the two server-side secret stores:

```sh
node -e "process.stdout.write('fdp_' + require('node:crypto').randomBytes(32).toString('base64') + '\n')"
```

Do not reuse the JWT, encryption or webhook secret. Coordinate rotation across web/API; a mismatched key rejects forwarded requests. The current protocol supports one active key. This secret authenticates the forwarding envelope only; normal user-session, tenant, permission and operator MFA checks still apply.

## Forwarding and client addresses

The Node-only shared helper signs the final HTTP method, exact path/query, original body hash and byte length, authorization, tenant headers, idempotency key, content type, trace parent, reserved native Inbox authorization, validated client address, timestamp and nonce. The API verifies original request bytes and claims the nonce atomically in Redis before accepting the client address. Proofs allow 60 seconds of clock skew; replay entries cover their entire validity window, including future skew. Invalid/replayed proofs are rejected. Replay-store failure returns 503 with a retry hint. Compressed signed request bodies are unsupported.

The web handler uses only Vercel's single validated `x-vercel-forwarded-for` address in deployed mode. Caller-supplied forwarding headers are not relayed. The verified address affects the existing public-authentication rate bucket; it never creates a principal or changes Express `TRUST_PROXY`. Unsigned requests retain the normal API authentication and self-host ingress behavior. See [Vercel's request-header contract](https://vercel.com/docs/headers/request-headers).

## Remaining deployment gates

Vercel functions have a documented 4.5 MB request/response payload ceiling. The 4 MiB proxy guard leaves headroom but is not a replacement for the planned direct browser transfers for email content and attachments. [Vercel function limits](https://vercel.com/docs/functions/limitations).

Before treating split hosting as ready, complete and verify:

1. Session-bound direct transfer grants, live authorization rechecks, exact CORS and payload integrity/idempotency checks.
2. The restricted private Inbox API gateway and explicit native WebSocket connection boundary.
3. Split-host Caddy/DNS/preflight configuration, secret handling and recovery-profile recognition.
4. Actual Vercel project import, login/MFA, environment switching, transfer boundaries, browser Inbox, revocation and rollback against an isolated backend.

Keep the existing Compose deployment available until these gates pass. No accounts, domain, backend host or external Postal verification are created by this checkpoint.
