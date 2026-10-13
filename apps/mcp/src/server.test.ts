import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
it('serves valid stdio MCP, exposes read-only tools by default and routes reads through the SDK', async () => {
  let selected = '';
  const http = createServer((req, res) => {
    selected = String(req.headers['x-environment-id']);
    res.setHeader('Content-Type', 'application/json');
    res.end('[]');
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve('apps/mcp/src/main.ts')],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((v): v is [string, string] => v[1] !== undefined),
      ),
      FLARE_API_URL: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
      FLARE_API_KEY: `fl_${randomBytes(32).toString('base64url')}`,
      FLARE_ENVIRONMENT_ID: '00000000-0000-4000-8000-000000000001',
      FLARE_CONFIG: resolve('/private/tmp/nonexistent-flare-mcp-config-test'),
      FLARE_MCP_ALLOW_MUTATIONS: 'false',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test', version: '1' });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools.length).toBeGreaterThan(20);
    expect(list.tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    expect(list.tools.some((t) => t.name === 'MailController_send')).toBe(false);
    const result = await client.callTool({ name: 'MailController_domains', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: '[]' }]);
    expect(selected).toBe('00000000-0000-4000-8000-000000000001');
    const mutation = await client.callTool({
      name: 'MailController_send',
      arguments: { body: {} },
    });
    expect(mutation.isError).toBe(true);
  } finally {
    await client.close();
    await transport.close();
    http.close();
    await once(http, 'close');
  }
}, 20000);
