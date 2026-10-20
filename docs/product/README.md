# Product guides

Start with the [website and backend guide](website-and-backend-guide.md). It maps the sidebar, roles, common journeys, backend services and the distinction between received email and a subscriber's in-app Inbox.

| Area                                                                           | Guide                                              |
| ------------------------------------------------------------------------------ | -------------------------------------------------- |
| Dashboard, authentication and workflow canvas                                  | [Dashboard](dashboard.md)                          |
| Outbound email, domains, attachments and delivery outcomes                     | [Email pipeline](email-pipeline.md)                |
| Operator approval, quotas, routes, sender readiness and protected suppressions | [Sender reputation controls](sender-reputation.md) |
| Contacts, preferences, templates and broadcasts                                | [Audience](audience.md)                            |
| Durable contact sequences, waits and event recovery                            | [Automations](automations.md)                      |
| Received MIME, attachments and forwarding                                      | [Inbound email](inbound.md)                        |
| Versioned layouts and locale dictionaries                                      | [Layouts and translations](content.md)             |
| Promoting workflows and pinned dependencies to Production                      | [Publication](publication.md)                      |
| Webhook delivery/replay, request logs and metrics                              | [Product operations](operations.md)                |

These guides own user-visible behavior and its API semantics. **Product operations** means the Webhooks, Logs and Metrics features; host administration, backups, alerts and deployment live in the separate [operations runbooks](../operations/README.md).

Check [current progress](../../PROGRESS.md) and [acceptance evidence](../development/acceptance.md) for the tested revision and outstanding gates. A verified domain is not operator approval, provider acceptance is not delivery, and a local fixture pass is not real-provider evidence. See the [sender guide](sender-reputation.md) before enabling outbound traffic.
