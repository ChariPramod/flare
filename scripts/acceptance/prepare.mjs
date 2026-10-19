import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flare-acceptance-')));
// Respect Git's source boundary, including uncommitted source, while excluding ignored caches/secrets.
const sourceFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
for (const file of new Set(sourceFiles)) {
  if (!existsSync(file)) continue;
  if (file.split('/').some((part) => ['.git', '.aws', '.ssh', '.codex', '.agents'].includes(part)))
    continue;
  if (
    basename(file).startsWith('.env') ||
    file.startsWith('ops/certs/') ||
    file.startsWith('ops/postal/config/')
  )
    continue;
  if (!lstatSync(file).isFile())
    throw new Error(`Acceptance staging requires a regular source file: ${file}`);
  mkdirSync(dirname(join(directory, file)), { recursive: true });
  cpSync(file, join(directory, file));
}
cpSync('.env.example', join(directory, '.env.example'));
execFileSync(process.execPath, ['scripts/setup.mjs', '--dev'], { cwd: directory, stdio: 'pipe' });
const envPath = join(directory, '.env');
const operatorId = randomUUID();
let env = readFileSync(envPath, 'utf8');
env = env
  // Docker publishes IPv4 loopback ports. Avoid an unrelated IPv6 localhost listener.
  .replace(/^WEB_ORIGIN=.*$/m, 'WEB_ORIGIN=http://127.0.0.1:3000')
  .replace(/^PUBLIC_API_URL=.*$/m, 'PUBLIC_API_URL=http://127.0.0.1:4000')
  .replace(/^NOVU_PUBLIC_API_URL=.*$/m, 'NOVU_PUBLIC_API_URL=http://127.0.0.1:3000/novu')
  .replace(/^NOVU_PUBLIC_WS_URL=.*$/m, 'NOVU_PUBLIC_WS_URL=http://127.0.0.1:3002')
  .replace(/^SEED_DOMAIN=.*$/m, 'SEED_DOMAIN=acceptance.test')
  .replace(/^AUTH_RATE_BURST=.*$/m, 'AUTH_RATE_BURST=100')
  .replace(/^FLARE_OPERATOR_USER_IDS=.*\n?/gm, '')
  .replace(/^FLARE_DASHBOARD_PROXY_SECRET=.*\n?/gm, '')
  .replace(/^MAIL_SANDBOX=.*\n?/gm, '')
  .replace(/^SEED_SUBSCRIBER_EMAIL=.*$/m, 'SEED_SUBSCRIBER_EMAIL=recipient@example.net');
writeFileSync(
  envPath,
  env +
    `\nFLARE_ACCEPTANCE=true\nMAIL_SANDBOX=true\nDOMAIN_DNS_SERVERS=172.29.250.53\nFLARE_OPERATOR_USER_IDS=${operatorId}\nFLARE_DASHBOARD_PROXY_SECRET=fdp_${randomBytes(32).toString('base64')}\n`,
  {
    mode: 0o600,
  },
);
mkdirSync(join(directory, 'acceptance/dns'), { recursive: true });
// Keep this host-owned: the root container overwrites it, then host Playwright reads it.
writeFileSync(join(directory, 'acceptance/fixtures.json'), '{}', { mode: 0o600 });
writeFileSync(join(directory, 'acceptance/operator.json'), JSON.stringify({ id: operatorId }), {
  mode: 0o600,
});
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
