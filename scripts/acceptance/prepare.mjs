import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'flare-acceptance-'));
const excluded = new Set([
  '.git',
  '.tools',
  'node_modules',
  'dist',
  '.next',
  'test-results',
  'playwright-report',
  'coverage',
]);
cpSync(process.cwd(), directory, {
  recursive: true,
  filter: (path) =>
    !excluded.has(basename(path)) &&
    !basename(path).startsWith('.env') &&
    !path.startsWith(resolve('ops/certs')) &&
    !path.startsWith(resolve('ops/postal/config')),
});
cpSync('.env.example', join(directory, '.env.example'));
execFileSync(process.execPath, ['scripts/setup.mjs', '--dev'], { cwd: directory, stdio: 'pipe' });
const envPath = join(directory, '.env');
let env = readFileSync(envPath, 'utf8');
env = env
  .replace(/^SEED_DOMAIN=.*$/m, 'SEED_DOMAIN=acceptance.test')
  .replace(/^AUTH_RATE_BURST=.*$/m, 'AUTH_RATE_BURST=100')
  .replace(/^SEED_SUBSCRIBER_EMAIL=.*$/m, 'SEED_SUBSCRIBER_EMAIL=recipient@example.net');
writeFileSync(envPath, env + '\nFLARE_ACCEPTANCE=true\nDOMAIN_DNS_SERVERS=172.29.250.53\n', {
  mode: 0o600,
});
mkdirSync(join(directory, 'acceptance/dns'), { recursive: true });
// Deliberately empty until the API creates a domain and publishes its actual DKIM records.
writeFileSync(
  join(directory, 'acceptance/dns/acceptance.test'),
  '$ORIGIN acceptance.test.\n@ 2 IN SOA ns.acceptance.test. hostmaster.acceptance.test. (1 2 2 60 2)\n@ 2 IN NS ns.acceptance.test.\nns 2 IN A 172.29.250.53\n',
);
writeFileSync(
  join(directory, 'acceptance/dns/Corefile'),
  'acceptance.test:53 {\n file /zones/acceptance.test { reload 2s }\n errors\n}\n',
);
mkdirSync(join(directory, 'acceptance/baseline'));
const baseline = '62aaa57';
const files = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', baseline, 'packages/db/migrations'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n');
for (const file of files.filter((p) => p.endsWith('.sql')))
  writeFileSync(
    join(directory, 'acceptance/baseline', basename(file)),
    execFileSync('git', ['show', `${baseline}:${file}`]),
  );
console.log(directory);
