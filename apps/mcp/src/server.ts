import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { operationCatalog } from '@pareto-labs/flare-sdk';
import type { FlareClient, RequestOptions } from '@pareto-labs/flare-sdk';
import { safeOutput, publicError } from '@pareto-labs/flare-cli/config';
export function createFlareServer(
  client: FlareClient,
  options: { allowMutations?: boolean; apiKey?: string } = {},
) {
  const server = new Server({ name: 'flare', version: '0.1.0' }, { capabilities: { tools: {} } });
  const ajv = new Ajv({ strict: false, allErrors: true });
  (addFormats as unknown as (ajv: Ajv) => void)(ajv);
  const supported = operationCatalog.filter(
    (operation) =>
      !operation.public &&
      !operation.sessionOnly &&
      !operation.id.startsWith('AuthController_') &&
      !['manage_keys', 'manage_team'].includes(operation.access) &&
      (options.allowMutations || operation.access === 'read'),
  );
  const validators = new Map(
    supported.map((operation) => [operation.id, ajv.compile(operation.inputSchema)]),
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: supported.map((operation) => ({
      name: operation.id,
      description: `${operation.access === 'read' ? 'Read-only' : 'Mutating'}: ${operation.method} ${operation.path}. Uses the explicitly configured Flare environment. ${operation.access === 'publish' ? 'Requires a delegated publication key.' : ''}`,
      inputSchema: operation.inputSchema as { type: 'object' },
      annotations: {
        readOnlyHint: operation.access === 'read',
        destructiveHint: operation.access !== 'read',
        idempotentHint: operation.access === 'read',
        openWorldHint: true,
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const operation = supported.find((o) => o.id === request.params.name);
    if (!operation)
      return {
        isError: true,
        content: [{ type: 'text', text: 'Tool unavailable in this server mode' }],
      };
    const args = request.params.arguments ?? {};
    const validate = validators.get(operation.id)!;
    if (!validate(args))
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: safeOutput({ error: 'Invalid tool arguments', errors: validate.errors }),
          },
        ],
      };
    try {
      const result = await client.operation(
        operation.method,
        operation.path,
        args as RequestOptions,
      );
      return {
        content: [
          { type: 'text', text: safeOutput(result, options.apiKey ? [options.apiKey] : []) },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: safeOutput(publicError(error), options.apiKey ? [options.apiKey] : []),
          },
        ],
      };
    }
  });
  return server;
}
