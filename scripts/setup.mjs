import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
if (existsSync('.env')) throw new Error('.env already exists; setup will not overwrite secrets.');
const secret = () => randomBytes(32).toString('hex');
const values = {
  FLARE_UID: String(process.getuid?.() ?? 1000),
  FLARE_GID: String(process.getgid?.() ?? 1000),
  POSTGRES_PASSWORD: secret(),
  METRICS_TOKEN: secret(),
  JWT_SECRET: secret(),
  FLARE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  STORE_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
  NOVU_JWT_SECRET: secret(),
  NOVU_SECRET_KEY: secret(),
  NOVU_MONGO_PASSWORD: secret(),
  S3_SECRET_KEY: secret(),
  POSTAL_DB_PASSWORD: secret(),
  SEED_OWNER_PASSWORD: secret(),
  SEED_API_KEY: `fl_${randomBytes(32).toString('base64url')}`,
};
let env = readFileSync('.env.example', 'utf8');
for (const [key, value] of Object.entries(values))
  env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
env = env.replace(
  'postgres://flare:CHANGE_ME@postgres:5432/flare',
  `postgres://flare:${values.POSTGRES_PASSWORD}@postgres:5432/flare`,
);
if (process.argv.includes('--dev')) env = env.replace('TRANSPORT=postal', 'TRANSPORT=smtp');
mkdirSync('ops/postal/config', { recursive: true, mode: 0o700 });
mkdirSync('ops/certs', { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
writeFileSync(
  'ops/postal/config/signing.key',
  privateKey.export({ format: 'pem', type: 'pkcs1' }),
  { mode: 0o600 },
);
writeFileSync('ops/certs/postal-public.pem', publicKey.export({ format: 'pem', type: 'spki' }));
writeFileSync(
  'ops/postal/config/postal.yml',
  `version: 2\npostal:\n  web_hostname: postal.localhost\n  web_protocol: http\n  smtp_hostname: postal.localhost\n  allowed_request_destinations:\n    - flare-api\nmain_db:\n  host: postal-mariadb\n  username: root\n  password: ${values.POSTAL_DB_PASSWORD}\n  database: postal\nmessage_db:\n  host: postal-mariadb\n  username: root\n  password: ${values.POSTAL_DB_PASSWORD}\n  prefix: postal\nrails:\n  secret_key: ${secret()}\ndns:\n  mx_records:\n    - postal.localhost\n  spf_include: spf.postal.localhost\n  return_path_domain: rp.postal.localhost\n  route_domain: routes.postal.localhost\n`,
  { mode: 0o600 },
);
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ops/certs/relay.key',
    '-out',
    'ops/certs/relay.crt',
    '-days',
    '365',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,DNS:flare-smtp-relay',
  ],
  { stdio: 'ignore' },
);
writeFileSync('.env', env, { mode: 0o600 });
console.log(
  'Created .env, Postal configuration, and development STARTTLS certificates. Secrets were not printed.',
);
