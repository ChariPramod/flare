#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { FlareClient, operationCatalog } from '@pareto-labs/flare-sdk';
import { readConfig, saveConfig, safeOutput, publicError } from './config.js';
const help = `Flare CLI — explicit environment, credentials from environment or a mode-0600 config file.
Environment: FLARE_API_URL, FLARE_API_KEY, FLARE_ENVIRONMENT_ID, optional FLARE_ORG_ID / FLARE_CONFIG.
Commands:
  config save | config show
  operations
  workflow trigger --file request.json [--idempotency-key key]
  email send --file email.json [--idempotency-key key]
  email status ID
  sending-policy show
  domain verify ID
  publication diff | publication publish --file selection.json
  publication status ID | publication retry ID
  dead-letters list | dead-letters redrive KIND ID
  request METHOD /v1/path/{id} --path '{"id":"..."}' [--query '{"page":1}'] [--file body.json]
Inputs use --file - for bounded JSON stdin. No automatic mutation retries. Publication needs a delegated publication key.
`;
let secret = '';
try {
  const { positionals: args, values } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      file: { type: 'string' },
      path: { type: 'string' },
      query: { type: 'string' },
      'idempotency-key': { type: 'string' },
    },
  });
  if (values.help || !args.length) {
    process.stdout.write(help);
    process.exit(0);
  }
  if (args[0] === 'operations') {
    process.stdout.write(safeOutput(operationCatalog) + '\n');
    process.exit(0);
  }
  const config = await readConfig();
  secret = config.apiKey;
  const client = new FlareClient(config);
  let body: unknown;
  if (values.file) {
    if (values.file === '-') {
      const parts: Buffer[] = [];
      let length = 0;
      for await (const part of process.stdin) {
        const buffer = Buffer.from(part);
        length += buffer.length;
        if (length > 40 * 1024 * 1024) throw new Error('JSON input exceeds 40 MiB');
        parts.push(buffer);
      }
      body = JSON.parse(Buffer.concat(parts).toString());
    } else {
      if ((await stat(values.file)).size > 40 * 1024 * 1024)
        throw new Error('JSON input exceeds 40 MiB');
      body = JSON.parse(await readFile(values.file, 'utf8'));
    }
  }
  const action = `${args[0]} ${args[1] ?? ''}`;
  let result: unknown;
  const id = args[2];
  if (action === 'config save') result = await saveConfig();
  else if (action === 'config show') result = config;
  else if (action === 'workflow trigger')
    result = await client.operation('POST', '/v1/events/trigger', {
      body,
      idempotencyKey: values['idempotency-key'],
    });
  else if (action === 'email send')
    result = await client.operation('POST', '/v1/emails', {
      body,
      idempotencyKey: values['idempotency-key'],
    });
  else if (action === 'email status')
    result = await client.operation('GET', '/v1/emails/{id}', { path: { id: id ?? '' } });
  else if (action === 'sending-policy show') result = await client.sendingPolicy();
  else if (action === 'domain verify')
    result = await client.operation('POST', '/v1/domains/{id}/verify', { path: { id: id ?? '' } });
  else if (action === 'publication diff')
    result = await client.operation('GET', '/v1/publish/diff');
  else if (action === 'publication publish')
    result = await client.operation('POST', '/v1/publish', { body });
  else if (action === 'publication status')
    result = await client.operation('GET', '/v1/publications/{id}', { path: { id: id ?? '' } });
  else if (action === 'publication retry')
    result = await client.operation('POST', '/v1/publications/{id}/retry', {
      path: { id: id ?? '' },
    });
  else if (action === 'dead-letters list')
    result = await client.operation('GET', '/v1/dead-letters', {
      query: values.query ? JSON.parse(values.query) : {},
    });
  else if (action === 'dead-letters redrive')
    result = await client.operation('POST', '/v1/dead-letters/{kind}/{id}/redrive', {
      path: { kind: id ?? '', id: args[3] ?? '' },
    });
  else if (args[0] === 'request')
    result = await client.operation(args[1] ?? '', args[2] ?? '', {
      path: values.path ? JSON.parse(values.path) : {},
      query: values.query ? JSON.parse(values.query) : {},
      body,
      idempotencyKey: values['idempotency-key'],
    });
  else throw new Error('Unknown command; use flare --help');
  process.stdout.write(safeOutput(result, [secret]) + '\n');
} catch (error) {
  process.stderr.write(safeOutput(publicError(error), [secret]) + '\n');
  process.exitCode = 1;
}
