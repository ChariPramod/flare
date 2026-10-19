import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const origin = 'http://127.0.0.1:3000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function acceptanceBrowserEnvironment(envPath, project, ambient = process.env) {
  const directory = dirname(resolve(envPath));
  const values = parseEnv(readFileSync(envPath, 'utf8'));
  if (
    values.FLARE_ACCEPTANCE !== 'true' ||
    basename(envPath) !== '.env' ||
    !basename(directory).startsWith('flare-acceptance-') ||
    !/^flare-acceptance-\d+-\d+$/.test(project ?? '')
  )
    throw new Error('Use the disposable acceptance environment and project');
  if (
    values.WEB_ORIGIN !== origin ||
    values.NOVU_PUBLIC_API_URL !== `${origin}/novu` ||
    values.NOVU_PUBLIC_WS_URL !== 'http://127.0.0.1:3002' ||
    (ambient.E2E_BASE_URL !== undefined && ambient.E2E_BASE_URL !== origin)
  )
    throw new Error(
      'Acceptance browsers require the generated IPv4 loopback origins without overrides',
    );
  const fixtures = JSON.parse(readFileSync(join(directory, 'acceptance/fixtures.json'), 'utf8'));
  const operatorFixture = join(directory, 'acceptance/operator.json');
  if (
    !uuid.test(fixtures?.inbound ?? '') ||
    !uuid.test(fixtures?.redrive ?? '') ||
    !statSync(operatorFixture).isFile() ||
    !values.SEED_OWNER_EMAIL ||
    !values.SEED_OWNER_PASSWORD ||
    !values.SEED_SUBSCRIBER_EMAIL
  )
    throw new Error('Acceptance browser fixtures must be prepared before running');
  return {
    ...ambient,
    E2E_BASE_URL: origin,
    E2E_EMAIL: values.SEED_OWNER_EMAIL,
    E2E_PASSWORD: values.SEED_OWNER_PASSWORD,
    E2E_FROM: 'sender@acceptance.test',
    E2E_TO: values.SEED_SUBSCRIBER_EMAIL,
    E2E_ACCEPTANCE: 'true',
    E2E_OPERATOR_FIXTURE: operatorFixture,
    E2E_ACCEPTANCE_DIRECTORY: directory,
    E2E_ACCEPTANCE_PROJECT: project,
    // Automatic DOM error snapshots can contain enrollment keys and recovery codes.
    PLAYWRIGHT_NO_COPY_PROMPT: '1',
    E2E_INBOUND_ID: fixtures.inbound,
    E2E_REDRIVE_ID: fixtures.redrive,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  execFileSync('pnpm', ['test:e2e:live'], {
    stdio: 'inherit',
    env: acceptanceBrowserEnvironment(process.argv[2], process.argv[3]),
  });
