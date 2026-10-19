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
    values.PUBLIC_API_URL !== 'http://127.0.0.1:4000' ||
    values.NOVU_PUBLIC_API_URL !== `${origin}/novu` ||
    values.NOVU_PUBLIC_WS_URL !== 'http://127.0.0.1:3002' ||
    (ambient.E2E_BASE_URL !== undefined && ambient.E2E_BASE_URL !== origin)
  )
    throw new Error(
      'Acceptance browsers require the generated IPv4 loopback origins without overrides',
    );
  if (!/^fdp_[A-Za-z0-9+/]{43}=$/.test(values.FLARE_DASHBOARD_PROXY_SECRET ?? ''))
    throw new Error('Acceptance browser gateway signing key must be generated privately');
  const fixtures = JSON.parse(readFileSync(join(directory, 'acceptance/fixtures.json'), 'utf8'));
  const operatorFixture = join(directory, 'acceptance/operator.json');
  if (
    !uuid.test(fixtures?.inbound ?? '') ||
    !uuid.test(fixtures?.redrive ?? '') ||
    !uuid.test(fixtures?.largeInbound ?? '') ||
    !uuid.test(fixtures?.largeAttachment ?? '') ||
    !/^[a-f0-9]{64}$/.test(fixtures?.largeRawSha256 ?? '') ||
    !Number.isSafeInteger(fixtures?.largeRawBytes) ||
    fixtures.largeRawBytes <= 4.5 * 1024 * 1024 ||
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
    // Consumed only by the Playwright Node transport bridge, never injected into the page.
    E2E_DASHBOARD_PROXY_SECRET: values.FLARE_DASHBOARD_PROXY_SECRET,
    E2E_OPERATOR_FIXTURE: operatorFixture,
    E2E_ACCEPTANCE_DIRECTORY: directory,
    E2E_ACCEPTANCE_PROJECT: project,
    // Automatic DOM error snapshots can contain enrollment keys and recovery codes.
    PLAYWRIGHT_NO_COPY_PROMPT: '1',
    E2E_INBOUND_ID: fixtures.inbound,
    E2E_REDRIVE_ID: fixtures.redrive,
    E2E_LARGE_INBOUND_ID: fixtures.largeInbound,
    E2E_LARGE_ATTACHMENT_ID: fixtures.largeAttachment,
    E2E_LARGE_RAW_SHA256: fixtures.largeRawSha256,
    E2E_LARGE_RAW_BYTES: String(fixtures.largeRawBytes),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  execFileSync('pnpm', ['test:e2e:live'], {
    stdio: 'inherit',
    env: acceptanceBrowserEnvironment(process.argv[2], process.argv[3]),
  });
