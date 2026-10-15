# Flare staging: what the owner needs to do

No hosting account, server, domain or DNS zone is set up yet. This checklist gets the first **self-hosted Postal + Email + Inbox + password/MFA** pilot ready. Completing it does not purchase or deploy anything automatically. Start with steps 1–3; the technical work follows once the decisions and access are available.

## 1. Choose the budget, location and pilot scope

- [ ] Set a monthly spending ceiling covering the server, static IPv4, storage, backups and traffic, plus a separate domain-registration allowance. Obtain current quotes before committing; this guide makes no price estimate.
- [ ] Choose a hosting region suitable for the pilot users and any data-location requirements.
- [ ] Keep the first pilot to a small set of mailboxes you control. Marketing campaigns, customer lists, SES, OIDC and SMS are outside this first deployment.
- [ ] Name one person responsible for the server, domain renewals, security updates and recovery.

The current single-host planning allocation is **8 vCPU, 16 GiB RAM, 150 GiB SSD, Ubuntu 24.04, amd64/x86-64**. This is a starting allocation for the combined Flare/Novu/Postal stack, not a measured capacity guarantee. Postal itself recommends a dedicated server; our combined staging template is a pilot tradeoff, not a production sizing recommendation. [Postal prerequisites](https://docs.postalserver.io/getting-started/prerequisites/)

## 2. Confirm a mail-capable host before buying it

- [ ] Create or identify a hosting account you control, and enable account MFA.
- [ ] Ask the provider to confirm these capabilities **for your account, chosen product and region**. Keep its response or support-ticket reference.

Copy this question to the provider:

> I plan to run a small, permission-based staging email server using Postal. Does this account/product allow outbound TCP port 25 to external recipient mail servers and inbound TCP port 25 for receiving? Is approval required, and can you confirm approval before purchase? Can I retain a static public IPv4 address and set its reverse DNS/PTR to my mail hostname? Are there email-hosting restrictions, additional IP charges, traffic limits or an IP-replacement process if the assigned IP has an existing reputation problem?

- [ ] Confirm public TCP 80/443 for HTTPS and a way to restrict SSH to your administrator's IP/VPN.
- [ ] Confirm server-console/recovery access if SSH fails.
- [ ] Confirm the full price and cancellation terms. Only then approve/provision the server, or explicitly authorize Codex to do so with the chosen account and plan.

Outbound port 25 is frequently blocked; opening a VM firewall does not remove a provider-level block. Postal also calls out IP reputation as a possible hosting problem. Do not substitute port 587 for direct delivery to recipient servers. [Postal prerequisites](https://docs.postalserver.io/getting-started/prerequisites/)

## 3. Own a domain and arrange DNS access

- [ ] Register a domain you control, or choose a dedicated staging subdomain of an existing owned domain. Enable registrar MFA and renewal reminders.
- [ ] Identify the authoritative DNS provider: the account that can actually edit the domain's records. It may differ from the registrar.
- [ ] Either edit DNS yourself from a supplied record list or provide narrowly scoped DNS access through the agreed private secret store. Delegating a staging zone avoids granting access to unrelated production records.
- [ ] Reserve separate names for dashboard, API, Inbox websocket, mail server, sending/receiving domain and tracking. Codex will map these to the existing configuration before any records are published.

You do **not** need to invent SPF, DKIM keys, selectors, verification tokens or DMARC records now. After bootstrap, Codex will prepare the exact records from Flare, Postal and the selected policy:

| Record              | What will be supplied later                                   | Who applies it                          |
| ------------------- | ------------------------------------------------------------- | --------------------------------------- |
| A                   | Dashboard, API, websocket and mail names → actual static IPv4 | DNS account owner or delegated operator |
| PTR/reverse DNS     | Actual sending IPv4 → matching mail hostname                  | Hosting provider/account owner          |
| MX                  | Dedicated receiving domain → configured Postal mail hostname  | DNS operator                            |
| TXT                 | Ownership verification, SPF, DKIM and reviewed DMARC policy   | DNS operator                            |
| Return-path records | Exact names, types and values required by Postal              | DNS operator                            |
| Tracking CNAME      | Selected tracking name → Flare API hostname                   | DNS operator                            |

Do not replace an existing organization's MX/SPF records or add IPv6 records without reviewing the effect. Mail routing must resolve directly to the SMTP host; an HTTP-only proxy cannot carry SMTP. Per-domain records must match the actual generated configuration. [Postal DNS configuration](https://docs.postalserver.io/getting-started/dns-configuration/)

## 4. Prepare safe administrator access

- [ ] Create a named, non-root SSH account with sudo access on the approved host; record its username and hostname/IP.
- [ ] Install the administrator's **public** SSH key on that account. Keep the private key on the administrator's machine. Share only the existing local key-file path with Codex, never the key contents.
- [ ] Confirm that SSH login, sudo and the provider's recovery console work before restricting alternative access.
- [ ] Agree who may administer Docker; Docker access grants administrative control of the host.
- [ ] Authorize the agreed deployment steps. Codex can then install the required server tooling and configure the firewall: HTTPS public, SSH restricted, Postal inbound 25 only for the receiving pilot. Database, Redis, MinIO, Postal administration and Flare SMTP submission remain private.

## 5. Choose secret custody and an off-host backup destination

- [ ] Choose a private password/secret manager and identify the custodian and emergency recovery contact.
- [ ] Choose encrypted backup storage outside the staging server, with access and encryption keys recoverable if that server is lost. A second directory or volume on the same server is insufficient.
- [ ] Set the desired backup frequency and retention, acceptable data loss and target recovery time. These are requirements to test, not guarantees already delivered by the project.
- [ ] Store deployment credentials, encryption keys, private CA material and account recovery codes privately. Keep backup decryption material separate from the backups and out of Git/chat.
- [ ] Authorize a disposable restore exercise using an off-host backup before widening pilot access.

Codex will generate fresh deployment secrets in private files, configure the internal relay certificate, and prepare backup/restore commands following [deployment recovery](deployment.md#backup-and-restore). The owner retains account ownership and custody; Codex must not be the only place recovery information exists.

## 6. Prepare pilot mailboxes and operator MFA

- [ ] Provide an owner-login email, an HTTPS certificate contact email and at least two controlled recipient mailboxes. Prefer mailboxes at different providers for observing real delivery and authentication results.
- [ ] Have an authenticator app ready. Enroll the pilot owner and designated platform operator in MFA; store recovery codes privately.
- [ ] Decide who may approve sending. Tenant ownership alone does not grant platform-operator authority: Codex records the chosen user's actual UUID in the deployment allowlist after account creation.
- [ ] Review the initial sending quota and approved recipient list. Start small; do not send to purchased lists or uninvolved recipients.

The operator must use a live session and fresh MFA proof for sending-policy administration. Domain ownership, organization approval, route approval and fresh transport evidence are separate gates. See [sender reputation](sender-reputation.md).

## 7. Send this handoff form without secrets

Copy, fill in what is known and leave the rest as `pending`. Send it privately to the deployment collaborator; do not commit personal contact details to the public repository.

```text
Monthly ceiling / currency; separate domain allowance:
Hosting provider / product / region:
Port 25 inbound + outbound approval reference:
Static IPv4 and PTR control confirmed: yes / pending
Server address; OS / architecture / CPU / RAM / disk:
SSH username; existing local SSH key path (not key contents):
Recovery-console owner:
Owned domain or delegated staging zone:
Registrar / authoritative DNS provider:
DNS edits: I will apply supplied records / delegated access arranged
Owner-login email; certificate contact email:
Controlled recipient mailbox addresses:
Designated platform operator:
Secret-store location/reference; custodian (no credentials):
Off-host backup destination/reference (no credentials):
Backup retention/frequency; data-loss/recovery targets:
Who can approve spending and deployment; approved scope:
```

Passwords, API tokens, SSH private keys, MFA seeds/recovery codes and backup decryption keys do not belong in this form.

## 8. Let Codex deploy, then check the evidence together

With the approved host and access, Codex can perform the runbook in [staging](staging.md): configure private services and fresh secrets, migrate/seed accounts, bootstrap Postal/Novu, prepare exact DNS changes, run offline preflight, establish HTTPS, configure callbacks and operator-controlled routes, then execute bounded pilot tests. Owner actions remain account/payment approvals, DNS edits if not delegated, MFA enrollment and review of received messages.

Keep these acceptance gates open until their own evidence exists:

- [x] **Local Mac:** Docker is operational; all 23 integration tests and full-stack acceptance passed on `a7ed844`, including nine live browser flows and isolated restore. See [the evidence ledger](acceptance.md). This closes the local gate only.
- [ ] **Host:** private administration boundaries, readiness after restart and expected firewall access are verified.
- [ ] **Public DNS/HTTPS:** records, matching A/PTR, certificates and external routing are verified from outside the host.
- [ ] **Real Postal:** domain authorization, actual sending IP/pool, receiver-observed SPF/DKIM/DMARC alignment, delivery callbacks and signed inbound receipt pass. Provider acceptance is distinct from final delivery or inbox placement. Correct PTR/HELO alignment is one prerequisite, not a deliverability guarantee. [Postal delivery guidance](https://docs.postalserver.io/welcome/faqs/)
- [ ] **Application:** password/MFA and recovery, browser Inbox delivery/read state, suppression/preferences and operator approval controls pass against staging.
- [ ] **Recovery:** encrypted off-host backup can be restored in isolation, credentials recovered and uncertain sends reconciled without automatic replay.

CI, local simulation and configuration checks remain useful evidence, but none substitutes for these external checks. Do not mark staging acceptance complete merely because the dashboard loads.
