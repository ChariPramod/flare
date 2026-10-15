# Sender reputation operating guide

Flare's first real-mail pilot is Pareto and manually approved customers. Domain ownership alone does not authorize sending. Real sends require organization approval, an explicit traffic classification, a reviewed named provider route and the applicable domain-readiness checks. Hosting, domains, public IPs and provider accounts remain deferred; local and CI simulations do not establish external deliverability.

This guide describes the implemented controls. Use [staging](staging.md) for infrastructure and [email pipeline](email-pipeline.md) for MIME, callback signatures, attachment limits and transport semantics. Provider acceptance, recipient-server acceptance and inbox placement are different outcomes.

## Pilot defaults and scope

New and existing organizations start in `pending_review`. An operator can approve or suspend them. Default limits are **100 logical recipients per rolling 24 hours** and **10 recipient attempts per rolling 60 seconds**, shared across domains and environments in the organization. These conservative pilot defaults are configurable operator policy, not universal mailbox-provider requirements.

The daily budget includes outstanding reservations and consumed logical recipients in the window. A retry of the same message/recipient does not reserve a second logical daily unit. Each actual network attempt counts against pacing, including retry/failover attempts. Message acceptance and quota reservation are transactional; a rejected strict batch rolls back its reservations. Canceled, failed or suppressed recipients release unused reservations. A dispatch already attempted retains its consumed accounting, including uncertain outcomes.

A message with more recipients than the remaining minute allowance is delivered in bounded chunks. Remaining work stays durable with `next_attempt_at`; Redis loss cannot reset its deadline. `held` preserves an accepted message, its MIME and recipient identity while policy, pacing or readiness prevents another attempt. It is not a delivery guarantee. Before the first attempt, authorized tenants can cancel or reschedule a held message; a message already started cannot be recalled or edited this way.

If a known sender domain loses verification or its required TLS capability becomes unavailable before campaign admission, broadcasts and automations pause durably with the same pending recipient/step. Accepted inbound forwarding jobs also remain pending across approval, quota and sender-readiness blocks, retaining the original receipt and rule. These operations do not create a message, reserve quota or consume failure retries until eligibility returns. Unknown senders and invalid content still fail validation. Direct HTTP submissions report `403` with `domain_unverified` or `required_tls_unavailable`; SMTP maps the temporary TLS capability block to `451` and exhausted admission capacity to `452`. Missing sender proof and permission denials remain permanent SMTP rejections.

Every email entry path uses the shared pipeline: direct/batch API, authenticated SMTP, workflow email submitted through that relay, broadcasts, automations and inbound forwarding. Broadcasts are classified as marketing. Other paths need an explicit `traffic_class` or an operator-set credential/organization default. An API key's classification binding cannot be overridden by the caller. These are email controls; they do not impose email-recipient quotas on Inbox, SMS, push or chat.

HTTP request limiting is independent: it limits API requests, not sends, recipients or campaign volume. Passing an HTTP token bucket does not bypass the sending policy.

`MAIL_SANDBOX=true` is an explicit isolated development/acceptance exception. It permits only the unauthenticated Mailpit SMTP adapter on approved local hosts and ports, with no named transports, credentials or real failover. Setup `--dev` and disposable acceptance use it. Sandbox messages are marked, do not consume real sending quota and cannot later be routed to a real adapter. Domain, recipient suppression and normal authentication checks still apply. Never use sandbox mode as a real-mail approval shortcut.

## Bootstrap a platform operator

1. Create a real user through the normal identity seed/invitation flow, sign in and enable MFA in account security. Store recovery codes privately. MFA enrollment currently uses the tenant account-security flow, so enroll before removing any bootstrap membership. There is no operator-account creation command or privileged public signup endpoint.
2. Obtain that user's UUID from its authenticated `/v1/auth/me` response (`user.id`), or an authorized database identity lookup. Put only the UUID in `FLARE_OPERATOR_USER_IDS`, comma-separated for multiple users. The default empty value grants nobody access. A tenant role, organization name or API key cannot grant operator authority.
3. Recreate the API service with the updated private environment. With the same live user session, open `/operator` on the dashboard origin. A user without tenant memberships can use the operator-only login redirect once allowlisted and MFA-enabled; tenant headers and memberships do not grant or constrain this authority.
4. Enter a **fresh** authenticator code or unused recovery code for operator step-up. A code already consumed at login cannot be replayed; wait for a new TOTP interval or use another recovery code. Proof lasts 15 minutes and is bound to this live session.

Every privileged request checks the JWT, allowlist, current unrevoked/unexpired database session, enabled MFA and recent proof. Mutations recheck authorization inside their database transaction. MFA changes clear proof. Session revocation/expiry or disabling MFA denies access; the dashboard hides stale controls and redirects after a rejected session check. Proof expiry hides controls until another step-up. Operator requests have their own limiter and step-up attempts have a stricter limiter.

Use the dashboard or the session-authenticated operator HTTP API. The SDK, CLI and MCP use tenant API keys and cannot become operators by supplying a session token as an API key. Do not copy browser sessions or recovery codes into command history, screenshots, traces or issue reports.

## Configure named transport instances

Real routes reference stable instance IDs in `MAIL_TRANSPORTS`, a JSON array. Each instance names a provider, actual server/account, physical pool and `credential_version`. IDs `postal`, `ses` and `smtp` are reserved for legacy attempts and cannot be named instance IDs. Credentials are referenced by environment-variable **names**, never embedded JSON values. Load the referenced values from the deployment's private secret store into every API, worker and SMTP service that uses the mail pipeline.

Example shape for a Postal instance (replace the identifiers and URL with the actual provisioned infrastructure):

```json
[
  {
    "id": "customer-transactional-postal",
    "kind": "postal",
    "server_id": "postal-customer-server",
    "pool_id": "customer-transactional-pool",
    "credential_version": "v1",
    "url": "http://postal:5000",
    "api_key_env": "CUSTOMER_POSTAL_API_KEY",
    "webhook_public_key_env": "CUSTOMER_POSTAL_WEBHOOK_PUBLIC_KEY"
  }
]
```

`CUSTOMER_POSTAL_WEBHOOK_PUBLIC_KEY` contains the PEM public verification key, not a file path or private key. The environment reference does not read a `_FILE` automatically. Keep actual values out of this file and the repository. In `.env`, store the JSON as one quoted line; secret-manager injection is preferable for multiline PEM values.

Named SES instances instead require `region`, `configuration_set`, `access_key_id_env`, `secret_access_key_env`, optional `session_token_env`, and a distinct `sns_topic_arn` per instance. The SES identity probe uses those named credentials, not ambient host AWS credentials. Grant the required send/configuration inspection permissions and `ses:GetEmailIdentity` for readiness checks. Named SMTP instances require `host`, numeric `port`, `secure`, `delivery_tls_required`, and either both `username_env`/`password_env` or neither. Final-hop TLS assertions must reflect the relay's actual behavior.

When `MAIL_TRANSPORTS` is set, the reviewed route's ordered `transport_instances` controls eligible failover. Legacy `TRANSPORT`/`TRANSPORT_PRIORITY` and global provider credentials remain compatibility configuration, but unnamed adapters cannot satisfy a real approved route. Do not expect legacy credentials alone to resume sending after this upgrade.

For named Postal events configure `/v1/events/postal/INSTANCE_ID` with the matching signing public key. The generic Postal callback is not a substitute in named mode. Keep Postal's internal destination allowlist explicitly permitting `flare-api`. Named SNS callbacks use `/v1/events/sns/INSTANCE_ID`, the configured instance's exact topic ARN and correlate only to attempts from that instance; authenticate provider callbacks as described in the pipeline guide. Retain the legacy Postal public key and SES topic settings until historical sent messages have drained: their callbacks still need authenticated reconciliation. Named callbacks require strict instance/provider-ID correlation; temporarily unavailable attempt correlation returns 503 so the provider can retry. Native inbound Postal configuration is separate from outgoing route bindings.

Instance snapshots include a keyed configuration fingerprint, not credential material. Endpoint, credential, key-reference or identity changes invalidate old snapshots/evidence. Increment `credential_version` during deliberate rotation, publish a new reviewed route revision and refresh domain evidence. Old accepted messages remain pinned; changing configuration does not silently move them to the new credential or pool.

## Register and bind routes

In `/operator`, use **Provider route registry**:

1. Create a route for exactly one purpose: transactional or marketing, customer or Pareto trust tier, and optionally critical Pareto transactional traffic.
2. Select configured named instances in failover order. Record the actual public egress IPs and a reference to reviewed provider/server/pool evidence. Mark evidence reviewed only after that infrastructure has been checked. Draft routes can remain unverified.
3. Publish the revision. Bind its UUID and revision under the selected organization's sending policy. Policy changes use `expected_revision` and a reason; a stale revision returns 409 and requires refresh/review.

Route names and `server_id`/`pool_id` labels do not create physical isolation. Configure and verify the underlying Postal servers/pools, provider accounts and IPs yourself. The registry rejects public-IP or provider/server/pool overlap across traffic, trust and critical boundaries, including historical revisions. It does not discover an unreported shared IP or prove the supplied pool labels are truthful. Shared-IP providers must not be described as dedicated isolated pools without evidence.

Purpose cannot change across revisions. A revision can be disabled permanently; recovery uses a new revision and explicit policy rebinding. Disabling a route prevents another attempt for messages pinned to it. Rebinding changes new admissions, not the immutable route snapshot of previously accepted messages. Route creation and disabling are audited; organization policy changes retain actor, session, reason and before/after data.

Marketing requires `marketing_enabled=true` and its own route binding. Pareto critical transactional sending additionally requires the operator to bind an existing API key with `critical_sending=true` and an appropriate traffic class. Pareto organization ownership alone grants no critical-route access. The operator dashboard exposes this credential binding separately; ordinary API-key creation cannot self-grant it.

## Ownership and Production readiness

Ownership verification answers whether the tenant controls the sender domain. Production transport readiness asks whether a particular configured transport can send authenticated mail for that domain now. Approval, ownership, transport readiness and route verification are separate gates.

Production requires a verified sending-enabled domain, fresh DNS/DKIM and parsed DMARC evidence, and fresh received-header evidence for the selected named instance and exact sender domain. DNS/DMARC/receiver evidence must be **less than 24 hours old**, not future-dated. Rechecks can hold accepted work after evidence expires or configuration drifts. Refresh evidence before expiry; changing its timestamp without a new observation is not verification. A valid `p=none` DMARC record is acceptable. Organizational-domain inheritance and strict/relaxed alignment are evaluated; duplicate or malformed DMARC records do not qualify.

Development real-mail submissions still require operator approval, classification and a reviewed named route, but do not certify the complete Production evidence gate. The operator evidence screen deliberately displays the complete Production checks even for a Development domain. Mailpit is a separate sandbox path.

Postal requires its return-path CNAME for `<POSTAL_RETURN_PATH_PREFIX>.<sender-domain>` (default prefix `psrp`) to the configured `POSTAL_RETURN_PATH` target, and matching observed envelope MAIL FROM. Use the DNS records returned by Flare, authorize the sender in Postal, and verify public PTR/HELO and actual egress separately. Postal's raw API cannot promise required final-hop TLS; a domain requiring that guarantee needs a supporting route.

In the selected organization's **Domain transport evidence** panel:

1. Load the domain UUID. Select a currently configured instance and inspect the missing/stale/revoked evidence blockers.
2. Review the trusted receiving system's authentication results from an actual message on that instance. Record the observation time, proof reference, DKIM signing domain, envelope MAIL FROM domain and reported DKIM/SPF/DMARC pass results. Header From must exactly match the registered sender domain. Do not trust attacker-inserted `Authentication-Results` headers; identify results from the receiving system you control or independently trust.
3. Supply a reason and save. This is explicitly an **operator attestation**, not automatic signature verification of an uploaded message. No raw headers or credentials belong in the form. Passing this evidence gate alone does not approve the organization or establish inbox placement.
4. For SES, saving also runs a real read-only identity probe using named credentials. Custom MAIL FROM must succeed under that identity with `REJECT_MESSAGE` behavior. Caller-supplied SES probe results are rejected. Negative provider results remain visible as blockers; temporary probe failures return 503 without replacing prior evidence.
5. Revoke questionable evidence immediately with a reason. Inspection and revocation remain available if transport credentials/configuration become unavailable. New attestations require a currently configured real instance. Revocation prevents further Production attempts until fresh qualifying evidence exists.

## Approval, feedback and restoration

Review domain control, recipients and consent/purpose, sending limits, route evidence and readiness before approving. Organization approval is a reasoned compare-and-swap update, not an email or DNS side effect. Limits, default classification, marketing permission and route bindings are operator-only. Tenants can read their policy and held-message reasons but cannot approve themselves.

Authenticated feedback automatically suspends an approved organization on the first complaint by default, or a hard-bounce rate of at least 5% with at least 20 logical recipients in the rolling 24-hour sample. The hard-bounce numerator includes only logical recipients whose quota was consumed in the same 24-hour cohort; late feedback remains in history. Unknown bounce classifications remain unknown and do not inflate the hard-bounce count. These counts concern authenticated provider events and exclude Mailpit. Event deduplication avoids counting replayed feedback twice.

Hard bounces, unknown bounces, complaints and the configured repeated-soft-bounce rule create organization-wide suppressions across domains and environments. Ordinary tenant deletion removes manual suppressions only. **Restore a protected suppression** in `/operator` requires a current policy revision and review reason; it removes the block but preserves historical provider feedback. Restoration neither clears suspension nor rewrites terminal recipient states. Reapproval is a separate audited decision that records a feedback-review watermark. Previously reviewed logical feedback, including duplicate callbacks under new provider event IDs, does not immediately undo that decision. New unreviewed complaints or hard bounces can suspend sending again under the applicable thresholds; the 24-hour cohort/history is retained.

Complaint identity also covers receipts stored before classification metadata was introduced: the authenticated `complained` event type establishes the outcome. A fresh callback ID cannot count that same message/recipient complaint again or undo audited restoration. Legacy bounce classifications remain unknown unless new evidence establishes a classification.

A sending pause or suppression arriving after a provider handoff cannot recall that attempt. Policy, suppression, readiness and current TLS requirements are rechecked before later attempts. Keep provider-side controls available for emergency response as well.

## Inspection, CLI and recovery

The tenant Emails screens display policy state, usage, suspension reason, message traffic class, held reason, next eligibility check and pinned route revision. Read the recipient timeline and transport attempt diagnostics before retrying. Enhanced status, provider timestamps and observed IPs are bounded diagnostics; SES source IP is not evidence of its outgoing IP.

The following CLI examples use existing generic operation support after building/installing the current CLI and SDK. Supply `FLARE_API_URL`, `FLARE_API_KEY` and `FLARE_ENVIRONMENT_ID` through environment variables or the permission-restricted config file; remote APIs require HTTPS:

```sh
flare operations
flare request GET '/v1/sending-policy'
flare email status MESSAGE_UUID
flare domain verify DOMAIN_UUID
flare request GET '/v1/domains/{id}' --path '{"id":"DOMAIN_UUID"}'
flare request POST '/v1/emails/{id}/cancel' --path '{"id":"MESSAGE_UUID"}'
```

Replace UUID placeholders with actual IDs. `flare operations` is the installed package's authoritative operation catalog; rebuild packages if a newly added route is absent. There is no `flare policy approve`, route-publication or operator-MFA CLI command. Operator endpoints require a live session plus step-up and are unavailable to API-key tooling. Use `/operator` for route and readiness administration; `/docs` describes the session-only HTTP contract.

| Observation                                                | Action                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sending_not_approved` / `sending_suspended`               | Review the organization policy and audit trail; operator approval is required.                                                         |
| `classification_required` / `credential_class_mismatch`    | Supply an approved class or have the operator correct the default/key binding. Do not relabel a broadcast to evade marketing approval. |
| `route_required`, disabled route or configuration change   | Inspect the pinned revision, configured instance and credential fingerprint. New bindings do not reroute accepted mail.                |
| Stale/missing/revoked DNS or transport evidence            | Refresh actual observations and verify the intended provider; inspect full Production blockers in the operator panel.                  |
| Pacing or daily-capacity hold                              | Inspect `next_attempt_at`, reservations and rolling usage; let durable recovery recheck or review a policy change.                     |
| Ambiguous attempt, timeout or interrupted provider handoff | Stop automatic replay. Correlate authenticated callbacks/provider records before deciding whether a new submission is safe.            |

Definitive transient refusals can retry with persisted deadlines and then fail over in the pinned route order. Permanent refusal stops failover. HTTP 408/409/5xx, uncertain responses, and a crashed worker with an unfinished network attempt may mean the provider already accepted the message. Such outcomes remain visible and cannot be automatically redriven or failed over. A later authenticated callback can reconcile them. Exactly-once delivery across the network boundary is not promised.

## Upgrade and verification boundary

Back up database, object storage and secrets before applying migrations. Migration `0016_sending_policy.sql` creates default pending-review policies for all organizations and holds previously queued/scheduled messages that have never started, with `classification_required`. It preserves their IDs, requests and MIME. Migration `0017_sending_routes.sql` adds the route registry and per-instance readiness records; it does not invent historical route proof or classify old sends.

There is no automatic legacy-message route assignment endpoint. For a known-unsent legacy held message, review and cancel it, then create a new explicitly classified submission after approval and readiness; retain the relationship in your operational records and use a new idempotency key. Reusing the original key within its window returns the original result. Never apply this procedure blindly to a started or ambiguous message. Do not mutate route snapshots or mark uncertain attempts failed directly in SQL to force recovery.

Database/protocol tests exercise concurrent quota admission, strict-batch rollback, durable pacing/chunking, cancellation, suppression races, feedback suspension, route isolation constraints, evidence expiry/configuration drift, and crash ambiguity. Browser contracts cover owner denial, fresh operator proof, stale edits, route/evidence administration and held-message controls. The disposable live-browser suite covers actual MFA/session behavior; its execution evidence is tracked in [PROGRESS](../PROGRESS.md) and [acceptance](acceptance.md), separately from contract mocks.

Public DNS/PTR, real Postal pools, actual receiver authentication results, external feedback delivery and inbox placement remain unverified until hosting/provider setup. Docker Desktop is now installed; see the [acceptance ledger](acceptance.md) for local container results. Successful CI does not replace the required Mac container run. The offline staging preflight rejects sandbox mode, missing named transports and missing/invalid operator UUID allowlists. It validates named configuration shapes, credential references, Postal public keys and provider endpoint settings without network access. It does not establish that an allowlisted UUID belongs to an enrolled live user, validate database approval/route bindings, prove physical isolation or certify fresh sender readiness; these remain explicitly listed live checks. The staging template requires public SMTP provider hostnames on ports 465, 587 or 2525 and an explicit final-hop TLS guarantee; named Postal HTTP is allowed only at the private Compose `postal` hostname, with HTTPS required for external endpoints. No real infrastructure was provisioned by these changes. IP warming, adaptive provider/MX routing and broader deliverability analytics require subsequent live evidence.

### Provider feedback capability boundary

SES supplies authenticated complaint and hard/temporary-bounce classifications through SNS. The pinned Postal callback set handled here supplies sent, delayed, delivery-failed and bounced events; it does not supply a distinct authenticated complaint event or a reliable hard/soft classification in `MessageBounced`. Postal bounces remain `unknown` and protect the recipient, without inventing hard-bounce statistics. Operators must review those diagnostics and any independently received complaint reports. Connecting and validating a real complaint feed for the Postal pilot remains an external-provider acceptance item; the presence of an automatic complaint rule does not prove that a provider will emit that evidence.
