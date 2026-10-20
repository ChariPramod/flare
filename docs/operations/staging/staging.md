# Staging pilot: email, Inbox and password/MFA

No staging host, domain or DNS zone has been provisioned. These files prepare a provider-neutral backend host, with either the dashboard on the same Compose deployment or on Vercel. They do not deploy resources or certify external delivery. The initial pilot uses self-hosted Postal, email and Inbox, with password login and MFA. OIDC, SES, SMS, push and chat remain separate future checks.

The owner resumed staging preparation on 2026-10-14; hosting budget, region, domain and access details are still pending. The earlier infrastructure baseline, `82ec8c9`, passed all five jobs in [CI 38613630116](https://github.com/ChariPramod/flare/actions/runs/38613630116), including isolated Caddy routing/header checks. Resume provisioning only after those infrastructure decisions and access are available.

The current ordered engineering and deployment work is in the [staging execution plan](../../planning/staging-execution-plan.md). Completed local hardening is separate from the public/provider/recovery gates required to open the pilot.

Use the [encrypted backup and isolated recovery runbook](../recovery/backup-recovery.md) and [tested alerting configuration](../monitoring/alerting.md) when arranging staging operations. Actual off-host restoration, key retrieval, notification receipt and host disk monitoring require the owner's infrastructure and remain release gates.

Start with the [owner setup checklist](staging-owner-checklist.md) if you do not yet have hosting, a domain or DNS access. It includes a provider-support question and a handoff form without secrets.

## Provisioning checklist

- Choose a dedicated host with a stable public IPv4 address, permitted outbound TCP 25 and control of its reverse-DNS/PTR record. Confirm these capabilities with the hosting provider before purchase; a generic VM does not imply mail egress is allowed. An initial planning allocation is 8 vCPU, 16 GiB RAM and 150 GiB SSD on Ubuntu 24.04 amd64, matching CI's OS family. This allocation has not been capacity benchmarked.
- Obtain a staging domain or delegated DNS zone controlled by the operator. Use a dedicated sender/receiving domain and explicitly controlled recipient mailboxes; keep the pilot separate from production traffic and customer lists.
- Provide a non-root SSH operator with sudo and Docker access, recovery access, an owner email, an ACME contact email, a private secret store and an encrypted off-host backup destination. Docker access is equivalent to administrative host access. Install Docker Engine/Compose v2, Node 22, pnpm 10.32.1 and OpenSSL.
- Record the approved hosting region and budget, owned DNS zone and operator access, host address, SSH username and local key-file path, backup destination, and the named person responsible for secret custody and recovery. Supply credentials through the secret store or private local files, never in repository documentation. Provisioning remains pending until these deployment inputs are available.
- Allow public TCP 80/443 and optionally UDP 443 for Caddy. Allow inbound TCP 25 only when testing Postal receiving, using the explicit override below. Do not publish databases, Redis, MinIO, Postal administration, native Novu administration or Flare's authenticated SMTP submission port.
- Check that `172.30.250.0/24` does not overlap host/VPN routes. The template reserves `.10` for Caddy and `.11` for the web service; dynamic containers are allocated only from `172.30.250.128/25`, preventing startup-order collisions with those trusted addresses. Changing this subnet requires reviewing the overlay, both static IPs, allocation pool, trusted proxy addresses and preflight together.

## Hostnames and routing

For all-Compose use `ops/staging/env.example`; for a Vercel dashboard also apply `ops/staging/env.split-web.example`. Replace examples and merge the selected settings into the deployment checkout's private `.env`; do not append duplicate keys. Keep one canonical `.env` for Compose interpolation and service `env_file` values. Preserve internal endpoints such as `postgres`, `minio`, `novu-api` and `postal`; these are not public origins.

| Setting                  | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `STAGING_DASHBOARD_HOST` | Dashboard and its authenticated `/api` and `/novu` proxies          |
| `STAGING_API_HOST`       | Flare `/v1/*` API and signed `/t/*` tracking routes                 |
| `STAGING_WS_HOST`        | Only Inbox `/socket.io` paths; Flare-authorized relay in split mode |
| `STAGING_TRACKING_HOST`  | Sender-domain tracking alias, normally `track.<sender-domain>`      |
| `STAGING_ACME_EMAIL`     | Certificate operations contact                                      |

For all-Compose, point dashboard, API and WebSocket A records to the backend host. For split hosting, configure the dashboard domain on Vercel using its assigned DNS records; point API and WebSocket A records to the backend. The reviewed backend public checker is IPv4-only and rejects backend AAAA records. External dashboard A/AAAA records have separate checks described below; do not add backend IPv6 without an explicitly reviewed profile. Set the tracking hostname's CNAME to the API hostname, matching the record returned by Domains. Keep `TRACKING_URL=https://<API hostname>` as the CNAME target; actual MIME tracking links use the sender domain's tracking hostname. The Caddy configuration obtains certificates for both names. If additional sender domains need tracking, explicitly add their names to the ingress configuration and certificate plan before enabling tracking.

For Postal, set A and PTR consistently for `POSTAL_HOSTNAME`, publish the receiving MX records and the exact SPF, DKIM and return-path records generated by Postal and Flare. Authorize the sender domain in Postal as well as in Flare. Configure `POSTAL_SPF_HOST`, `POSTAL_RETURN_PATH` and the `dns`/`postal.smtp_hostname` sections of private `ops/postal/config/postal.yml`; preflight checks SMTP hostname, MX, SPF and return-path consistency and rejects their generated localhost settings. Postal's `web_hostname` may remain specific to the private administrative tunnel. If using Postal route-address routing, also replace `dns.route_domain` and configure its DNS; this optional route-address setting is not checked by preflight. Keep `postal.allowed_request_destinations: [flare-api]`. Use [provider setup](../../product/email-pipeline.md#provider-setup) and [signed inbound routing](../../product/inbound.md), including Postal RawMessage/BodyAsJSON submission to the verified domain's callback. Real inbound requires the optional port-25 override and DNS route to Postal.

Postal's raw API cannot promise mandatory TLS to final recipient servers. Use the default `enforce_tls=false` for this explicitly opportunistic-TLS pilot; a domain requiring mandatory final-hop TLS needs a transport that actually supports that guarantee. Do not set a capability flag merely to bypass this restriction.

## Choose the canonical Compose profile

Use one explicit file set and project identity for bootstrap, deployment, maintenance and backup. In a Bash or Zsh shell at the canonical backend checkout, select **one** of these arrays.

All-Compose dashboard:

```sh
flare_compose=(docker compose --project-name flare-staging --project-directory "$PWD" \
  --env-file "$PWD/.env" -f docker-compose.yml -f docker-compose.staging.yml)
```

Vercel dashboard with split backend:

```sh
flare_compose=(docker compose --project-name flare-staging --project-directory "$PWD" \
  --env-file "$PWD/.env" -f docker-compose.yml -f docker-compose.staging.yml \
  -f docker-compose.staging-split-web.yml)
```

Only when Postal receiving is configured and authorized, append its override **last**, before using the array:

```sh
flare_compose+=(-f ops/staging/postal-inbound.yml)
```

The split profile mounts `ops/staging/Caddyfile.split-web` and exposes no dashboard site on the backend. `STAGING_WEB_MODE=vercel`, the dedicated `FLARE_DASHBOARD_PROXY_SECRET` shared with Vercel, `FLARE_DASHBOARD_INBOX_WS=true`, and `NOVU_WS_URL=http://novu-ws:3002` are required. It narrows `TRUST_PROXY` to Caddy at `172.30.250.10` and disables legacy web forwarding. Set `NOVU_PUBLIC_API_URL=${WEB_ORIGIN}/novu` and `NOVU_PUBLIC_WS_URL=https://<STAGING_WS_HOST>`. Vercel server-only configuration and preview isolation are specified in [vercel.md](vercel.md).

Private `flare-web` remains in Compose for a reviewed rollback; split Caddy does not route to it. API/tracking reach Flare on `/v1/*` and `/t/*`; split WebSocket traffic reaches Flare's authenticated relay before native Novu. No database, native administration or native WebSocket port becomes public. Keep the chosen mode/file order in the deployment runbook. A shell array is not persisted across terminals; recreate the same selection when reopening a session.

## Secrets and internal relay trust

Create fresh staging secrets with the existing setup procedure in a separate checkout; never reuse acceptance/development credentials or overwrite an existing deployment's `.env`. Then replace development hostnames, owner settings and certificates. Keep `.env`, the relay private key, Postal signing key and Postal configuration mode `0600`; secret directories should be `0700`. Keep the relay key owned by the numeric `FLARE_UID` configured for its service.

Use a private CA to issue the internal relay server certificate with a **DNS SAN for `flare-smtp-relay`**, server-auth usage and a matching private key. Put the leaf plus any intermediates in `ops/certs/relay.crt`, its private key in `ops/certs/relay.key`, and the trusted CA bundle in `ops/certs/relay-ca.pem`. The staging overlay mounts the CA bundle into Novu and sets `NODE_EXTRA_CA_CERTS`. Public ACME certificates cannot normally cover this internal service name; the development self-signed localhost certificate is rejected. Never copy the private CA signing key into the deployment containers.

Leave public ingress stopped during first-time bootstrap. Postal's existing port 5000 and other administrative ports remain bound to `127.0.0.1`; they are reachable only from the host or an explicitly authorized tunnel. Use the selected `flare_compose` array above throughout:

1. After configuring secrets, hostnames and the relay CA, start private Postal/Novu dependencies:

   ```sh
   "${flare_compose[@]}" up -d --build --wait postal novu-api novu-worker novu-ws
   ```

2. Initialize the Postal organization/server and native Novu owner/organization using private administration over SSH. Set the provider bootstrap credentials and `NOVU_DEVELOPMENT_API_KEY` / `NOVU_PRODUCTION_API_KEY` in private `.env`, each from its proper provider/environment. Configure `MAIL_TRANSPORTS` with named instance IDs and private environment references for real sending; the legacy `POSTAL_API_KEY` alone is insufficient. Keep `MAIL_SANDBOX=false` and follow the [sender reputation guide](../../product/sender-reputation.md) for route isolation, callbacks and per-instance public keys. Configure Postal sender authorization and signed callbacks. Keep the global `NOVU_APPLICATION_IDENTIFIER` empty: each Novu environment has its own identifier and must be configured separately in Settings after owner login.
3. Start the private Flare services and explicitly create the owner and tenant environments. **Migrations alone do not create an owner account.** The identity seed uses the configured `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` and `SEED_API_KEY`:

   ```sh
   "${flare_compose[@]}" up -d --build --wait flare-api flare-web flare-worker flare-smtp-relay
   "${flare_compose[@]}" exec -T flare-api node packages/db/dist/seed.js
   ```

4. Record the intended operator user UUID in `FLARE_OPERATOR_USER_IDS` and recreate the API with that environment. The allowlist is separate from tenant ownership. Run the offline preflight and ingress validation below, then start ingress. Log in at the configured HTTPS dashboard origin, enroll MFA, and configure each environment's own Novu application identifier and confirm its API key in Settings. Never use a raw HTTP tunnel origin for browser mutation requests while `WEB_ORIGIN` remains the HTTPS dashboard; a pre-ingress browser session requires a secure tunnel and matching hostname/origin routing.
5. Optionally set `SEED_SUBSCRIBER_EMAIL` to a mailbox you control and `SEED_DOMAIN` to the dedicated pilot domain, recreate the API service to load changed environment values, then create the sample domain/subscriber/Inbox workflow:

   ```sh
   "${flare_compose[@]}" up -d --no-deps --wait flare-api
   "${flare_compose[@]}" exec -T flare-api node packages/mail/dist/seed.js
   ```

Both seeds preserve existing organization/domain data; rerunning the identity seed does not update an existing owner's password or Novu settings. Sample seeding is optional and does not send email. Publish and verify the returned DNS records before any controlled pilot send. Application-level credentials and environment mappings require live smoke tests; offline preflight cannot certify values already stored in the database.

## Offline preflight and deployment

Run from the deployment checkout after installing dependencies:

```sh
node scripts/staging/preflight.mjs
# Or inspect another prepared checkout without changing it:
node scripts/staging/preflight.mjs --root /srv/flare-staging
```

Preflight performs no DNS requests, network calls, Docker commands or cloud operations. It reports only fixed issue codes and configuration field names, never values. It rejects sandbox mode, missing named transports and empty/invalid operator UUID allowlists. It validates strict named transport configuration and referenced private values without exposing them, and checks public origins, independent secrets, private file modes, duplicate/interpolated env entries, provider configuration, relay SAN/key/date/CA trust using local OpenSSL, Postal key correspondence (including every named transport referencing the bundled `postal` host), callback allowlisting, database-password consistency, and the SMTP/MX/SPF/return-path configuration described above. Blank provider credentials or generated SMTP/sender-domain localhost settings fail until bootstrap is completed. OpenSSL/LibreSSL chain validation and Node's explicit SAN check work on both the Mac and Linux. The report always lists outstanding external checks, including the live operator identity/MFA session, organization approval, route binding, physical pool isolation and fresh sender readiness; a clean result is configuration evidence only. Preflight cannot certify that an allowlisted UUID exists or has MFA enabled. Establish those gates in `/operator` before any real pilot send, using the [sender reputation operating guide](../../product/sender-reputation.md).

For CI or a Docker-equipped developer host, `bash scripts/staging/check-config.sh` validates all-Compose and split-web profiles, each with and without the receiving override, plus both pinned Caddy configurations using disposable synthetic settings. Configuration validation uses `--network none`. A second runtime check starts Caddy and synthetic Node upstreams on an internal Docker network, with no published ports, deployment secrets or persistent volumes. It exercises private-route denial, upstream routing, WebSocket upgrade forwarding, rejection of spoofed client-IP headers and runtime-error credential redaction using HTTP fixture origins; it cannot issue public certificates or launch Flare application services. Actual HTTPS issuance, distinct-client rate limiting and host reboot recovery remain deployment checks. The ordinary unit suite also tests the preflight against a generated private-CA chain and rejected configurations. See [testing](../../development/testing.md) for the remaining service/browser acceptance commands.

Validate the merged model without printing expanded credentials:

```sh
"${flare_compose[@]}" config --quiet
# In split mode; append --postal-inbound if that override is selected:
"${flare_compose[@]}" config --format json | node scripts/staging/validate-model.mjs --split-web
# In all-Compose mode omit --split-web (retain --postal-inbound when selected).
"${flare_compose[@]}" run --rm --no-deps ingress caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${flare_compose[@]}" up -d --build --wait
```

The rendered JSON contains secrets; send it directly to the validator and never print it into deployment logs or tickets. The overlays use ordinary Compose merges, with no `!override` extension. Existing loopback ports stay loopback; adding the overlay does not remove them. The native Novu API/dashboard and all database services have no public ingress routes. Caddy responds 404 for `/internal` and `/v1/internal`, including descendants, and health/metrics routes. Its administration API is disabled. In all-Compose mode, Caddy overwrites `X-Flare-Client-IP` on requests sent to the dashboard; the web service forwards a validated IP only when `FLARE_FORWARD_CLIENT_IP=true`, and Flare trusts exactly the Caddy and private web addresses. Split mode instead uses signed Vercel forwarding and trusts only Caddy for direct ingress. Both Caddy assets remove URI/header fields from runtime errors because the native SDK carries its WebSocket JWT in a query. Do not add unrestricted request/access logging at an upstream proxy. Do not expose the web/API loopback ports via a second proxy that bypasses this boundary, or trust an entire private/public subnet.

The staging overlay gives PostgreSQL, both Redis services, MinIO, MariaDB and MongoDB `restart: unless-stopped`, matching the application daemons. A host or Docker daemon restart therefore restarts the durable dependencies as well; explicitly stopped containers remain stopped. Initialization and migration jobs remain one-shot. Restart policies do not enforce Compose health-based startup ordering during daemon recovery: verify service readiness after a reboot, and use the same Compose `up -d --wait` command to reconcile unhealthy services before resuming the pilot. Include a controlled host reboot and readiness check in staging acceptance; configuration validation alone does not prove reboot recovery.

If receiving is enabled, keep the final `ops/staging/postal-inbound.yml` selection in `flare_compose` on every subsequent command. That file publishes native Postal SMTP on TCP 25. It does not publish Flare SMTP AUTH on 2525. Configure host/provider firewalls independently. Keep the chosen Compose file set in the deployment runbook; using a different set later changes the desired services and port bindings.

## Pilot acceptance and recovery

### Public DNS and HTTPS verification

After publishing the actual records and starting ingress, copy the correct example to a private file outside the checkout. Replace its documentation-only IP and `.invalid` names; unchanged examples deliberately fail validation.

| Deployment       | Example                                              | Exact manifest shape                                   |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| All-Compose      | `ops/staging/public-manifest.example.json`           | `version: 1`, `ipv4`, `hosts`                          |
| Vercel dashboard | `ops/staging/public-manifest.split-web.example.json` | `version: 2`, `dashboard: "external"`, `ipv4`, `hosts` |

Both require exactly five distinct hostnames in `hosts`: `dashboard`, `api`, `ws`, `tracking`, `mail`. No credentials, URLs or custom probe paths are accepted. Version 2 is an explicit external-dashboard selection, not automatic relaxation of version 1.

Run from a machine outside the backend server:

```sh
node scripts/staging/verify-public.mjs --manifest /absolute/private/path/public-manifest.json
```

Both modes require backend API, WS, tracking and mail A records to match the intended public IPv4, reject backend AAAA records, verify tracking CNAME to API and mail PTR. Version 1 applies those same IPv4 rules to the dashboard. Version 2 resolves dashboard A/AAAA separately, requires one or more public addresses with a maximum of eight, and rejects private/reserved/scoped or unsupported address ranges. The report checks every resulting unique dashboard address; it does not assert ownership of the Vercel project or domain.

Every HTTPS connection is pinned to its already validated address with no second DNS resolution, retaining hostname/SNI and ordinary certificate trust. The peer address must match, and a certificate needs at least seven days of remaining validity. Requests have an absolute five-second timeout, bounded headers/body and no redirects. Response content and remote errors are never printed. Any DNS failure prevents all HTTPS probes.

The HTTPS probes expect dashboard `/login` to return HTML with status 200, API and tracking `/v1/domains` to return unauthenticated JSON with status 401, and websocket-host `/` to return 404. All four HTTPS hosts must deny `/health`, `/ready`, `/internal/metrics`, `/v1/internal` and `/api/internal` with 404. The tracking probe checks its API ingress mapping, not tracking-event delivery. The websocket probe checks the root boundary, not an authenticated Inbox connection. The mail hostname receives DNS/PTR checks only; Postal SMTP is not an HTTPS service.

Output contains only fixed service/check/result codes and an explicit `unverified` list. Exit 0 means these public checks passed; exit 1 means invalid input or a failed check. Any DNS failure prevents HTTPS probes. Save the report privately with the deployment commit, time and probe source network. It does not certify SMTP ingress/egress, SPF/DKIM/DMARC, physical pools, callbacks, password/MFA, Inbox sessions, backups, alerts or reboot recovery. HTTP-to-HTTPS redirects remain a separate check. Backend IPv6 remains unsupported by these profiles. Version-2 dashboard IPv6 checks apply only to the separately hosted dashboard; do not suppress a backend AAAA failure to claim IPv6 coverage.

### Real pilot and recovery gates

Confirm public DNS and certificates from outside the host, HTTP-to-HTTPS redirects, authenticated password/MFA login, browser Inbox delivery/read state, and 404 responses for public internal/native administration routes. Verify the client-IP limiter with distinct clients and spoofed forwarding headers. Then create/verify the real domain, submit to controlled recipients, inspect delivered MIME/DKIM and provider delivery callbacks, test suppression/preferences, and receive a signed Postal RawMessage. Confirm that provider acceptance and final delivery remain distinct. Record DNS/provider evidence separately from local/CI simulations.

For split hosting, repeat the pinned SDK flow through actual Vercel and public WS TLS: new events/counts, network/native-service reconnects (at most five attempts), session revocation/expiry, viewer read-only behavior, environment change, missing Redis binding and a fresh HTTP bootstrap. The relay rechecks authority before each event and waits five seconds after a completed idle check, with a two-second authorization deadline. Its conservative idle forwarding cutoff budget is nine seconds (a remaining in-flight check, the interval and the next check); distinguish that budget from client-observed network closure. A public WS root 404 or synthetic upgrade alone does not establish these session guarantees. Record the observed deployment behavior separately from local tests.

Public smoke checks should expect `/ready`, `/health` and `/internal/metrics` to return 404. Run dependency-readiness checks on the host's loopback API or through an authorized SSH tunnel; do not weaken ingress to make a public health probe pass. The Python staging checks' `--staging-internal` mode is reserved for that loopback/tunnel endpoint, while ordinary staging mode checks the public boundary. Enroll the pilot owner in MFA and store recovery codes with the designated custodian before additional accounts join.

Back up the complete stores and secrets using [deployment recovery](../deployment.md#backup-and-restore), including Caddy's persistent certificate volumes, and select the exact `staging`, `staging-inbound`, `staging-split-web` or `staging-split-web-inbound` profile. Split bundles encrypt the backend forwarding key and both Caddy assets; Vercel account/project/origin/build settings and matching secret need separate recovery custody. Complete an isolated restore using the off-host backup before opening the pilot more broadly. Preserve records of ambiguous sends; never replay them automatically after restoration. No production availability, mail reputation, recovery objective or external acceptance is claimed by this template.

Implementation references: [Caddy 2.10.2 release](https://github.com/caddyserver/caddy/releases/tag/v2.10.2), [automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https), [reverse-proxy behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [Compose merge rules](https://docs.docker.com/reference/compose-file/merge/).
