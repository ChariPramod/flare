# SDK, CLI and local MCP

The three workspace packages are `@pareto-labs/flare-sdk`, `@pareto-labs/flare-cli`, and `@pareto-labs/flare-mcp`. They build into installable tarballs; this project does not publish them to a registry. Package-specific usage is in their READMEs.

Run `pnpm build`, then `pnpm test:packages` to pack all three, install them together into a temporary directory, run the CLI, and typecheck a consumer against the installed SDK. The script removes its temporary install afterward. For a durable local install, use `pnpm --dir <workspace> pack --pack-destination <directory>` and install the three resulting tarballs together with npm. Keep API keys in environment variables or the permission-restricted config file, never shell arguments.

`docs/api/openapi.json` describes the HTTP routes, request bodies, path/query parameters, authentication, error responses and rate-limit headers. `/docs` serves that contract from the API. Inputs are derived from the actual controller validators by `scripts/openapi.mjs`; shared pipeline validators and signed native callbacks have explicit mappings. Refined constraints such as combined recipient limits, DNS verification, immutable scopes, production restrictions and template dependencies still execute on the server. Flexible engine definitions and provider-specific response fragments remain JSON objects.

After API changes, build dependencies, run `pnpm openapi:generate`, review the contract and response mappings, then run `pnpm openapi:check`. CI fails on stale generated output. The generated SDK includes every documented operation; its API-key client cannot invoke session-only account/team/key administration. The MCP catalog omits those operations and native provider callbacks.

Publication keys are deliberately separate from ordinary full-access keys. An owner/admin session creates one with `allow_publish: true`, or selects **Allow publication** when creating a full-access key in the dashboard. The flag cannot be added later. Only Development publication is accepted; an explicitly selected Production environment still cannot publish backwards or edit content directly.

MCP defaults to read-only tools. Enable mutations with `FLARE_MCP_ALLOW_MUTATIONS=true`; annotations identify mutating tools, and the API enforces permissions independently. Tool input schemas validate arguments before dispatch. Configure one server process per selected environment. Stdio output is reserved for protocol messages; errors go to stderr and redact credentials.

## Container source builds

The first CI integration run could not pull the old official MinIO client image. Compose now builds MinIO and its client from immutable commits in the official repositories using `ops/minio/Dockerfile`. The server uses [RELEASE.2025-10-15T17-29-55Z](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z), including its documented session-policy security fix; the client retains [RELEASE.2025-08-13T08-35-41Z](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z). Source licenses are included in the images. This retains MinIO storage and requires an initial Go build in CI/local Docker; it does not rely on a third-party binary mirror. Actual startup verification remains recorded separately from build configuration.
