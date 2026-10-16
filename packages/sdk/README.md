# Flare TypeScript SDK

Node 22+ / modern fetch runtimes. Supply the API origin, API key and explicit environment UUID. Remote origins require HTTPS. The key must belong to that environment.

```ts
import { FlareClient, FlareError, verifyWebhook } from '@pareto-labs/flare-sdk';
const flare = new FlareClient({
  baseUrl: process.env.FLARE_API_URL!,
  apiKey: process.env.FLARE_API_KEY!,
  environmentId: process.env.FLARE_ENVIRONMENT_ID!,
});
const email = await flare.sendEmail(
  {
    from: 'Team <hello@example.com>',
    to: 'reader@example.net',
    subject: 'Welcome',
    text: 'Thanks for joining.',
  },
  'welcome-contact-123',
);
const status = await flare.request('get', '/v1/emails/{id}', { path: { id: email.id } });
for await (const contact of flare.paginate('/v1/contacts', {}, { limit: 25 })) {
  console.log(contact.id);
}
```

`request(method, pathTemplate, {path, query, body, idempotencyKey, signal})` is typed from the full bundled OpenAPI contract. `operation()` provides the same catalog-checked interface for runtime clients. `sendEmail`, `trigger` and `publish` are convenience methods. Collections that use fixed array responses do not support the pagination iterator. Pagination stops after 1000 pages by default; an exhausted bound raises an error rather than silently truncating.

HTTP failures throw `FlareError` with `status`, `requestId`, `retryAfter`, and sanitized error details. A connection failure has status 0 and may have happened after a mutation was accepted. The SDK does not automatically retry mutations. Reuse the same idempotency key and original request within the 24-hour window; never blindly resubmit an ambiguous transport acceptance.

`verifyWebhook(secret, originalBody, headers)` verifies Svix-compatible HMAC signatures and the five-minute timestamp window before returning parsed JSON. Store event IDs to deduplicate webhook deliveries. It is for Flare webhook receivers, not Postal or SNS native callbacks.

Publication requires an owner/admin-delegated key created with `allow_publish: true`; ordinary full-access keys cannot publish. Session-only account/team/key APIs are included in the complete HTTP contract but cannot be executed by this API-key client.

Read-only native-work inspection:

```ts
const run = await flare.inspectWorkflow(runId);
const report = await flare.reconcileWorkflows({
  before: new Date().toISOString(),
  maxRuns: 100,
  concurrency: 2,
  deadlineMs: 30_000,
});
```

`workflowInventory({before, cursor, limit})` exposes stable timestamp/ID cursor pages (maximum 20 accepted runs per page). Cursors belong to the selected organization, environment and `before` filter. `reconcileWorkflows` bounds the entire scan to 100 runs, concurrency four and 60 seconds at most, including failures; its defaults are 100 runs, concurrency two and 30 seconds. It uses GET operations only, never automatic replay, cancellation or provider mutation. Review `complete`, `partial`, `inventory_complete`, `stop_reason` and per-row `inspection_error`. A deadline may leave inventory rows uninspected; inspect those IDs separately. Metadata excludes payloads, subscriber details, raw native responses and provider diagnostics. Queue membership remains unknown even when native database evidence is available. Creation age is a review filter, not proof of overdue execution. The inventory is live; a later scan may observe runs accepted or changed during the first scan.
