#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FlareClient } from '@pareto-labs/flare-sdk';
import { readConfig, safeOutput, publicError } from '@pareto-labs/flare-cli/config';
import { createFlareServer } from './server.js';
try {
  const config = await readConfig();
  const server = createFlareServer(new FlareClient(config), {
    allowMutations: process.env.FLARE_MCP_ALLOW_MUTATIONS === 'true',
    apiKey: config.apiKey,
  });
  await server.connect(new StdioServerTransport());
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void server.close().then(() => process.exit(0));
    });
} catch (error) {
  process.stderr.write(safeOutput(publicError(error)) + '\n');
  process.exitCode = 1;
}
