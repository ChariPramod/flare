# Architecture

These documents explain service boundaries and decisions that affect implementation and deployment.

| Document                                                             | Use it for                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Website and backend guide](../product/website-and-backend-guide.md) | A first tour of services, storage, request flows and source locations                |
| [ADR 0001: keep Novu unmodified](adr/0001-wrap-novu.md)              | Why Flare wraps the pinned community engine rather than forking it                   |
| [Novu compatibility](novu-gaps.md)                                   | Channel capabilities, retry ownership, native job inspection and verification limits |
| [HTTP contract](../api/README.md)                                    | Public API generation and compatibility                                              |

Flare's control plane, durable PostgreSQL state and shared mail pipeline sit around the pinned Novu engine. Hosting the Next.js dashboard on Vercel does not move the worker, SMTP, Postal or Novu services there; follow the [deployment runbooks](../operations/README.md) for those boundaries.

Record new architecture decisions here. Product procedures belong in [product](../product/README.md), operational commands in [operations](../operations/README.md), and work proposals in [planning](../planning/README.md). Consult [current progress](../../PROGRESS.md) and [acceptance evidence](../development/acceptance.md) before treating a designed capability as verified.
