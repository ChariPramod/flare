# Inbound email

Enable receiving on a domain, configure its returned MX record and complete verification. In Postal 3.3.7, create an HTTP endpoint with **RawMessage** format and **BodyAsJSON** encoding. Route the receiving domain to `http://flare-api:4000/v1/inbound/postal/DOMAIN_ID` inside Compose; use HTTPS when crossing a network boundary. Configure a generous endpoint timeout for bounded object-storage writes.

Postal must explicitly allow `flare-api` in `postal.allowed_request_destinations`; `scripts/setup.mjs` already writes this setting. Configure `POSTAL_WEBHOOK_PUBLIC_KEY_FILE` (or `POSTAL_WEBHOOK_PUBLIC_KEY`) with Postal's public signing key and optionally pin `POSTAL_WEBHOOK_KEY_ID`. Flare checks `X-Postal-Signature-256` against the exact body bytes. This is Postal's native signature, not an HMAC or Svix signature.

The contract follows Postal's pinned [HTTP sender](https://github.com/postalserver/postal/blob/3.3.7/app/senders/http_sender.rb) and [signature implementation](https://github.com/postalserver/postal/blob/3.3.7/lib/postal/http.rb). Postal 3.3.7 retries 5xx and connection failures; other 4xx responses are permanent failures. Configure the correct envelope domain and key before enabling the route.

## Durability and limits

Flare validates the signature, envelope and verified receiving domain, stores raw MIME in MinIO, and commits an inbound receipt before returning success. A repeated Postal ID within the same domain returns the original ID; changed content or envelope returns 409. Domain verification is required even for repeat callbacks. Database rows recover unfinished jobs after Redis loss.

The parser records attempts, stores parsed bodies and decoded attachments separately, and commits one metadata-only `email.received` event. Permanent input errors stop immediately; storage errors retry up to five attempts with backoff. A crashed transaction remains pending. Failed records and original MIME remain available for inspection.

Defaults are `INBOUND_MIME_LIMIT=26214400`, `INBOUND_ATTACHMENT_LIMIT=10485760`, `INBOUND_ATTACHMENT_COUNT=100`, and `INBOUND_HEADER_LIMIT=131072` (byte counts except attachment count). Keep `API_BODY_LIMIT` large enough for base64 and JSON overhead when raising the MIME limit. Parser-derived HTML/text and inline-image expansion are disabled. Attachment bytes are never fetched from remote URLs.

## Retrieval and forwarding

Authenticated `GET /v1/inbound` supports `page` and `limit` (maximum 100). Detail at `/v1/inbound/:id` includes headers, envelope, attempts, attachment metadata and forwarding history. `/body` returns HTML/plain text; `/raw` and `/attachments/:attachmentId` return `{filename, content_type, content}` with base64 content. This JSON download contract also works through the dashboard session proxy. Tenant and optional key-domain scope apply to every retrieval. Inbound request/response content is omitted from request logs.

Create forwarding rules with `POST /v1/forwarding-rules`; list them with GET and edit/disable with PUT `/:id`. Supply `domain_id`, nullable `recipient` (null means all domain recipients), a verified `sender`, up to ten `destinations`, and `enabled`. Each matching rule receives one durable forwarding operation with a snapshot of its destinations. Disabling a rule stops pending submissions. Existing submissions follow normal outgoing mail semantics.

Forwarding rewrites From, retains the original parsed From as Reply-To, preserves attachments, omits Bcc headers, and uses shared sender/TLS/suppression checks. It marks mail `Auto-Submitted: auto-generated` and `X-Flare-Forwarded`. Empty envelope senders, automatic messages and previously forwarded messages are skipped. Same receiving-domain destinations are rejected. The shared outbound limits still apply (including 50 attachments); an inbound message exceeding them remains readable and its forwarding operation fails explicitly. Forwarding submission is transactional with its outbound message ID, preventing duplicate submission on replay.

The dashboard previews received HTML in an empty sandbox with a restrictive CSP, blocks remote images and scripts, and downloads attachments without opening them. Raw MIME is an authenticated original-source download and can include headers omitted from the parsed display.

## Verification status

Database tests exercise receipt conflicts, tenant isolation/composite keys, parsing, storage retry, forwarding deduplication, suppression, loops, size limits and signature tampering. Browser tests exercise envelope display, sandbox/network restrictions and attachment downloads. Real PostgreSQL/Redis/MinIO recovery tests are committed; execution requires Docker. Actual Postal delivery and DNS verification remain external acceptance checks.
