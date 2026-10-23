# Deploy Flare v0.1.0-rc.1

This is the feature-frozen release candidate for **controlled staging**: the editorial dashboard, password/MFA, workflows and Inbox, email/inbound, contact imports, campaign authoring, pre-send checks and controlled tests. Deploy the release tag so later development cannot change the code underneath a deployment.

The application has automated acceptance coverage. Public hosting, real Postal/DNS, receiving-mailbox authentication and off-host recovery still need validation on your infrastructure. Keep real outbound sending restricted to approved operators and controlled recipient mailboxes until those checks pass.

## 1. Choose where the two parts run

| Part                                                               | Deployment                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Dashboard                                                          | Vercel, or the existing Compose web service                   |
| API, worker, SMTP relay, PostgreSQL, Redis, MinIO, Novu and Postal | A persistent Linux host using the checked-in Compose profiles |

The backend cannot run inside a Vercel frontend deployment. Keep the existing database and authentication; no Supabase migration is required. Use one canonical backend checkout and Compose project. The [owner checklist](docs/operations/staging/staging-owner-checklist.md) lists the host/domain/account inputs and Postal port-25/PTR requirements.

## 2. Pin the release on the backend host

```sh
git clone --branch v0.1.0-rc.1 --depth 1 https://github.com/ChariPramod/flare.git flare-staging
cd flare-staging
git rev-parse HEAD
corepack enable
pnpm install --frozen-lockfile
```

Use Node 22 and pnpm 10.32.1. Record the resolved commit beside the deployment settings. Use the GitHub release and its CI evidence as the source of the tested revision; do not deploy an arbitrary feature-branch tip.

For a **new** deployment, `node scripts/setup.mjs` creates fresh private secrets. It deliberately refuses an existing `.env`. Complete [staging secrets, certificates and private provider bootstrap](docs/operations/staging/staging.md#secrets-and-internal-relay-trust) before opening ingress. Generated development certificates and localhost provider settings are not deployment-ready. Existing installations retain their environment, encryption keys, volumes and identity records.

## 3. Configure Vercel if using the split dashboard

Import this repository. Use root directory **`apps/web`**, Node **22.x**, and enable access to files outside the root directory. Select `codex/release-0.1.0` while reviewing the candidate; after release promotion, select `main` only when its commit matches the release. Record and deploy the release commit, not a later moving branch revision.

- Install: `pnpm install --frozen-lockfile`
- Build: `cd ../.. && pnpm exec turbo run build --filter=@flare/web...`
- Output: the default Next.js `.next` directory

Set these **server-only** variables in the production/custom-domain environment:

| Variable                       | Value                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| `WEB_ORIGIN`                   | Exact dashboard HTTPS origin                               |
| `FLARE_API_URL`                | Exact public backend API HTTPS origin                      |
| `FLARE_DASHBOARD_PROXY_SECRET` | Fresh dedicated `fdp_` key, also configured on the backend |

No `NEXT_PUBLIC_` secrets or Supabase keys are needed. Leave backend secrets out of Vercel preview environments. Follow [the Vercel runbook](docs/operations/staging/vercel.md) for exact origins, the signing key, private Inbox gateway, transfers and WebSockets. An imported dashboard alone is not a working deployment without its configured backend.

## 4. Start the configured backend

Follow [the staging bootstrap order](docs/operations/staging/staging.md#secrets-and-internal-relay-trust): private stores and Postal/Novu, provider/environment credentials, Flare migrations, owner seed, operator UUID allowlist and MFA. A migration does not create the owner login. Keep Development and Production provider credentials distinct.

For a Vercel dashboard, retain this ordered profile in every lifecycle command:

```sh
flare_compose=(docker compose --project-name flare-staging --project-directory "$PWD" \
  --env-file "$PWD/.env" -f docker-compose.yml -f docker-compose.staging.yml \
  -f docker-compose.staging-split-web.yml)
# Append only when Postal receiving is configured; keep it in every later command:
# flare_compose+=(-f ops/staging/postal-inbound.yml)
node scripts/staging/preflight.mjs
"${flare_compose[@]}" config --quiet
"${flare_compose[@]}" config --format json | node scripts/staging/validate-model.mjs --split-web
# Add --postal-inbound to validate-model when the receiving override is selected.
"${flare_compose[@]}" up -d --build --wait
```

These commands assume bootstrap, fresh secrets, hostnames and certificates are complete. Preflight must pass. Do not print the rendered Compose configuration: it contains secrets. For the all-Compose dashboard use the [matching profile](docs/operations/staging/staging.md#choose-the-canonical-compose-profile) instead of mixing file sets.

## 5. Verify before inviting pilot users

1. Run the public DNS/HTTPS verifier with the prepared [split-web manifest](ops/staging/public-manifest.split-web.example.json), as described in the Vercel runbook.
2. Sign in, enroll MFA, verify environment switching and session logout/revocation. Test a viewer's read-only permissions.
3. Verify an Inbox notification, read-state persistence and reconnect. Exercise a campaign preview and one deliberate test to a controlled mailbox. Confirm provider acceptance separately from receiver-observed delivery.
4. Verify sender ownership, SPF/DKIM/DMARC, actual provider route resources, inbound mail and authenticated feedback. Keep organization approval and sending limits enforced.
5. Rehearse an encrypted off-host restore, dependency restart and alert delivery. Record the results and unresolved checks before widening access.

## Upgrades and rollback

Take and verify an [encrypted backup](docs/operations/recovery/backup-recovery.md) before upgrading an existing installation. This release adds contact-list/campaign migration `0019` relative to the earlier main branch; campaign preflight and release security changes add no migration. Startup applies committed migrations with checksum validation.

Retain the previous source revision, exact image IDs and private configuration. On failure, stop producers and follow the recovery runbook. Do not run two producers against recovered data, blindly replay uncertain sends, remove volumes or assume a database downgrade is safe. A frontend-only rollback must retain matching origins and forwarding secrets.

## Release evidence and limits

The final release's GitHub CI must pass code/build/browser, Python, staging configuration, independent database integration and pinned full-stack acceptance. See [progress](PROGRESS.md) for the actual result and [dependency review](docs/operations/release-security.md) for the pinned security updates and remaining scanner findings. Local demo data and developer credentials are excluded from the release.

The Mac's prebuilt Mailpit demo is verified with Docker capped at 6 GiB. Avoid overlapping local builds and full-stack rehearsals. This is not a capacity estimate for the full Postal staging host; retain the separate host planning allocation in the owner checklist.
