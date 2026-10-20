# Layouts and translations

Layouts are immutable HTML wrapper versions, scoped to an environment. Create with `POST /v1/layouts` and append versions with `PUT /v1/layouts/:identifier`. Both take `{identifier,name,html,translations}`. List layouts with GET `/v1/layouts`; GET `/v1/layouts/:identifier` includes version history. Only Development is editable. The identifier is immutable.

A wrapper must contain exactly one `{{{body}}}` marker. Payload/subscriber variables and Liquid directives are forbidden inside layouts. When `translations` is enabled, plain `{{t.key}}` references are allowed. Workflows select `layoutIdentifier` and optional `layoutVersion` in an email step's control values. Omitting the version pins the current version on save. Existing workflows do not silently adopt new wrappers.

Workflow rows now return `source_definition` (editable references with pinned versions), `definition` (compiled engine content) and `content_dependencies` (snapshots and translation bindings). Existing workflows are backfilled from their stored definitions. Clients editing a workflow should use `source_definition ?? definition`. Existing request schemas and workflows without content dependencies remain compatible. Email template references retain their pinned version and stable identifier in the dependency snapshot.

## Locale dictionaries

GET `/v1/translations/:workflow` exports current dictionaries and versions. PUT `/v1/translations/:workflow/:locale` imports a JSON object of plain-text key/value pairs and appends a version. Create the workflow before its dictionaries; then add translation references to its content. Locale format is `xx_YY`, with `en_US` required for every referenced key. Keys use lowercase letters, digits and underscores, starting with a letter. Limits: 1,000 entries, 10,000 characters per value and 256 KiB serialized JSON. Values cannot contain template directives, newlines or NUL characters.

Subject/body/title/content controls use `{{t.key}}`. Missing locale or key falls back independently to `en_US`; a missing default key blocks workflow save and trigger acceptance. Removing a referenced default key is rejected. Layout translations use the workflow dictionary.

Flare groups recipients by locale, resolves dictionaries once per group and stores the resolved payload in each durable workflow run. Subsequent dictionary edits do not change accepted runs or idempotency replays. HTML email replacements are escaped as plain text. The internal `payload.__flare_i18n` object is reserved; caller payloads and authored workflows cannot supply it. Flare validates the original payload schema before adding internal data. For translated workflows, Novu receives an augmented editor schema while Flare remains the authority for full payload validation. Direct Novu triggers bypass these controls and are unsupported.

POST `/v1/content/preview` accepts `{workflow,locale}` and returns compiled content, resolved values and dependencies. The dashboard offers a layout selector/version control, locale preview, wrapper editor and JSON dictionary import/export. Layout and inbound previews rebuild an allowlisted, resource-free HTML fragment before rendering in a sandbox. Scripts, navigation and remote images are removed.

## Verification

Database tests cover immutable pins, source preservation, per-key/locale fallback, HTML escaping, reserved fields, strict user payload schemas and tenant isolation. Browser coverage exercises wrapper versions and dictionary import/export. CI has verified translated email and default-key fallback through pinned Novu and the authenticated SMTP relay to Mailpit; this does not certify an external delivery provider. See [acceptance evidence](../development/acceptance.md) for the tested revisions and [durable publication](publication.md) for selected-resource promotion, required dependencies, recovery and Production guards.
