import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { parseEnv } from 'node:util';
import {
  preflight,
  publicHostname,
  validateStagingEnv,
  validateNamedStagingTransports,
} from '../../scripts/staging/preflight.mjs';

const fixturePublicKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'pem' })
  .toString();
const postalInstance = {
  id: 'staging-postal',
  kind: 'postal',
  server_id: 'staging-server',
  pool_id: 'transactional',
  credential_version: 'v1',
  url: 'http://postal:5000',
  api_key_env: 'POSTAL_API_KEY',
  webhook_public_key_env: 'STAGING_POSTAL_PUBLIC_KEY',
};
function environment() {
  const env = parseEnv(readFileSync('.env.example', 'utf8'));
  for (const [index, field] of [
    'POSTGRES_PASSWORD',
    'JWT_SECRET',
    'FLARE_ENCRYPTION_KEY',
    'STORE_ENCRYPTION_KEY',
    'NOVU_JWT_SECRET',
    'NOVU_SECRET_KEY',
    'NOVU_MONGO_PASSWORD',
    'S3_SECRET_KEY',
    'POSTAL_DB_PASSWORD',
    'SEED_OWNER_PASSWORD',
    'SEED_API_KEY',
    'METRICS_TOKEN',
  ].entries())
    env[field] = String(index).padStart(32, 'k');
  return {
    ...env,
    NODE_ENV: 'production',
    FLARE_OPERATOR_USER_IDS: '00000000-0000-4000-8000-000000000010',
    MAIL_SANDBOX: 'false',
    MAIL_TRANSPORTS: JSON.stringify([postalInstance]),
    STAGING_POSTAL_PUBLIC_KEY: fixturePublicKey,
    SEED_API_KEY: `fl_${'k'.repeat(40)}`,
    FLARE_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
    DATABASE_URL: `postgres://flare:${env.POSTGRES_PASSWORD}@postgres:5432/flare`,
    STAGING_DASHBOARD_HOST: 'flare.staging.pareto.dev',
    STAGING_API_HOST: 'api.staging.pareto.dev',
    STAGING_WS_HOST: 'ws.staging.pareto.dev',
    STAGING_TRACKING_HOST: 'track.notify.staging.pareto.dev',
    STAGING_ACME_EMAIL: 'ops@pareto.dev',
    WEB_ORIGIN: 'https://flare.staging.pareto.dev',
    PUBLIC_API_URL: 'https://api.staging.pareto.dev',
    TRACKING_URL: 'https://api.staging.pareto.dev',
    NOVU_PUBLIC_API_URL: 'https://flare.staging.pareto.dev/novu',
    NOVU_PUBLIC_WS_URL: 'https://ws.staging.pareto.dev',
    TRUST_PROXY: '172.30.250.10,172.30.250.11',
    FLARE_FORWARD_CLIENT_IP: 'true',
    POSTAL_API_KEY: 'fixture-provider-key',
    POSTAL_HOSTNAME: 'mail.staging.pareto.dev',
    POSTAL_SPF_HOST: 'spf.staging.pareto.dev',
    POSTAL_RETURN_PATH: 'rp.staging.pareto.dev',
    SEED_DOMAIN: 'notify.staging.pareto.dev',
    SEED_OWNER_EMAIL: 'owner@pareto.dev',
  };
}

describe('staging offline preflight', () => {
  it('rejects local, placeholder, injected or ambiguous hostnames', () => {
    for (const hostname of [
      'localhost',
      '127.0.0.1',
      'dash.example.com',
      'dash.local',
      'dash.test',
      'good.dev/path',
      'good.dev\nrespond 200',
      '*.pareto.dev',
    ])
      expect(publicHostname(hostname)).toBe(false);
    expect(publicHostname('flare.staging.pareto.dev')).toBe(true);
  });
  it('validates deployment origins, secrets, proxy boundaries and required provider settings without echoing values', () => {
    expect(validateStagingEnv(environment())).toEqual([]);
    const bad = {
      ...environment(),
      JWT_SECRET: 'sensitive-short-value',
      TRUST_PROXY: '0.0.0.0/0',
      NOVU_PUBLIC_API_URL: 'https://api.novu.co',
      POSTAL_API_KEY: '',
    };
    const report = validateStagingEnv(bad);
    expect(report.map((issue: { code: string }) => issue.code)).toEqual(
      expect.arrayContaining([
        'strong-secret-required',
        'proxy-address-mismatch',
        'public-url-mismatch',
        'named-credential-reference-unavailable',
      ]),
    );
    expect(JSON.stringify(report)).not.toContain('sensitive-short-value');
  });
  it('requires a complete SMTP and OIDC configuration', () => {
    const result = validateStagingEnv({
      ...environment(),
      TRANSPORT: 'smtp',
      MAIL_TRANSPORTS: '',
      OIDC_ISSUER: 'http://issuer.local',
    });
    expect(result.map((issue: { code: string }) => issue.code)).toEqual(
      expect.arrayContaining([
        'smtp-provider-required',
        'smtp-tls-guarantee-required',
        'oidc-setting-required',
        'https-required',
      ]),
    );
  });
  it('rejects sandbox mode and missing operator authority for staging', () => {
    expect(validateStagingEnv({ ...environment(), MAIL_SANDBOX: 'true' })).toContainEqual({
      code: 'sandbox-config-forbidden',
      field: 'MAIL_SANDBOX',
    });
    for (const value of ['', 'owner', '00000000-0000-4000-8000-000000000010,not-a-uuid'])
      expect(
        validateStagingEnv({ ...environment(), FLARE_OPERATOR_USER_IDS: value }),
      ).toContainEqual({ code: 'operator-allowlist-required', field: 'FLARE_OPERATOR_USER_IDS' });
    expect(
      validateStagingEnv({
        ...environment(),
        FLARE_OPERATOR_USER_IDS:
          '00000000-0000-4000-8000-000000000010, 00000000-0000-4000-8000-000000000011',
      }),
    ).toEqual([]);
    expect(
      validateNamedStagingTransports({ ...environment(), MAIL_TRANSPORTS: '' }),
    ).toContainEqual({ code: 'named-transports-required', field: 'MAIL_TRANSPORTS' });
  });
  it('validates named transport references without leaking configuration or credentials', () => {
    const env = environment();
    expect(validateNamedStagingTransports(env)).toEqual([]);
    expect(
      validateNamedStagingTransports({
        ...env,
        MAIL_TRANSPORTS: JSON.stringify([{ ...postalInstance, id: 'postal' }]),
      }),
    ).toContainEqual({ code: 'named-instance-reserved', field: 'MAIL_TRANSPORTS' });
    for (const instance of [
      { ...postalInstance, password: 'private-marker-do-not-output' },
      { ...postalInstance, api_key_env: 'private-marker-do-not-output' },
      { ...postalInstance, api_key_env: 'UNAVAILABLE_KEY' },
      { ...postalInstance, url: 'https://user:private-marker-do-not-output@mail.pareto.dev' },
    ]) {
      const report = validateNamedStagingTransports({
        ...env,
        MAIL_TRANSPORTS: JSON.stringify([instance]),
      });
      expect(report.length).toBeGreaterThan(0);
      expect(JSON.stringify(report)).not.toContain('private-marker-do-not-output');
      expect(report.every((issue: { field: string }) => issue.field === 'MAIL_TRANSPORTS')).toBe(
        true,
      );
    }
    expect(validateNamedStagingTransports({ ...env, MAIL_TRANSPORTS: '{broken' })).toContainEqual({
      code: 'named-transports-invalid',
      field: 'MAIL_TRANSPORTS',
    });
    expect(
      validateNamedStagingTransports({
        ...env,
        MAIL_TRANSPORTS: JSON.stringify([postalInstance, postalInstance]),
      }),
    ).toContainEqual({ code: 'named-instance-duplicate', field: 'MAIL_TRANSPORTS' });
    expect(
      validateNamedStagingTransports({ ...env, STAGING_POSTAL_PUBLIC_KEY: 'not a PEM' }),
    ).toContainEqual({ code: 'named-postal-public-key-invalid', field: 'MAIL_TRANSPORTS' });
  });
  it('validates named SES topics and SMTP capability without contacting providers', () => {
    const env = {
      ...environment(),
      NAMED_ACCESS: 'synthetic-access',
      NAMED_SECRET: 'synthetic-secret',
    };
    const ses = {
      id: 'ses-1',
      kind: 'ses',
      server_id: 'account-1',
      pool_id: 'transactional',
      credential_version: 'v1',
      region: 'us-east-1',
      configuration_set: 'staging',
      access_key_id_env: 'NAMED_ACCESS',
      secret_access_key_env: 'NAMED_SECRET',
      sns_topic_arn: 'arn:aws:sns:us-east-1:123456789012:staging',
    };
    const smtp = {
      id: 'smtp-1',
      kind: 'smtp',
      server_id: 'relay-1',
      pool_id: 'transactional',
      credential_version: 'v1',
      host: 'smtp.pareto.dev',
      port: 587,
      secure: false,
      delivery_tls_required: true,
      username_env: 'NAMED_ACCESS',
      password_env: 'NAMED_SECRET',
    };
    expect(
      validateNamedStagingTransports({ ...env, MAIL_TRANSPORTS: JSON.stringify([ses, smtp]) }),
    ).toEqual([]);
    const issues = validateNamedStagingTransports({
      ...env,
      MAIL_TRANSPORTS: JSON.stringify([
        ses,
        { ...ses, id: 'ses-2' },
        { ...smtp, host: 'mailpit', delivery_tls_required: false, password_env: undefined },
      ]),
    });
    expect(issues.map((issue: { code: string }) => issue.code)).toEqual(
      expect.arrayContaining([
        'named-sns-topic-duplicate',
        'named-smtp-provider-required',
        'named-smtp-tls-guarantee-required',
        'named-smtp-auth-pair-required',
      ]),
    );
  });
  it('rejects seed keys that would prevent owner and tenant bootstrap', () => {
    for (const key of ['k'.repeat(64), `fl_${'k'.repeat(36)}`]) {
      expect(validateStagingEnv({ ...environment(), SEED_API_KEY: key })).toContainEqual({
        code: 'seed-key-format-invalid',
        field: 'SEED_API_KEY',
      });
    }
    expect(validateStagingEnv({ ...environment(), SEED_API_KEY: `fl_${'k'.repeat(37)}` })).toEqual(
      [],
    );
  });
  it('checks real certificate trust, private files and matching PostgreSQL/Postal credentials entirely offline', () => {
    const root = mkdtempSync(join(tmpdir(), 'flare-staging-preflight-'));
    try {
      mkdirSync(join(root, 'ops/certs'), { recursive: true });
      mkdirSync(join(root, 'ops/postal/config'), { recursive: true });
      const env = environment();
      writeFileSync(
        join(root, '.env'),
        Object.entries(env)
          .map(([k, v]) => `${k}='${v}'`)
          .join('\n'),
        { mode: 0o600 },
      );
      const openssl = (args: string[]) =>
        execFileSync('openssl', args, { cwd: root, stdio: 'pipe' });
      openssl([
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'ca.key',
        '-out',
        'ops/certs/relay-ca.pem',
        '-days',
        '30',
        '-subj',
        '/CN=Staging Fixture CA',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
      ]);
      openssl([
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'ops/certs/relay.key',
        '-out',
        'relay.csr',
        '-subj',
        '/CN=flare-smtp-relay',
      ]);
      writeFileSync(
        join(root, 'relay.ext'),
        'subjectAltName=DNS:flare-smtp-relay\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n',
      );
      openssl([
        'x509',
        '-req',
        '-in',
        'relay.csr',
        '-CA',
        'ops/certs/relay-ca.pem',
        '-CAkey',
        'ca.key',
        '-CAcreateserial',
        '-out',
        'ops/certs/relay.crt',
        '-days',
        '20',
        '-extfile',
        'relay.ext',
      ]);
      chmodSync(join(root, 'ops/certs/relay.key'), 0o600);
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      writeFileSync(
        join(root, 'ops/postal/config/signing.key'),
        privateKey.export({ type: 'pkcs1', format: 'pem' }),
        { mode: 0o600 },
      );
      writeFileSync(
        join(root, 'ops/certs/postal-public.pem'),
        publicKey.export({ type: 'spki', format: 'pem' }),
      );
      writeFileSync(
        join(root, 'ops/postal/config/postal.yml'),
        JSON.stringify({
          postal: {
            smtp_hostname: env.POSTAL_HOSTNAME,
            allowed_request_destinations: ['flare-api'],
          },
          main_db: { password: env.POSTAL_DB_PASSWORD },
          message_db: { password: env.POSTAL_DB_PASSWORD },
          dns: {
            mx_records: [env.POSTAL_HOSTNAME],
            spf_include: env.POSTAL_SPF_HOST,
            return_path_domain: env.POSTAL_RETURN_PATH,
          },
        }),
        { mode: 0o600 },
      );
      expect(preflight(root)).toMatchObject({ ok: true, issues: [] });
      chmodSync(join(root, '.env'), 0o644);
      expect(preflight(root).issues).toContainEqual({
        code: 'private-permissions-required',
        field: '.env',
      });
      writeFileSync(join(root, 'ops/certs/relay-ca.pem'), 'invalid certificate');
      expect(preflight(root).issues).toContainEqual({
        code: 'relay-chain-verification-failed',
        field: 'ops/certs/relay.crt',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
