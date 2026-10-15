# Email pipeline

The API and authenticated SMTP relay call `@flare/mail`. A transaction persists the message, envelope recipients, idempotency response, and event outbox before BullMQ dispatch. The worker reconstructs missing queue jobs from PostgreSQL using message IDs as job IDs. A conditional database claim prevents two workers from sending concurrently; the same claim excludes cancellation and rescheduling after delivery starts.

## API

- `POST /v1/emails`: `from`, `to`, optional `cc`, `bcc`, `reply_to`, `subject`, `html`/`text`, custom headers, attachments, tags, and `scheduled_at`.
- `POST /v1/emails/batch`: an array, or `{ "emails": [...], "validation": "strict" }`. At most 100 messages; strict mode rolls back all messages on any failure. Permissive mode returns accepted IDs and indexed validation errors. Infrastructure failures still roll back the batch.
- `GET /v1/emails` and `/v1/emails/:id`: status, recipients, attempts, and events.
- `PATCH /v1/emails/:id`: `{ "scheduled_at": "in 2 hours" }`; `POST /v1/emails/:id/cancel` cancels a queued/scheduled/held message before its first delivery attempt; the database transition excludes a concurrent claim.
- `POST /v1/domains`, `GET /v1/domains[/id]`, `PATCH /v1/domains/:id`, and `POST /v1/domains/:id/verify` manage sender domains and DNS checks.
- `GET/POST /v1/suppressions`; `DELETE /v1/suppressions/:email`. Suppression is shared across all domains and environments in the organization.

There are at most 50 combined envelope recipients per message. Attachments use base64 `content` or an HTTP(S) `path`, plus `filename`. Defaults are 10 MiB combined decoded attachments and 25 MiB final MIME; configure `MAIL_ATTACHMENT_MAX_BYTES` and `MAIL_MIME_MAX_BYTES`. `API_BODY_LIMIT` bounds the entire JSON request independently, including batches. Template rendering is added in the template phase.

`Idempotency-Key` is 1–256 characters and lives for 24 hours. Hashing precedes natural-language date resolution and attachment downloads. Repeating a request returns its original IDs, including after DNS drift. Different bodies conflict. Natural-language schedules use UTC; ISO timestamps require an offset. Schedules must be within 30 days.

## MIME, storage, and transport

Attachments and signed MIME are private MinIO objects under organization/environment/message keys. Flare builds and DKIM-signs MIME once at acceptance; all retries use those bytes. Bcc exists only in the envelope. Date and Message-ID are excluded from the DKIM signature because SES replaces them. Provider-side content rewriting/tracking must be disabled to preserve Flare's signature. Flare does not enable provider tracking.

URL downloads reject private, loopback, link-local, reserved, mapped-private IPv6, credential-bearing, non-HTTP(S), and nonstandard-port destinations. Every DNS answer must be public; the connection uses the validated address with the original hostname for TLS. Redirects are rejected, streams are bounded, and requests time out.

`MAIL_TRANSPORTS` defines named real instances; an approved immutable route selects their failover order. Legacy `TRANSPORT` and `TRANSPORT_PRIORITY` still select unnamed adapters for compatibility, but cannot satisfy real route approval. See the [sender reputation operating guide](sender-reputation.md) for approval, credentials, route binding and readiness. A transport gets one attempt plus three exponential retries for explicit transient failures before failover. Partial SMTP acceptance retries only recipients rejected temporarily. Each attempt is persisted before network I/O. `sent` means provider acceptance; authenticated delivery callbacks advance recipients to `delivered`.

A timeout or lost connection after upload is **ambiguous**: a provider could already have accepted the message. Flare records the uncertainty, stops automatic delivery, and requires review before resubmission. An expired worker lease with an unfinished attempt follows the same policy. An authenticated later delivery callback can reconcile the uncertain outcome. Exactly-once delivery across a provider network boundary is not guaranteed. A crash before any provider attempt can be recovered automatically.

Domains requiring TLS are accepted only when at least one configured adapter can honor the policy. Postal 3.3.7's raw API has no per-message mandatory outbound TLS option and is excluded. SES checks `SES_CONFIGURATION_SET` for `TlsPolicy=REQUIRE`. Generic SMTP requires STARTTLS/implicit TLS to the relay and the operator's explicit `SMTP_DELIVERY_TLS_REQUIRED=true` assertion that the relay enforces TLS to final recipients. A TLS-only connection to an otherwise opportunistic relay is insufficient.

## Provider setup

Register and authorize sender identities in Postal and/or SES as well as publishing Flare's DNS records. Provider credentials are deployment secrets. The Postal raw endpoint checks its own authorized-domain registry; Flare's DNS verification does not provision that registry. Configure the Postal server for your domains, SPF/return-path hosts, reverse DNS, and outbound connectivity. For SES, authorize identities, leave its sandbox as required, and connect the configuration set's events to an SNS topic.

Named Postal callbacks use `POST /v1/events/postal/:instanceId` and the configured instance’s public-key environment reference. The legacy unnamed callback uses `POST /v1/events/postal`; retain its key while historical sends await feedback. Flare verifies `X-Postal-Signature-256` with the named instance’s configured public key. Legacy unnamed verification uses `POSTAL_WEBHOOK_PUBLIC_KEY_FILE` or `POSTAL_WEBHOOK_PUBLIC_KEY`; optional `POSTAL_WEBHOOK_KEY_ID` pins the legacy advertised key ID. There is no shared webhook HMAC secret. This follows [Postal 3.3.7's exact signing implementation](https://github.com/postalserver/postal/blob/3.3.7/lib/postal/http.rb). Generated Postal configuration explicitly sets `postal.allowed_request_destinations: [flare-api]` so the callback `http://flare-api:4000/v1/events/postal` can pass Postal's private-destination guard. Only the public signing key is mounted into the API.

Named SES SNS callbacks use `POST /v1/events/sns/:instanceId` with that instance’s exact `sns_topic_arn`. Legacy unnamed callbacks use `POST /v1/events/sns` and the comma-separated `SES_SNS_TOPIC_ARNS` allowlist; retain it until historical sends drain. Flare authenticates the fixed canonical message, downloads certificates only from the matching HTTPS AWS SNS regional hostname without redirects, verifies the RSA signature, and confirms authenticated subscriptions. See [AWS's signature procedure](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html). Event IDs are deduplicated transactionally. Postal and SNS timestamps are not rejected merely for being delayed: providers legitimately retry callbacks.

Hard bounces and complaints suppress immediately; three distinct soft-bounced messages within seven days also suppress. Postal's post-acceptance `MessageBounced` is treated as a terminal bounce. `MessageDelayed` alone does not suppress. Flare checks suppression again before each provider attempt.

## Domains, tracking, and SMTP

Each domain has an encrypted RSA DKIM private key bound to its organization/environment. Verification joins split TXT records, checks DKIM/SPF/MX and optional tracking CNAME, backs off to one day, and checks verified domains hourly for drift. DMARC does not grant domain ownership or organization approval. Production readiness additionally requires valid parsed DMARC, alignment and fresh per-transport evidence; see [ownership and Production readiness](sender-reputation.md#ownership-and-production-readiness). DNS drift removes sending eligibility.

Open and click tracking default off. Enable them only after routing the selected `tracking_subdomain.domain` to Flare's API with HTTPS and publishing its CNAME. Tracking links authenticate message, purpose, target, and 90-day expiry; events deduplicate in five-minute windows and label likely machine activity. These are estimates, not proof that a person read a message.

The relay on port 2525 requires STARTTLS and API-key AUTH. It validates the key again for every message, requires envelope From to match the header sender, bounds MIME parsing, and submits through the shared pipeline. Envelope-only recipients remain hidden in the MIME headers. Generated development certificates are explicitly trusted by the Novu worker via `NODE_EXTRA_CA_CERTS`. Replace them with your deployed certificate/CA arrangement for real hosts.

## Verification

`pnpm test` covers helpers, PostgreSQL RLS through PGlite, real postgres.js protocol submission transactions, idempotency, scheduling races, failover, partial recipients, suppression, and an SMTP listener with certificate validation. PGlite uses one connection and does **not** certify multi-connection PostgreSQL lock behavior.

`bash scripts/integration.sh` starts disposable PostgreSQL, Redis, MinIO, and Mailpit using `docker-compose.test.yml`; it verifies durable dispatch after queue loss, raw MIME storage, Mailpit acceptance, and separate delivery events. Its database is deliberately named `flare_test`; never point the suite at application data. Full Compose startup, Novu email submission, Postal/SES live delivery, and external DNS verification still require the deployment environment.
