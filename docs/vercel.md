# Vercel dashboard deployment

This is a staged implementation of the [approved dashboard plan](dashboard-vercel-plan.md). The dashboard remains in the existing monorepo. PostgreSQL, Redis, MinIO, API/workers, Novu and Postal stay on a persistent backend host. Supabase migration is deferred.

## Current boundary

Checkpoints 2a–2b provide signed dashboard forwarding, configuration validation, direct large-content transfers and a private Inbox HTTP gateway. Checkpoint 2c adds the split-web Compose/Caddy profile, authenticated Inbox WebSocket relay, profile-aware preflight/public checks and encrypted recovery support. Ordinary proxy requests/responses remain capped at 4 MiB. **No Vercel project or public backend has been deployed.** Local full-stack, ingress, browser and recovery checks passed; use the [acceptance ledger](acceptance.md) for measured results. The existing all-Compose profile remains available.

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

In Vercel mode the dashboard's `/novu/v1/inbox/*` route signs requests to `/v1/dashboard/inbox/*` on Flare. Every request requires a live Flare session and verified dashboard proof. Bootstrap checks the subscriber HMAC/application identifier, then stores a Redis binding between the native token hash and that session, organization, environment and subscriber record. Binding lifetime is capped by the live session, native token expiry and twelve hours. Later requests recheck those identities and permissions; revocation, environment/subscriber changes or missing Redis state fail closed. Binding expiry/loss requires a fresh authenticated HTTP bootstrap. Use **Reconnect Inbox** to refetch subscriber access and replace the retired SDK session; closing and reopening the native popover alone retains its session. The dashboard revalidates its session and performs an uncached Inbox read every 15 seconds while visible, and checks Inbox access on visibility resume. Failures hide stale content and offer a generic retry message. Viewer sessions use an escaped, read-only notification list without automatic seen/read writes. Leaving the page, changing session/tenant/role, or reconnecting retires the previous client and closes its socket, including late initialization. Reconnection never creates a missing Redis binding or bypasses a revoked Flare session.

Only the default Inbox operations in pinned Novu 3.19.0 are allowed: session, notification feed/count, read/unread/archive/snooze/delete/actions and preferences. Viewer sessions can read; mutations require write access. The gateway never forwards a Novu administrator API key and is excluded from the public OpenAPI, SDK and MCP catalog. Responses retain Novu's SDK envelope and are bounded to 2 MiB. Gateway requests are bounded to 64 KiB. Native authorization is bound into the forwarding signature.

Set the backend’s `NOVU_PUBLIC_API_URL` to `${WEB_ORIGIN}/novu`. Replace the example localhost value when deploying. A native Novu URL here sends the browser outside the Flare HTTP gateway. In the split profile, `NOVU_PUBLIC_WS_URL=https://<STAGING_WS_HOST>` reaches Caddy and then Flare's authenticated relay; native `novu-ws:3002` remains private. The existing all-Compose `/novu` and native WebSocket routes retain their compatibility behavior.

The split relay requires the exact dashboard Origin, native token and Flare session identifier established by HTTP bootstrap. It checks the live session, membership, environment, subscriber and Redis binding before connecting upstream, before forwarding each event, and after a five-second idle interval following each completed check. Each authorization has a two-second deadline. The conservative idle forwarding cutoff is nine seconds: up to two seconds remaining in an in-flight check that read authority before revocation, five seconds until the next check, and two seconds for that check. This budget assumes a responsive event loop; physical socket closure and network receipt can occur later. Each new event is withheld until its immediate recheck succeeds. Only notification/count events flow outward, and browser application events are rejected. Connection counts, event/queue sizes and authorization deadlines are bounded. Native transport loss allows up to five SDK reconnect attempts, each with fresh authorization; an authority failure closes access and requires a fresh bootstrap. These are application limits, not proof of public network latency or actual Vercel connectivity.

The pinned SDK sends its native JWT in the WebSocket query. Both checked-in Caddyfiles suppress request URI and headers from runtime error logs; do not add unrestricted access logging, request tracing or an upstream proxy that records those queries. Flare also redacts this route from request logs. Keep native admin and WebSocket ports private.

## Split backend profile and public checks

Merge `ops/staging/env.example` and `ops/staging/env.split-web.example` into one private backend `.env`, without duplicate keys. Set `STAGING_WEB_MODE=vercel`, the matching forwarding secret, exact public origins and the reviewed internal endpoints. The split overlay requires `FLARE_DASHBOARD_INBOX_WS=true` and `NOVU_WS_URL=http://novu-ws:3002`; `TRUST_PROXY` is only `172.30.250.10`. It disables the legacy web-IP forwarding mode. The private `flare-web` service is retained for a reviewed rollback but has no split Caddy dashboard site.

From the prepared backend checkout, use this exact ordered profile for all lifecycle commands:

```sh
flare_compose=(docker compose --project-name flare-staging --project-directory "$PWD" \
  --env-file "$PWD/.env" -f docker-compose.yml -f docker-compose.staging.yml \
  -f docker-compose.staging-split-web.yml)
# Only when Postal receiving is configured; append last and retain on every command:
# flare_compose+=(-f ops/staging/postal-inbound.yml)
node scripts/staging/preflight.mjs
"${flare_compose[@]}" config --quiet
"${flare_compose[@]}" config --format json | node scripts/staging/validate-model.mjs --split-web
# Add --postal-inbound to validate-model when the receiving overlay is selected.
"${flare_compose[@]}" run --rm --no-deps ingress caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

The rendered model contains secrets: pipe it directly to the validator, never print or save it in a ticket. Follow [staging bootstrap](staging.md#secrets-and-internal-relay-trust) to initialize Postal/Novu, seed the owner and configure independent environment credentials before opening ingress. After those prerequisites and private validation:

```sh
"${flare_compose[@]}" up -d --build --wait
```

The dashboard DNS and HTTPS certificate belong to Vercel. API, tracking and WS DNS belong to the backend host; mail A/PTR and receiving DNS remain Postal requirements. Caddy exposes `/v1/*` and `/t/*` on API/tracking hosts and only `/socket.io` paths on the WS host. The WS target is Flare's API, never public native Novu. Caddy has no dashboard site in this profile. See [staging routing](staging.md#hostnames-and-routing).

After public DNS/TLS exist, copy `ops/staging/public-manifest.split-web.example.json` to a private path and replace its deliberately invalid placeholders. Keep its exact `version: 2`, `dashboard: "external"`, `ipv4` and five-host `hosts` shape. Run from outside the backend:

```sh
node scripts/staging/verify-public.mjs --manifest /absolute/private/path/public-manifest.json
```

Version 2 separately resolves the external dashboard's A/AAAA addresses, requires at least one and allows at most eight public addresses. It validates and connects to every resulting unique address, pinning each connection while retaining the dashboard hostname, SNI and ordinary TLS certificate verification. There is no second DNS resolution or redirect following. API, tracking, WS and mail still must resolve only to the configured backend IPv4; their AAAA records are rejected by this IPv4 backend profile. Tracking CNAME and mail PTR checks remain required. Any failed DNS check prevents all HTTPS probes. This does not verify Vercel account ownership, authenticated browser behavior or an Inbox WebSocket upgrade.

The version-1 manifest remains the all-Compose same-host contract. Do not relax it or replace expected IP checks to accommodate a split dashboard; select version 2 explicitly.

## Backup, recovery and rollback

Use `staging-split-web`, or `staging-split-web-inbound` with the receiving override, in [the backup utility](backup-recovery.md). The source containers must record the exact ordered file set. Both Caddy assets, backend `.env` including the forwarding secret, and nine persistent volumes are encrypted and captured. Restore starts only the six stores on an isolated network; application, Caddy and delivery services stay stopped.

Keep the Vercel account/project, release, domain/build settings, exact origins, preview restrictions and matching server-only secret under separate recovery custody. A backend restore does not restore Vercel. The disposable split-profile rehearsal checks preservation of populated local stores/configuration; it does not prove off-host recovery or an executed deployment rollback. Before switching back to Compose, review dashboard DNS/HTTPS ownership, origins, forwarding mode, the canonical file set and one-active-producer recovery policy. Do not run the archived application files automatically. Rehearse that cutover against isolated data before the pilot.

## Remaining deployment gates

Vercel functions have a documented 4.5 MB request/response payload ceiling. Direct transfer bodies bypass that function; small grants and normal dashboard calls remain within the 4 MiB proxy guard. [Vercel function limits](https://vercel.com/docs/functions/limitations).

Local fixtures and the disposable stack establish application/configuration behavior. Before declaring split hosting ready, record these results on the actual Vercel project and backend:

1. Import/build with the settings above; exact custom origin and preview isolation; signed client-IP behavior through Vercel's actual headers.
2. HTTPS/public checks, large transfers and download headers through the real ingress, with no large payload routed through a Vercel function.
3. Password/MFA login, environment switching, session revocation, viewer restrictions, expired grants and lost-response retry against real origins.
4. Pinned Inbox HTTP and WebSocket delivery, reconnect after network/native service loss, idle revocation within the configured bound, expiry, Redis binding loss and fresh-bootstrap recovery. Keep native administration private throughout.
5. Off-host encrypted restore, independent key retrieval, Vercel configuration recovery, alerts, host reboot and reviewed rollback to Compose.

Keep the existing Compose deployment available until these gates pass. Public DNS/PTR, real Postal sending/receiving, physical pool isolation, receiver authentication and inbox placement remain separately unverified. No account, domain or backend host is created by this checkpoint.
