# Flare local MCP server

Run `flare-mcp` as a stdio MCP process. It uses the same `FLARE_API_URL`, `FLARE_API_KEY`, `FLARE_ENVIRONMENT_ID`, optional `FLARE_ORG_ID`, and mode-0600 config as the CLI. Do not pass secrets as process arguments. Standard output contains only MCP protocol messages.

The default exposes read-only operations. Set `FLARE_MCP_ALLOW_MUTATIONS=true` explicitly to expose mutating tools. Every tool has read-only/destructive/idempotency annotations, JSON Schema input validation, and a description identifying its HTTP operation. Mutations still require the API credential's permissions. Publication requires an explicitly delegated publication key; tenant selection cannot be overridden by tool arguments. Native callbacks and session-only identity APIs are not advertised.

Tools accept the same `path`, `query`, `body` and optional `idempotencyKey` objects as the SDK. Errors and responses redact credentials. The server uses the maintained MCP SDK v1 protocol line (2025-11-25), supports local stdio, and starts no HTTP listener.
