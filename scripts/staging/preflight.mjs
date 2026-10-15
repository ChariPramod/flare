// Read-only and offline: no network requests, Docker changes, or credential output.
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

export function publicHostname(value) {
  return (
    typeof value === 'string' &&
    value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value) &&
    !/(?:^|\.)(localhost|local|internal|test|invalid|example|example\.com|example\.net|example\.org)$/i.test(
      value,
    )
  );
}
const placeholder = (value) =>
  !value || /CHANGE_ME|REPLACE_ME|changeme|your[-_ ]|example\.(com|net|org)|localhost/i.test(value);
// Keep the offline shape checks aligned with packages/mail/src/routes.ts. This
// script must also run before service packages are built; it never loads adapters.
export function validateNamedStagingTransports(env) {
  const issues = [];
  const fail = (code) => issues.push({ code, field: 'MAIL_TRANSPORTS' });
  if (!env.MAIL_TRANSPORTS) {
    fail('named-transports-required');
    return issues;
  }
  let instances;
  try {
    if (env.MAIL_TRANSPORTS.length > 131072) throw new Error();
    instances = JSON.parse(env.MAIL_TRANSPORTS);
    if (!Array.isArray(instances) || !instances.length || instances.length > 100) throw new Error();
  } catch {
    fail('named-transports-invalid');
    return issues;
  }
  const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
  const reference = /^[A-Z][A-Z0-9_]{0,127}$/;
  const base = ['id', 'kind', 'server_id', 'pool_id', 'credential_version'];
  const shapes = {
    postal: ['url', 'api_key_env', 'webhook_public_key_env'],
    ses: [
      'region',
      'configuration_set',
      'access_key_id_env',
      'secret_access_key_env',
      'session_token_env',
      'sns_topic_arn',
    ],
    smtp: ['host', 'port', 'secure', 'delivery_tls_required', 'username_env', 'password_env'],
  };
  const ids = new Set(),
    topics = new Set();
  for (const instance of instances) {
    if (
      !instance ||
      typeof instance !== 'object' ||
      Array.isArray(instance) ||
      !Object.hasOwn(shapes, instance.kind)
    ) {
      fail('named-transports-invalid');
      continue;
    }
    const fields = [...base, ...shapes[instance.kind]];
    if (
      Object.keys(instance).some((key) => !fields.includes(key)) ||
      ['id', 'server_id', 'pool_id', 'credential_version'].some(
        (field) => typeof instance[field] !== 'string' || !identifier.test(instance[field]),
      )
    ) {
      fail('named-transports-invalid');
      continue;
    }
    if (['postal', 'ses', 'smtp'].includes(instance.id)) fail('named-instance-reserved');
    if (ids.has(instance.id)) fail('named-instance-duplicate');
    ids.add(instance.id);
    const required =
      instance.kind === 'postal'
        ? ['api_key_env', 'webhook_public_key_env']
        : instance.kind === 'ses'
          ? ['access_key_id_env', 'secret_access_key_env']
          : [];
    const references = [
      ...new Set([...required, ...Object.keys(instance).filter((field) => field.endsWith('_env'))]),
    ];
    for (const field of references) {
      const name = instance[field];
      if (typeof name !== 'string' || !reference.test(name))
        fail('named-credential-reference-invalid');
      else if (typeof env[name] !== 'string' || placeholder(env[name]))
        fail('named-credential-reference-unavailable');
    }
    if (instance.kind === 'postal') {
      try {
        const url = new URL(instance.url);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !(
            (url.protocol === 'https:' && publicHostname(url.hostname)) ||
            (url.protocol === 'http:' && url.hostname === 'postal')
          )
        )
          throw new Error();
      } catch {
        fail('named-postal-endpoint-invalid');
      }
      try {
        const key = env[instance.webhook_public_key_env];
        if (
          typeof key !== 'string' ||
          /PRIVATE KEY/.test(key) ||
          createPublicKey(key).asymmetricKeyType !== 'rsa'
        )
          throw new Error();
      } catch {
        fail('named-postal-public-key-invalid');
      }
    } else if (instance.kind === 'ses') {
      if (
        typeof instance.region !== 'string' ||
        !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(instance.region) ||
        typeof instance.configuration_set !== 'string' ||
        !identifier.test(instance.configuration_set) ||
        typeof instance.sns_topic_arn !== 'string' ||
        !/^arn:aws(?:-us-gov|-cn)?:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/.test(
          instance.sns_topic_arn,
        ) ||
        instance.sns_topic_arn.split(':')[3] !== instance.region
      )
        fail('named-ses-settings-invalid');
      if (topics.has(instance.sns_topic_arn)) fail('named-sns-topic-duplicate');
      topics.add(instance.sns_topic_arn);
    } else {
      if (
        !publicHostname(instance.host) ||
        ![465, 587, 2525].includes(instance.port) ||
        typeof instance.secure !== 'boolean'
      )
        fail('named-smtp-provider-required');
      if (instance.delivery_tls_required !== true) fail('named-smtp-tls-guarantee-required');
      if (Boolean(instance.username_env) !== Boolean(instance.password_env))
        fail('named-smtp-auth-pair-required');
    }
  }
  return issues;
}
export function validateStagingEnv(env) {
  const issues = [];
  const fail = (code, field) => issues.push({ code, field });
  if (env.NODE_ENV !== 'production') fail('production-required', 'NODE_ENV');
  const hostKeys = [
    'STAGING_DASHBOARD_HOST',
    'STAGING_API_HOST',
    'STAGING_WS_HOST',
    'STAGING_TRACKING_HOST',
  ];
  for (const field of hostKeys)
    if (!publicHostname(env[field])) fail('public-host-required', field);
  if (new Set(hostKeys.map((key) => env[key])).size !== 4)
    fail('distinct-hosts-required', 'STAGING_HOSTS');
  if (
    !/^[^\s@]+@[^\s@]+$/.test(env.STAGING_ACME_EMAIL ?? '') ||
    placeholder(env.STAGING_ACME_EMAIL)
  )
    fail('contact-required', 'STAGING_ACME_EMAIL');
  for (const [field, expected] of Object.entries({
    WEB_ORIGIN: `https://${env.STAGING_DASHBOARD_HOST}`,
    PUBLIC_API_URL: `https://${env.STAGING_API_HOST}`,
    TRACKING_URL: `https://${env.STAGING_API_HOST}`,
    NOVU_PUBLIC_API_URL: `https://${env.STAGING_DASHBOARD_HOST}/novu`,
    NOVU_PUBLIC_WS_URL: `https://${env.STAGING_WS_HOST}`,
  }))
    if (env[field] !== expected) fail('public-url-mismatch', field);
  const secrets = [
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
  ];
  for (const field of secrets)
    if (placeholder(env[field]) || env[field].length < 32) fail('strong-secret-required', field);
  if (!env.SEED_API_KEY?.startsWith('fl_') || env.SEED_API_KEY.length < 40)
    fail('seed-key-format-invalid', 'SEED_API_KEY');
  if (Buffer.from(env.FLARE_ENCRYPTION_KEY ?? '', 'base64').length !== 32)
    fail('key-format-invalid', 'FLARE_ENCRYPTION_KEY');
  if (env.STORE_ENCRYPTION_KEY?.length !== 32) fail('key-format-invalid', 'STORE_ENCRYPTION_KEY');
  if (new Set(secrets.map((key) => env[key])).size !== secrets.length)
    fail('independent-secrets-required', 'SECRETS');
  if (env.FLARE_ACCEPTANCE === 'true') fail('acceptance-config-forbidden', 'FLARE_ACCEPTANCE');
  if (env.MAIL_SANDBOX === 'true') fail('sandbox-config-forbidden', 'MAIL_SANDBOX');
  const operatorIds = String(env.FLARE_OPERATOR_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (
    !operatorIds.length ||
    operatorIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
    )
  )
    fail('operator-allowlist-required', 'FLARE_OPERATOR_USER_IDS');
  issues.push(...validateNamedStagingTransports(env));

  const transports = (env.TRANSPORT_PRIORITY || env.TRANSPORT || '')
    .split(',')
    .map((v) => v.trim());
  for (const transport of env.MAIL_TRANSPORTS ? [] : transports) {
    if (!['postal', 'ses', 'smtp'].includes(transport)) fail('transport-invalid', 'TRANSPORT');
    const required =
      transport === 'postal'
        ? ['POSTAL_API_KEY']
        : transport === 'ses'
          ? [
              'AWS_REGION',
              'AWS_ACCESS_KEY_ID',
              'AWS_SECRET_ACCESS_KEY',
              'SES_CONFIGURATION_SET',
              'SES_SNS_TOPIC_ARNS',
            ]
          : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];
    for (const field of required)
      if (placeholder(env[field])) fail('provider-setting-required', field);
    if (
      transport === 'smtp' &&
      (!publicHostname(env.SMTP_HOST) || !['465', '587', '2525'].includes(env.SMTP_PORT))
    )
      fail('smtp-provider-required', 'SMTP_HOST');
    if (transport === 'smtp' && env.SMTP_DELIVERY_TLS_REQUIRED !== 'true')
      fail('smtp-tls-guarantee-required', 'SMTP_DELIVERY_TLS_REQUIRED');
  }
  const oidc = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'];
  if (oidc.some((field) => env[field])) {
    for (const field of oidc) if (placeholder(env[field])) fail('oidc-setting-required', field);
    try {
      if (new URL(env.OIDC_ISSUER).protocol !== 'https:') fail('https-required', 'OIDC_ISSUER');
    } catch {
      fail('https-required', 'OIDC_ISSUER');
    }
  }
  for (const field of ['POSTAL_HOSTNAME', 'POSTAL_SPF_HOST', 'POSTAL_RETURN_PATH', 'SEED_DOMAIN'])
    if (!publicHostname(env[field])) fail('public-host-required', field);
  if (!env.STAGING_TRACKING_HOST?.endsWith(`.${env.SEED_DOMAIN}`))
    fail('sender-tracking-host-mismatch', 'STAGING_TRACKING_HOST');
  if (
    placeholder(env.SEED_OWNER_EMAIL) ||
    /\.(local|test|invalid)$/.test(env.SEED_OWNER_EMAIL ?? '')
  )
    fail('operator-email-required', 'SEED_OWNER_EMAIL');
  for (const [field, host] of Object.entries({
    DATABASE_URL: 'postgres',
    REDIS_URL: 'redis',
    S3_ENDPOINT: 'minio',
    NOVU_API_URL: 'novu-api',
    POSTAL_API_URL: 'postal',
  })) {
    try {
      if (new URL(env[field]).hostname !== host) fail('compose-endpoint-required', field);
    } catch {
      fail('compose-endpoint-required', field);
    }
  }
  try {
    if (decodeURIComponent(new URL(env.DATABASE_URL).password) !== env.POSTGRES_PASSWORD)
      fail('database-secret-mismatch', 'DATABASE_URL');
  } catch {
    /* invalid URL reported above */
  }
  if (env.TRUST_PROXY !== '172.30.250.10,172.30.250.11')
    fail('proxy-address-mismatch', 'TRUST_PROXY');
  if (env.FLARE_FORWARD_CLIENT_IP !== 'true')
    fail('client-ip-forwarding-required', 'FLARE_FORWARD_CLIENT_IP');
  // This template has one audited subnet. Changing it needs reviewing the overlay and host routes.
  if (env.STAGING_SUBNET && env.STAGING_SUBNET !== '172.30.250.0/24')
    fail('review-subnet-required', 'STAGING_SUBNET');
  if (env.STAGING_PROXY_IP && env.STAGING_PROXY_IP !== '172.30.250.10')
    fail('review-proxy-required', 'STAGING_PROXY_IP');
  if (env.SMTP_TLS_CERT !== '/app/ops/certs/relay.crt')
    fail('mounted-path-required', 'SMTP_TLS_CERT');
  if (env.SMTP_TLS_KEY !== '/app/ops/certs/relay.key')
    fail('mounted-path-required', 'SMTP_TLS_KEY');
  if (env.POSTAL_WEBHOOK_PUBLIC_KEY_FILE !== '/app/ops/certs/postal-public.pem')
    fail('mounted-path-required', 'POSTAL_WEBHOOK_PUBLIC_KEY_FILE');
  return issues;
}

export function preflight(root) {
  const issues = [];
  const fail = (code, field) => issues.push({ code, field });
  const read = (file, privateFile = false) => {
    try {
      const path = resolve(root, file),
        stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        fail('regular-file-required', file);
        return undefined;
      }
      if (privateFile && stat.mode & 0o077) fail('private-permissions-required', file);
      return readFileSync(path, 'utf8');
    } catch {
      fail('file-unreadable', file);
      return undefined;
    }
  };
  const source = read('.env', true);
  let env = {};
  if (source) {
    try {
      env = parseEnv(source);
      issues.push(...validateStagingEnv(env));
    } catch {
      fail('env-invalid', '.env');
    }
    const names = source
      .split('\n')
      .map((line) => line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1])
      .filter(Boolean);
    if (new Set(names).size !== names.length) fail('duplicate-env-keys', '.env');
    if (/\$(?:\{|[A-Za-z_])/.test(source)) fail('env-interpolation-forbidden', '.env');
  }
  const certificate = read('ops/certs/relay.crt');
  const key = read('ops/certs/relay.key', true);
  const ca = read('ops/certs/relay-ca.pem');
  if (certificate && key && ca) {
    try {
      const cert = new X509Certificate(certificate);
      if (!cert.checkHost('flare-smtp-relay', { subject: 'never' }))
        fail('relay-san-mismatch', 'ops/certs/relay.crt');
      if (cert.checkHost('localhost') || cert.subject === cert.issuer)
        fail('development-certificate-forbidden', 'ops/certs/relay.crt');
      if (
        Date.parse(cert.validFrom) > Date.now() ||
        Date.parse(cert.validTo) < Date.now() + 7 * 86400000
      )
        fail('certificate-validity-insufficient', 'ops/certs/relay.crt');
      if (
        !cert.publicKey
          .export({ format: 'der', type: 'spki' })
          .equals(createPublicKey(createPrivateKey(key)).export({ format: 'der', type: 'spki' }))
      )
        fail('certificate-key-mismatch', 'ops/certs/relay.key');
      execFileSync(
        'openssl',
        [
          'verify',
          '-purpose',
          'sslserver',
          '-CAfile',
          resolve(root, 'ops/certs/relay-ca.pem'),
          '-untrusted',
          resolve(root, 'ops/certs/relay.crt'),
          resolve(root, 'ops/certs/relay.crt'),
        ],
        { stdio: 'pipe', timeout: 10000 },
      );
    } catch {
      fail('relay-chain-verification-failed', 'ops/certs/relay.crt');
    }
  }
  const postalConfig = read('ops/postal/config/postal.yml', true);
  const postalKey = read('ops/postal/config/signing.key', true);
  const postalPublic = read('ops/certs/postal-public.pem');
  if (postalConfig) {
    try {
      const config = parseYaml(postalConfig);
      if (!config.postal?.allowed_request_destinations?.includes('flare-api'))
        fail('postal-callback-not-allowed', 'postal.yml');
      if (
        config.main_db?.password !== env.POSTAL_DB_PASSWORD ||
        config.message_db?.password !== env.POSTAL_DB_PASSWORD
      )
        fail('postal-secret-mismatch', 'postal.yml');
      if (config.postal?.smtp_hostname !== env.POSTAL_HOSTNAME)
        fail('postal-host-mismatch', 'postal.yml');
      if (
        !config.dns?.mx_records?.includes(env.POSTAL_HOSTNAME) ||
        config.dns?.spf_include !== env.POSTAL_SPF_HOST ||
        config.dns?.return_path_domain !== env.POSTAL_RETURN_PATH
      )
        fail('postal-dns-config-mismatch', 'postal.yml');
    } catch {
      fail('postal-config-invalid', 'postal.yml');
    }
  }
  if (postalKey && postalPublic) {
    try {
      if (
        !createPublicKey(createPrivateKey(postalKey))
          .export({ format: 'der', type: 'spki' })
          .equals(createPublicKey(postalPublic).export({ format: 'der', type: 'spki' }))
      )
        fail('postal-key-mismatch', 'postal-public.pem');
    } catch {
      fail('postal-key-invalid', 'postal-public.pem');
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    externalChecks: [
      'public-dns',
      'acme-issuance',
      'provider-authentication-delivery',
      'operator-identity-mfa-and-live-session',
      'organization-approval-and-route-bindings',
      'physical-provider-pool-isolation',
      'fresh-domain-transport-readiness',
      'oidc-if-enabled',
      'off-host-backup-restore',
    ],
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) {
    console.error('Usage: node scripts/staging/preflight.mjs [--root deployment-directory]');
    process.exitCode = 1;
  } else {
    const result = preflight(resolve(args[1] || process.cwd()));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }
}
