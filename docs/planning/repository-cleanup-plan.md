# Repository cleanup plan

Approved scope: keep the existing monorepo, organize documentation first, then move source features and scripts in separately verified checkpoints. Cleanup starts from implementation `db4f0a4` on **`codex/docs-organization`**.

## Pass 1 — documentation

Implemented in this branch; local verification passed. Review the branch CI before merging. Detailed evidence is in [current progress](../../PROGRESS.md).

This checkpoint groups existing documents without changing application behavior, infrastructure configuration, migrations or generated API contracts.

| Canonical location            | Ownership                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `docs/README.md`              | Task-based documentation entry point                                               |
| `docs/architecture/`          | System decisions and Novu compatibility                                            |
| `docs/product/`               | Dashboard tour and feature behavior, including user-facing operations              |
| `docs/development/`           | Local testing, pytest, evals, developer packages and acceptance evidence           |
| `docs/operations/`            | Deployment and runtime reliability                                                 |
| `docs/operations/staging/`    | Accounts, purchase proposal, staging bootstrap and Vercel setup                    |
| `docs/operations/recovery/`   | Encrypted backups and isolated restoration                                         |
| `docs/operations/monitoring/` | Metrics, alerts and notification routing instructions                              |
| `docs/planning/`              | Current execution sequences and cleanup plan                                       |
| `docs/archive/`               | Original brief and historical progress, with their original evidence boundaries    |
| `docs/api/`                   | Existing generated OpenAPI contract and API instructions; runtime paths stay fixed |
| `docs/memory/`                | Optional learning preferences; not implementation or deployment evidence           |

The [documentation index](../README.md) links the groups. [PROGRESS.md](../../PROGRESS.md) becomes a short current handoff, with the full previous record in [the progress archive](../archive/progress-through-2026-10-19.md). [CHANGELOG.md](../../CHANGELOG.md) remains at the repository root.

### Compatibility contract

- Keep every old document path as a generated compatibility page. Preserve its original section headings so existing fragment links still land on a link to the corresponding canonical section. These are explicit navigation pages, not HTTP redirects.
- Keep original progress section IDs at the root handoff, pointing into the archived record. File line-number links cannot retain their old meaning after reorganization; use section links for durable references.
- Rewrite repository Markdown links to canonical destinations. Preserve executable code blocks and root-relative shell commands; moving prose must not change where a command runs.
- Keep `docs/api/openapi.json` in place because the API and generator read that path. Leave database migrations, credentials, Docker data and unrelated local user edits untouched.
- Edit canonical pages only. `docs/redirects.json` records old-to-new paths and `docs/legacy-anchors.json` pins original section IDs. Before renaming a heading, retain its old ID as an explicit HTML anchor. `pnpm docs:generate` regenerates compatibility pages; `pnpm docs:check` checks them, required legacy anchors and local Markdown links/fragments. Do not remove baseline IDs to silence a failed check.
- Keep historical results historical. Correct obsolete present-tense claims in active feature guides, but do not convert old pending checks into invented success evidence.

### Verification and delivery

1. Independently compare all moved headings and fenced code with the pre-cleanup snapshot; review any intentional prose corrections.
2. Check local document targets/fragments, generated compatibility pages, formatting and diff whitespace. Test the validator's failure cases so a deleted destination or lost section fails verification.
3. Run the standard checkpoint: lint, typecheck, OpenAPI drift, unit/database tests, evals, build and gitleaks. CI also runs its existing integration/browser/full-stack checks on the proposed branch through a pull request.
4. Update progress/changelog with actual evidence, create one Conventional Commit and push the branch. Keep the cleanup reviewable before merging; application/source cleanup is a later checkpoint.

## Pass 2 — source features

Start only after the documentation checkpoint is reviewed. Move one frontend/API feature at a time, preserving exports, routes, permissions and behavior. Use the [current source map](../product/website-and-backend-guide.md#where-to-change-things) as the baseline.

Proposed frontend boundaries are `apps/web/features/{overview,auth,workflows,subscribers,email,domains,inbound,audience,automations,content,operations,operator}/`, with shared UI and shell components kept separate. Proposed API boundaries are `apps/api/src/modules/` and shared infrastructure wiring. These directories are **not created by pass 1**.

Choose a small initial feature, identify every importer and colocated test, move it, update imports and verify its API/UI behavior before expanding. Keep shared mail business rules in `packages/mail` and platform rules in `packages/platform`; moving files must not create duplicate implementations. Preserve generated contracts and migration order. Use focused tests plus the standard checkpoint and relevant browser/integration checks.

## Pass 3 — scripts

Group developer utilities, contract tooling and operational commands after documentation and feature boundaries settle. Preserve convenient root entry points and old command paths with wrappers where required. Update CI, package scripts, Docker contexts and runbook references together.

Audit each script's working-directory assumptions, relative imports, executable permissions, trap/cleanup behavior and destructive-target guards. Rehearse affected backup/restore and acceptance commands against disposable stacks before claiming compatibility. Root build configuration files can remain at the repository root.

## Separate deployment milestone

Repository cleanup does not provision Vercel, backend hosting, DNS or Postal resources. The [staging execution plan](staging-execution-plan.md) still governs real Email + Inbox validation, external recovery and the pilot. Keep those gates separate from successful local cleanup checks.
