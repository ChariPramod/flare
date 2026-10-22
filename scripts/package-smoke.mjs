import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'flare-packages-'));
try {
  for (const path of ['packages/sdk', 'apps/cli', 'apps/mcp'])
    execFileSync('pnpm', ['--dir', path, 'pack', '--pack-destination', directory], {
      stdio: 'pipe',
    });
  const tarballs = readdirSync(directory)
    .filter((file) => file.endsWith('.tgz'))
    .map((file) => join(directory, file));
  writeFileSync(join(directory, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync(
    'npm',
    ['install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs],
    { stdio: 'pipe', timeout: 120000 },
  );
  execFileSync(
    process.execPath,
    [join(directory, 'node_modules/@pareto-labs/flare-cli/dist/main.js'), '--help'],
    { stdio: 'pipe' },
  );
  writeFileSync(
    join(directory, 'check.ts'),
    `import {FlareClient} from '@pareto-labs/flare-sdk';
const client = new FlareClient({baseUrl:'https://flare.test',apiKey:'fl_test',environmentId:'00000000-0000-4000-8000-000000000001'});
void client.sendEmail({from:'a@b.test',to:'c@d.test',subject:'Hello',text:'Welcome'});
void client.publish({automations:['welcome-sequence']});
const checklist = await client.request('get','/v1/broadcasts/{id}/preflight',{path:{id:'fixture'}});
const test = await client.request('post','/v1/broadcasts/{id}/test',{path:{id:'fixture'},idempotencyKey:'intent',body:{revision:checklist.revision,sandbox:checklist.sandbox,recipients:['me@example.test']}});
const accepted: string = test.data[0]!.id; void accepted;
// @ts-expect-error Expected delivery mode must be explicit.
void client.request('post','/v1/broadcasts/{id}/test',{path:{id:'fixture'},body:{revision:'revision',recipients:['me@example.test']}});
const binary: Uint8Array = await client.request('get','/v1/inbound/{id}/raw',{path:{id:'fixture'},query:{format:'binary'}});
const encoded = await client.request('get','/v1/inbound/{id}/raw',{path:{id:'fixture'}});
const base64: string = encoded.content;
void binary; void base64;
// @ts-expect-error Only supported download formats may be requested.
void client.request('get','/v1/inbound/{id}/raw',{path:{id:'fixture'},query:{format:'unsupported'}});
// @ts-expect-error Invalid recipient type must not compile.
void client.sendEmail({from:'a@b.test',to:42,subject:'Hello',text:'Welcome'});
// @ts-expect-error Required route parameters must be supplied.
void client.request('get','/v1/emails/{id}',{});
`,
  );
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--target',
      'ES2023',
      join(directory, 'check.ts'),
    ],
    { stdio: 'pipe' },
  );
  console.log(
    'SDK, CLI and MCP tarballs installed locally; CLI launch and SDK consumer types passed. Nothing was published.',
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
