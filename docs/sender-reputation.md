# Sender reputation and P0 rollout

The first rollout is Pareto and manually approved customers. Domain ownership is
necessary but does not grant production sending permission. Postal and Novu remain
the delivery infrastructure. Hosting, domains and IP purchases are deferred.

## Implemented foundation

Flare persists accepted messages and signed MIME, isolates tenant data, validates
Postal/SNS signatures, deduplicates events, and quarantines ambiguous acceptance.
Provider acceptance and receiver acceptance are separate from inbox placement.

The feedback-safety checkpoint adds:

- SES delay events affect only the provider's `delayedRecipients`.
- Bounded feedback diagnostics retain classification, enhanced status, provider
  timestamps and observed IPs. Unknown bounces remain unknown; they cannot inflate
  hard-bounce measurements. SES source IP is never reported as its outgoing IP.
- Provider suppressions are protected. Ordinary suppression deletion can remove
  manual entries only, preserves feedback history and cannot remove complaints.
- Permanent refusal stops failover. HTTP 408/409/5xx and uncertain responses are
  ambiguous because a server may have accepted the message before responding.
  A definitive transient refusal can retry; four refusals may exhaust a provider
  and advance to the next configured transport. Required TLS remains enforced.
- Retry eligibility is persisted in `messages.next_attempt_at`; each worker claim
  submits at most one attempt. Redis loss or restart cannot reset the deadline.
  Provider Retry-After is bounded to 24 hours. Retries retain the signed MIME and
  target only recipients still eligible to send.
- Outgoing email request/response content is excluded from request logs.

## Remaining approved P0 checkpoints

1. A separate MFA-protected operator authority, approval, organization recipient
   quotas, durable holds, automatic suspension and reviewed restoration.
2. Domain ownership versus transport readiness, validated DMARC, fresh DNS and
   received-message evidence, named transports and physically isolated route bindings.
3. Operator and tenant screens, typed API/tooling contracts, browser and container
   acceptance, upgrade and recovery instructions.

Defaults for approved pilot senders are 100 recipients per rolling 24 hours and
10 per minute. Pause on the first authenticated complaint, or a 5% hard-bounce
rate with at least 20 recipients. These are conservative pilot rules, not claims
about universal mailbox-provider requirements. Operators review resumption and
limit increases. A valid DMARC policy of `p=none` is acceptable.

Marketing requires explicit approval and separate routes. Pareto's critical
transactional route requires an operator-approved credential. Physical isolation
must be verified against actual configured Postal servers/pools/IPs; labels alone
cannot establish it. An operation already handed to a provider cannot be recalled
by a Flare sending pause.

## Verification boundary

Unit/database tests exercise callback normalization, suppression protection,
partial recipient outcomes, retry deadlines, permanent refusal and ambiguity.
The container suite includes SMTP refusal followed by Mailpit failover and polls
actual retry deadlines. See `docs/testing.md` for test locations and commands.

Public DNS/PTR, physical Postal pools, actual receiver authentication results,
external feedback delivery and inbox placement remain unverified. Local Docker
installation is pending; CI execution does not replace the required Mac run.
IP warming, adaptive provider/MX routing, dedicated-IP products and the expanded
deliverability dashboard follow P0 and require live evidence.
