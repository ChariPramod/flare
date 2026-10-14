# Novu community compatibility

Pinned target: API, worker, WS and internal dashboard 3.19.0. Never downgrade below 3.18.0.

Verified against the [v3.19.0 Compose source](https://github.com/novuhq/novu/blob/v3.19.0/docker/community/docker-compose.yml): the upstream example itself still pins 3.18.0. Flare overrides these tags explicitly. Runtime images have not been pulled on this development host because Docker is unavailable.

Team limits, topics, layouts, translations and webhook availability require live community-image tests. Flare does not assume cloud-only features are available. Do not present untested edition behavior as a runtime finding.

Flare owns team authorization, org/environment isolation, API key scoping, suppression, idempotency, email transport retries/failover, workflow dispatch recovery, email tracking and signed webhooks. Channel failure normally continues execution; delay, digest and throttle failures cancel remaining steps. HTTP request failures halt by default and support an explicit `continueOnFailure: true` control. Provider acceptance must never be labeled delivery.

Reference: [Novu releases](https://github.com/novuhq/novu/releases/tag/v3.19.0), [Postal container processes](https://docs.postalserver.io/other/containers/).

## Flare implementations

Topics and subscription conditions are stored and expanded in Flare before trigger dispatch. This supplies exact context matching and actor exclusion independently of community topics availability. Flare promotes selected workflows, layouts and translations through durable publication operations with pinned dependencies and engine reconciliation. Novu transport acceptance is labeled `accepted`, not delivered. Step execution and engine-derived timelines still need tests against running 3.19.0 images.

## Runtime evidence

[CI run 38355107858](https://github.com/ChariPramod/flare/actions/runs/38355107858) started the pinned community images, created both engine environments, configured SMTP and the preinstalled Inbox, and ran the demo seed twice. Flare now adopts only the current environment’s Inbox singleton and uses the native email/SMS primary endpoint. A provider being configured is not evidence of notification delivery.

[CI run 38442762577](https://github.com/ChariPramod/flare/actions/runs/38442762577) subsequently passed the entire pinned-stack acceptance script, including translated email relay delivery, preference updates, verified content publication, Production automation execution and all five real browser flows. External provider delivery and the remaining matrix below are not certified by that run.

| Channel or action                     | Verified boundary                                                     | Remaining runtime check                                     |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Inbox                                 | Provider adoption, seed, UI workflow creation and trigger acceptance  | Feed delivery and browser Inbox                             |
| Email                                 | Novu → authenticated TLS relay → Mailpit; retry/failover and recovery | External provider delivery                                  |
| SMS                                   | Twilio/Plivo configuration exposed through Flare                      | Credentialed provider acceptance/delivery                   |
| Push                                  | FCM/APNs configuration exposed through Flare                          | Credentialed device delivery                                |
| Chat                                  | Slack/Discord configuration exposed through Flare                     | Credentialed destination delivery                           |
| Delay, digest, throttle, HTTP request | Editor/API request support                                            | Execution, timing and failure behavior in the pinned engine |

`scripts/acceptance/actions.mjs` adds runtime assertions for the action row; its presence alone is not evidence of a passing run. It creates workflows through Flare and reads the pinned engine's notification/job API. The isolated HTTP listener is reachable only inside the disposable Compose network, with a per-run random route and a 4 KiB request limit. The acceptance override permits precisely `flare-api` alongside the existing relay hostname; production SSRF configuration is unchanged.

The action checks require a two-second delay before downstream execution, two concurrent events merged into one digest with both payloads retained, one winner among four concurrent throttle attempts, skipped throttle children, and renewed execution after the native reservation expires. HTTP checks require rendered JSON, the native signature header, persisted failure plus canceled children, and explicit continuation with the failure retained. This does not certify cron schedules, dynamic throttles, HTTP signature verification by an external receiver, arbitrary third-party endpoints, or action recovery after loss of Novu's own Redis data.

The pinned engine's [Redis throttle implementation](https://github.com/novuhq/novu/blob/v3.19.0/libs/application-generic/src/services/throttle/redis-throttle.service.ts) adds a default 30-second reservation buffer to the configured window. A one-minute throttle therefore retains its reservation for 90 seconds; a trigger at 61 seconds remains skipped, as observed in [CI run 38534097037](https://github.com/ChariPramod/flare/actions/runs/38534097037). The acceptance test reads back the native one-minute controls and submits a fresh trigger after 91 seconds. It does not shorten or disable the buffer. This is an engine timing limitation, not a guarantee that throttled work will automatically resume: skipped triggers remain terminal.

Flare emits HTML explicitly for its email editor and precompiled templates/layouts. Native block content remains available only when explicitly selected in API control values. Workflow preference requests use complete `all` and `channels` objects; Novu returns the default layer as `preferences.default`. Subscriber preference updates instead use boolean channel values. SDK contract tests and publication reconciliation tests cover these distinctions; runtime acceptance is tracked separately in [the evidence ledger](acceptance.md).

## Retry ownership and failure semantics

Flare retries definitively rejected workflow submissions and recovers its own queued work. Once Novu accepts a trigger, downstream SMS, push, chat and action execution belongs to Novu; Flare does not provide generic provider failover for those channels. Email accepted by the Flare relay enters the shared durable email pipeline and its configured transport priority.

Pinned-source inspection confirms that [delay, digest and throttle failures halt the chain](https://github.com/novuhq/novu/blob/v3.19.0/apps/worker/src/app/shared/utils/should-halt-on-step-failure.ts), using the engine's [action classifier](https://github.com/novuhq/novu/blob/v3.19.0/libs/application-generic/src/utils/digest.ts); legacy `shouldStopOnFail` can also halt a channel. [HTTP request execution](https://github.com/novuhq/novu/blob/v3.19.0/apps/worker/src/app/workflow/usecases/send-message/execute-http-request-step.usecase.ts) returns its own halt decision according to `continueOnFailure`. The [worker records failed sends and applies that continuation decision](https://github.com/novuhq/novu/blob/v3.19.0/apps/worker/src/app/workflow/usecases/run-job/run-job.usecase.ts). These source findings do not certify runtime timing or credentialed channel delivery. Ambiguous Flare submissions remain quarantined, regardless of provider retry capabilities.
