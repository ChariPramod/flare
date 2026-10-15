# Webhooks, request logs and metrics

Migration `0005_operations.sql` adds tenant-scoped endpoint/delivery/attempt, native engine event, alert and request-log tables. All use forced tenant policies and composite foreign keys. Endpoint management requires `manage_integrations`; read APIs use normal tenant read access. An endpoint belongs to an organization and environment, so development events never reach production endpoints.

## Delivery and verification

Create an endpoint with `POST /v1/webhooks` and `{name,url,events:["email.*"]}`. The response returns its `whsec_` secret once. List and update via `GET /v1/webhooks` and `PATCH /v1/webhooks/:id`. Secrets are encrypted with tenant/endpoint-bound AES-GCM. `POST /v1/webhooks/:id/test` queues a targeted test, independent of event filters. `POST /v1/webhooks/:id/rotate` returns a new secret; deliveries carry signatures for both keys for 24 hours. Repeated rotation replaces the previous key immediately.

Every event transaction writes the event outbox. The dispatcher locks undispatched events, creates a delivery per matching enabled endpoint, then marks each outbox event dispatched in the same PostgreSQL transaction. Redis jobs use the delivery UUID, and the worker claims the database row atomically. The dispatcher reconstructs pending jobs after Redis loss. Disabled endpoints do not receive newly emitted events; re-enable and replay existing failed deliveries explicitly.

Headers are `svix-id`, `svix-timestamp` and `svix-signature`; HMAC-SHA256 signs the exact UTF-8 `id.timestamp.body`. The event UUID and stored JSON body remain unchanged across retries and manual replay, while the timestamp/signature are refreshed. Receivers must verify the raw bytes and deduplicate `svix-id`. The shared `verifyWebhook` rejects body, ID or timestamp tampering and timestamps more than five minutes in either direction. Interoperability tests use the official Svix JavaScript verifier and signer. See [Svix verification documentation](https://docs.svix.com/receiving/verifying-payloads/how).

There are eight attempts: immediately, then waits of 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours. Every attempt is recorded before HTTP dispatch. All non-2xx responses and transport failures retry; exhaustion disables the endpoint and creates a dashboard alert. An expired one-minute claim is recovered with an unknown-outcome entry. This is **at least once** delivery: a timeout or worker crash can occur after the receiver has committed the event. A stale worker cannot overwrite the replacement claim. `POST /v1/webhook-deliveries/:id/replay` rejects active attempts and requires the endpoint to be enabled.

Outbound HTTP validates all DNS results, pins the chosen resolution, refuses redirects, limits response excerpts to 4 KiB and uses a 15-second request timeout. Private and special addresses are rejected. Operators may explicitly allow exact internal origins using `WEBHOOK_ALLOWED_ORIGINS`, e.g. `http://internal-receiver:8080`; this trusts every resolved address for that origin, so use it only for controlled receivers. URL credentials and fragments are disallowed.

The dashboard lists endpoints, tests/rotates/configures them, shows every delivery attempt, and supports replay. `GET /v1/webhook-deliveries` accepts `page`, `limit`, `endpoint_id` and `status`; the detail route returns attempt history. `GET /v1/operation-alerts` returns unresolved alerts. Re-enabling an endpoint resolves its disable alert.

## Engine events

Flare emits `workflow.queued`, `workflow.accepted`, `workflow.failed` and `workflow.canceled` from its own transactions. Engine acceptance does not imply channel delivery. To ingest native engine events, configure the environment's `novu_webhook_secret` through `PATCH /v1/environments/:id`, then configure the upstream callback to `/v1/events/novu/:environmentId`. This endpoint requires Svix headers and verifies the raw body against that environment's encrypted secret. It accepts `workflow.*`, `message.*` and `notification.*` payloads and deduplicates the upstream event ID per environment before mirroring into the outbox.

Actual callback availability and event schemas on the pinned self-hosted Novu Community deployment still require live verification. No native delivery metrics are invented when callbacks are absent. Postal/SNS events continue to enter through their separately authenticated email callback routes.

## Request logs

The API assigns `x-request-id`, captures route/method/status, authenticated key/actor, latency and bounded redacted request/response bodies. The middleware also logs public and rejected requests; records without authenticated tenant context are operator-only and cannot be viewed through tenant APIs. Route templates avoid persisting secret-bearing path parameters. Credentials, tokens, cookies, MFA data, raw MIME, attachment content, URL passwords and sensitive query parameters are redacted. The JSON body budget is 32 KiB, string values 4 KiB, keys 256 characters, depth 10 and collections 100 entries.

Inbound, email, provider callback, workflow/trigger/activity, template, layout, translation, publication and automation routes omit their entire request body, query and response body from logs. This includes previews, publication diffs, validation failures and mixed-case URLs accepted by Express. Arbitrary template variables and trigger payloads cannot be reliably scrubbed by credential field names alone. Route, actor, status, latency and correlation metadata remain searchable.

`GET /v1/logs` supports request-ID/path search, status class, status code, HTTP method, time range and pagination. `GET /v1/logs/:id` returns redacted bodies. `GET /v1/logs/export` exports up to 10,000 matching metadata rows as CSV with formula-escape protection. The worker removes logs older than `LOG_RETENTION_DAYS` (1–3650, default 30) hourly.

Request logging uses a bounded asynchronous database writer and flushes on graceful shutdown. A process crash, database failure or writer saturation can lose the database copy. Structured stdout retains request metadata and reports persistence failures; ship those logs to durable storage when completeness is required. Other resources, such as contact profiles, may still contain personal data beyond credential redaction; retention and access policies must match the deployment's requirements. Redaction changes apply to new requests; previously stored logs remain subject to the configured retention policy.

## Metrics

`GET /v1/metrics` accepts ISO `from`/`to` (up to 366 days), `domain_id`, `tag_name`, `tag_value`, `workflow`, and `channel`. Email statistics use UTC cohorts by message creation time. Sent means provider acceptance. Delivery, bounce and complaint rates divide distinct recipient outcomes by accepted recipients. Open/click rates count unique messages, exclude known machine events and divide by accepted messages, including those without tracking enabled. Empty denominators return `null`, displayed as an em dash. Banners appear above 4% bounce or 0.08% complaint rates.

The workflow email filter requires the explicit message tag `{name:"workflow",value:"identifier"}`; relay messages do not automatically carry Novu workflow correlation. Workflow-trigger status counts and authenticated native engine event counts are shown separately. Domain and tag filters apply to the email cohort; channel/workflow/time apply to engine and trigger counts. The dashboard refreshes its moving time range every ten seconds.

## Verification

Local tests cover official signature interoperability, tampering/time windows, SSRF/redirect/DNS pinning, bounded redaction, actual HTTP request-log capture, outbox fanout, claims/recovery/fencing, eight-attempt exhaustion, replay, rotation, tenant constraints and metric calculations. Playwright exercises the real dashboard against an explicitly isolated browser API fixture. These contract tests do not prove engine/provider delivery.

`bash scripts/integration.sh` adds a real PostgreSQL/Redis webhook receiver test covering multi-connection claims, lost Redis state, HTTP retries and stable event identity alongside the existing email/SMTP/Mailpit suite. This suite remains unrun on this host until Docker is available.
