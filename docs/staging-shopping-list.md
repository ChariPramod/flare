# Staging shopping list and cost estimate

Price check: 2026-10-16. These are USD prices before tax, not a purchased or reserved configuration. The owner will create and control the accounts. Nothing in this document authorizes spending.

## Recommendation

Allow **$40/month plus about $11/year for a domain**. Start with one VPS running the existing Flare/Novu/Postal staging stack and encrypted backups stored with a separate provider. This is for the small Pareto Email + Inbox pilot with password/MFA, initially restricted to controlled recipient mailboxes. It provides neither high availability nor separate sending-IP pools.

Choose **Erith, United Kingdom**, if there is no conflicting data-residency requirement. This was the available standard region in the checked configurator; the selected size was unavailable in North America. Availability and billing-country prices must be checked again at purchase. The US storefront warns that services ordered outside US regions cannot be modified or upgraded after delivery; expansion may require migration.

## Buy these items

| Item                                                                   | Exact selection                                                                                                                                                           | Cost before tax                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [OVHcloud VPS](https://us.ovhcloud.com/vps/)                           | VPS-4 2027; 8 vCPU, 24 GB RAM, 200 GB NVMe; standard Erith data center; Ubuntu **24.04**, x86-64; **No commitment**, monthly; one included IPv4 and standard daily backup | **$27.50/month** in the checked configurator                 |
| [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) | One available, non-premium `.com`, one year; free DNS plan                                                                                                                | **$10.46/year** registration and renewal at the checked rate |
| [Backblaze B2](https://www.backblaze.com/sign-up/cloud-storage)        | Pay-as-you-go B2 cloud storage, one private bucket for encrypted off-host backups; initially estimate 100 GB retained                                                     | Approximately **$0.70/month** at $6.95/TB/month              |
| Cloudflare DNS                                                         | Free plan                                                                                                                                                                 | **$0**                                                       |

Expected recurring server and 100 GB backup storage: **$28.20/month**. First month including a full year of domain registration: approximately **$38.66**, before taxes. Including the domain amortized over a year, approximately **$29.07/month**. The $40 budget leaves some headroom but is not an enforced billing cap. Backup growth, restore traffic beyond included allowances, temporary restore servers, taxes and exchange rates can increase charges.

Sources: [VPS configurator](https://us.ovhcloud.com/vps/configurator/?planCode=vps-2027-model4), [Cloudflare current domain prices](https://pricing.registrar.cloudflare.com/), [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing).

The OVH advertised $23.37/month offer selected a **12-month upfront commitment** ($280.44). Use **No commitment** during validation. Select Ubuntu 24.04 explicitly: the configurator default was 26.04. Keep optional control panels, premium backup and extra disks unselected initially. Included server snapshots do not replace application-consistent, encrypted off-host backups.

## Confirm Postal support before paying for the server

OVH's [VPS FAQ](https://support.us.ovhcloud.com/hc/en-us/articles/48817968371091-OVHcloud-VPS-FAQ) says port 25 is blocked by default and can be requested through support. Its [mail guide](https://support.us.ovhcloud.com/hc/en-us/articles/4407065448339-How-to-prevent-your-emails-from-being-marked-as-spam) says regular VPS port 25 is normally open. Both exclude **Local Zones** from SMTP access. Treat account-specific support confirmation as required; do not infer permission from either conflicting general statement.

Copy this message to OVH sales/support:

> I want a VPS-4 in Erith for a small Postal staging server, initially limited to 100 recipients/day at mailboxes we control. Before purchase, please confirm that my account can use inbound and outbound TCP port 25, retain its static IPv4, and configure PTR/reverse DNS. Please confirm any approval requirements, email-hosting restrictions and total monthly price.

Keep the reply/ticket reference privately. If approval is refused or requires purchasing first without assurance, stop and obtain another hosting proposal. Port 587 through a relay does not validate Postal's direct delivery to recipient MX servers. [OVH reverse DNS instructions](https://support.us.ovhcloud.com/hc/en-us/articles/360002181530-How-to-Configure-Reverse-DNS)

Postal [recommends its own server](https://docs.postalserver.io/getting-started/prerequisites/). Combining services is the existing staging cost tradeoff, not a production sizing guarantee. The single IP cannot prove separate physical sending pools; broader customer/marketing traffic remains outside this pilot.

## Owner purchase and handoff order

1. Create the hosting account using the correct billing country, enable MFA, and obtain written mail/PTR confirmation for the exact product and region.
2. Check the final monthly price, renewal/cancellation terms and current availability; order the specified VPS only after confirmation.
3. Register your chosen available `.com` with Cloudflare, enable account MFA and renewal reminders, and use free DNS. No particular domain name or its availability has been selected. An existing owned staging domain can eliminate this purchase.
4. Create the Backblaze B2 account with MFA. Arrange private backup credentials and independently recoverable encryption keys in your secret manager. We will configure bucket access, retention and restoration together.
5. Provide the server IP/hostname, SSH username, existing local SSH-key path, domain and support confirmation reference. Do not send passwords, private-key contents, API tokens or MFA recovery codes in chat or commit them to the public repository.
6. Prepare two recipient mailboxes you control, ideally at different providers, and an authenticator for the staging owner/operator.

Codex can then configure the approved host, HTTPS, services, secrets, backups and exact DNS records; execute real Postal sending/receiving, MFA/Inbox checks and isolated restore acceptance. Real deliverability and staging acceptance remain unverified until those tests run.

Use the full [owner checklist](staging-owner-checklist.md) for access and secret custody, and the [staging runbook](staging.md) for deployment. No accounts, infrastructure or DNS records have been created by this recommendation.
