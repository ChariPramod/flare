# 0001 — Keep Novu unmodified

Status: accepted. Date: 2026-10-12.

Flare owns authentication, tenant isolation, email transport and delivery state. Official Novu community 3.19.0 containers own notification workflow execution. Flare integrates over documented REST endpoints; it neither vendors Novu source nor imports enterprise code. Per-environment service credentials are encrypted by Flare.

The Flare PostgreSQL and Redis instances are independent from Novu MongoDB and Redis. Flare email enters one queue pipeline, including mail originating from Novu through an authenticated SMTP relay. Production workflow mutations are blocked in Flare; publication requires owner/admin privileges.

Postal is the default transport. Mailpit is an explicit local development transport. SES is optional; no SaaS dependency is required. A provider accepting a send is not proof of delivery. Delivery state comes from authenticated provider events.
