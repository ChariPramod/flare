# Vercel dashboard deployment

This is a staged implementation of the [approved dashboard plan](dashboard-vercel-plan.md). The dashboard remains in the existing monorepo. PostgreSQL, Redis, MinIO, API/workers, Novu and Postal stay on a persistent backend host. Supabase migration is deferred.

## Current boundary

Checkpoints 2a–2b add signed dashboard forwarding, configuration validation, direct large-content transfers and a private Inbox gateway. Ordinary proxy requests/responses remain capped at 4 MiB. This is **not the complete split-host deployment**: split-host ingress/preflight, recovery-profile changes and actual Vercel connectivity remain checkpoint 2c. The all-Compose deployment retains its existing proxy behavior unless direct transfers are explicitly enabled for testing.

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

## Large content transfers

Vercel mode automatically uses short-lived grants for email submission, email detail/source, inbound bodies, original MIME and attachments. Set `PUBLIC_API_URL` on the backend to its exact public HTTPS origin and `WEB_ORIGIN` to the same exact dashboard origin used by the web service. The backend must be browser reachable; the normal server-to-server `FLARE_API_URL` alone does not establish that reachability. Cross-origin preflights and responses must survive ingress unchanged. Private provider/admin endpoints must remain inaccessible.

The authenticated dashboard sends a small `POST /v1/browser-transfers` request. The returned `fbt_` grant has a distinct audience and lasts at most five minutes, capped by the live session expiry. It binds the user session, organization, environment, exact resource, target and method. Send grants also bind the SHA-256 and byte count of the exact UTF-8 request plus its idempotency key. Redemption rechecks session revocation, membership and current role; it cannot authorize other API endpoints or issue another grant. Tenant policy, quota, attachment/MIME limits and durable email acceptance still apply.

The browser keeps the grant in memory, sends it only as Authorization, omits cookies and refuses redirects. Redemption requires the exact configured Origin. Tokens never go in download URLs. Identical retries acquire another grant but retain the original serialized message and idempotency key, including after a lost acceptance response. Network failure or malformed success JSON keeps the draft for an explicit retry. Cancellation of a browser request does not recall a message already accepted by the API.

Original inbound MIME and attachments use `?format=binary`, bounded reads and safe download filenames; existing API clients keep their JSON/base64 default. The SDK returns `Uint8Array` when explicitly requesting binary format. Email source and inbound body responses remain JSON over the direct connection. Inbound text/HTML previews show at most 65,536 characters with a truncation notice; original MIME and attachments remain complete. Large files still consume browser/API memory up to the configured limits; these are bounded transfers, not resumable multipart uploads. Grant and Inbox request logs omit bodies and query values.

For local acceptance, `FLARE_BROWSER_TRANSFERS=true` on the web service enables the same direct-transfer path outside Vercel. Use exact loopback origins on both services. Leave it unset for the existing self-hosted proxy behavior. No public environment variables or Supabase keys are required.

## Private Inbox gateway

In Vercel mode the dashboard's `/novu/v1/inbox/*` route signs requests to `/v1/dashboard/inbox/*` on Flare. Every request requires a live Flare session and verified dashboard proof. Bootstrap checks the subscriber HMAC/application identifier, then stores a Redis binding between the native token hash and that session, organization, environment and subscriber record. Binding lifetime is capped by the live session, native token expiry and twelve hours. Later requests recheck those identities and permissions; revocation, environment/subscriber changes or missing Redis state fail closed. After binding expiry/loss, reload the subscriber page to remount Inbox and obtain a fresh bootstrap. Closing and reopening its popover retains the existing native session; automatic rebootstrap is not implemented.

Only the default Inbox operations in pinned Novu 3.19.0 are allowed: session, notification feed/count, read/unread/archive/snooze/delete/actions and preferences. Viewer sessions can read; mutations require write access. The gateway never forwards a Novu administrator API key and is excluded from the public OpenAPI, SDK and MCP catalog. Responses retain Novu's SDK envelope and are bounded to 2 MiB. Gateway requests are bounded to 64 KiB. Native authorization is bound into the forwarding signature.

Set the backend’s `NOVU_PUBLIC_API_URL` to `${WEB_ORIGIN}/novu`, or unset it to use that fallback. Replace the example localhost value when deploying. A native Novu URL here sends the browser outside the Flare gateway. HTTP Inbox traffic uses the dashboard gateway; native WebSocket notifications still use the separately configured `NOVU_PUBLIC_WS_URL`. Public TLS/WebSocket ingress, browser reconnects and actual Vercel connectivity require checkpoint 2c validation. The existing self-hosted `/novu` route remains unchanged for this checkpoint.

## Remaining deployment gates

Vercel functions have a documented 4.5 MB request/response payload ceiling. Direct transfer bodies bypass that function; small grants and normal dashboard calls remain within the 4 MiB proxy guard. [Vercel function limits](https://vercel.com/docs/functions/limitations).

Before treating split hosting as ready, complete and verify:

1. Split-host Caddy/DNS/preflight configuration, secret handling and recovery-profile recognition.
2. Actual Vercel project import, login/MFA, environment switching, transfer boundaries, browser Inbox/WebSocket reconnects, revocation and rollback against an isolated backend.

Checkpoint 2c must prove these deployment-specific behaviors:

- The exact public API origin reaches the persistent backend directly for large transfers, with TLS and configured request limits. It must not send large bodies back through a Vercel function. Ingress must preserve the required Origin, authorization, preflight and download headers without trusting caller-supplied proxy addresses.
- The dashboard reaches only its configured backend; previews stay disconnected unless explicitly assigned an isolated backend. Login/MFA and logout/revocation must work across the real origins, including failed forwarding and expired grants.
- The native Inbox HTTP admin surface remains private. The default SDK feed, counts, preferences and permitted mutations must work through the gateway; WebSocket delivery/reconnection needs separate TLS ingress verification. Test viewers as well as writable roles, session expiry, environment switching and Redis binding loss.
- Backup/restore profiles must recognize the split deployment's environment variables and forwarding key, including documented custody/rotation of the Vercel-side configuration. Restore into isolation and test rollback to the retained self-hosted deployment before opening a pilot.

Keep the existing Compose deployment available until these gates pass. No accounts, domain, backend host or external Postal verification are created by this checkpoint.
