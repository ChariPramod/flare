# Novu community compatibility

Pinned target: API, worker, WS and internal dashboard 3.19.0. Never downgrade below 3.18.0.

Verified against the [v3.19.0 Compose source](https://github.com/novuhq/novu/blob/v3.19.0/docker/community/docker-compose.yml): the upstream example itself still pins 3.18.0. Flare overrides these tags explicitly. Runtime images have not been pulled on this development host because Docker is unavailable.

Team limits, topics, layouts, translations and webhook availability require live community-image tests. Flare does not assume cloud-only features are available. Do not present untested edition behavior as a runtime finding.

Flare owns team authorization, org/environment isolation, API key scoping, suppression, idempotency, retries/failover, email tracking and signed webhooks. The workflow editor must describe channel failure as continuing execution and action failure as canceling remaining steps. Provider acceptance must never be labeled delivery.

Reference: [Novu releases](https://github.com/novuhq/novu/releases/tag/v3.19.0), [Postal container processes](https://docs.postalserver.io/other/containers/).

## Flare implementations

Topics and subscription conditions are stored and expanded in Flare before trigger dispatch. This supplies exact context matching and actor exclusion independently of community topics availability. Flare promotes selected workflows, layouts and translations through durable publication operations with pinned dependencies and engine reconciliation. Novu transport acceptance is labeled `accepted`, not delivered. Step execution and engine-derived timelines still need tests against running 3.19.0 images.
