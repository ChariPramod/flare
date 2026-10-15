import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const values = Object.fromEntries(
  readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
if (values.FLARE_ACCEPTANCE !== 'true')
  throw new Error('Use the disposable acceptance environment');
const fixtures = JSON.parse(
  readFileSync(join(dirname(process.argv[2]), 'acceptance/fixtures.json'), 'utf8'),
);
execFileSync('pnpm', ['test:e2e:live'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_EMAIL: values.SEED_OWNER_EMAIL,
    E2E_PASSWORD: values.SEED_OWNER_PASSWORD,
    E2E_FROM: 'sender@acceptance.test',
    E2E_TO: values.SEED_SUBSCRIBER_EMAIL,
    E2E_ACCEPTANCE: 'true',
    E2E_OPERATOR_FIXTURE: join(dirname(process.argv[2]), 'acceptance/operator.json'),
    E2E_ACCEPTANCE_DIRECTORY: dirname(process.argv[2]),
    E2E_ACCEPTANCE_PROJECT: process.argv[3] ?? '',
    // Automatic DOM error snapshots can contain enrollment keys and recovery codes.
    PLAYWRIGHT_NO_COPY_PROMPT: '1',
    E2E_INBOUND_ID: fixtures.inbound,
    E2E_REDRIVE_ID: fixtures.redrive,
  },
});
