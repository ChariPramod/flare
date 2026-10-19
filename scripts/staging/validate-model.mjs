import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// No returned or thrown value contains expanded configuration or credentials.
export function validateStagingModel(model, { postal = false, splitWeb = false } = {}) {
  const requireCondition = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  for (const name of ['postgres', 'redis', 'minio', 'postal-mariadb', 'novu-mongodb', 'novu-redis'])
    requireCondition(
      model.services[name].restart === 'unless-stopped',
      'Durable dependency restart policy missing',
    );
  for (const name of ['minio-init', 'postal-config', 'postal-init', 'flare-migrate'])
    requireCondition(
      !model.services[name].restart || model.services[name].restart === 'no',
      'Initialization jobs must remain one-shot',
    );
  requireCondition(
    model.services.ingress.image === 'caddy:2.10.2-alpine',
    'Unexpected ingress image',
  );
  requireCondition(
    model.networks.default.ipam.config[0].subnet === '172.30.250.0/24',
    'Unexpected subnet',
  );
  requireCondition(
    model.networks.default.ipam.config[0].ip_range === '172.30.250.128/25',
    'Dynamic allocation must exclude trusted static proxy addresses',
  );
  requireCondition(
    model.services.ingress.networks.default.ipv4_address === '172.30.250.10',
    'Unexpected ingress IP',
  );
  requireCondition(
    model.services['flare-web'].networks.default.ipv4_address === '172.30.250.11',
    'Unexpected web IP',
  );
  requireCondition(
    model.services['flare-api'].environment.STAGING_WEB_MODE === (splitWeb ? 'vercel' : 'compose'),
    'Staging overlay does not match the selected web mode',
  );
  requireCondition(
    model.services['flare-api'].environment.TRUST_PROXY ===
      (splitWeb ? '172.30.250.10' : '172.30.250.10,172.30.250.11'),
    'Unexpected proxy trust',
  );
  requireCondition(
    model.services['flare-web'].environment.FLARE_FORWARD_CLIENT_IP ===
      (splitWeb ? 'false' : 'true'),
    'Unexpected legacy client IP forwarding',
  );
  const caddyfile = model.services.ingress.volumes?.filter(
    (volume) => volume.target === '/etc/caddy/Caddyfile',
  );
  requireCondition(
    caddyfile?.length === 1 &&
      caddyfile[0].type === 'bind' &&
      caddyfile[0].read_only === true &&
      caddyfile[0].source.endsWith(
        `/ops/staging/${splitWeb ? 'Caddyfile.split-web' : 'Caddyfile'}`,
      ),
    'Unexpected ingress configuration mount',
  );
  if (splitWeb) {
    const env = model.services['flare-api'].environment;
    requireCondition(
      env.FLARE_DASHBOARD_INBOX_WS === 'true' && env.NOVU_WS_URL === 'http://novu-ws:3002',
      'Private Inbox WebSocket gateway required',
    );
    requireCondition(
      typeof env.FLARE_DASHBOARD_PROXY_SECRET === 'string' &&
        /^fdp_[A-Za-z0-9+/]{43}=$/.test(env.FLARE_DASHBOARD_PROXY_SECRET) &&
        Buffer.from(env.FLARE_DASHBOARD_PROXY_SECRET.slice(4), 'base64').toString('base64') ===
          env.FLARE_DASHBOARD_PROXY_SECRET.slice(4),
      'Dashboard signing key required',
    );
  }
  for (const [published, protocol] of [
    [80, 'tcp'],
    [443, 'tcp'],
    [443, 'udp'],
  ])
    requireCondition(
      model.services.ingress.ports.some(
        (port) => Number(port.published) === published && port.protocol === protocol,
      ),
      'Required ingress port missing',
    );
  if (postal)
    requireCondition(
      model.services['postal-smtp'].ports?.some((port) => Number(port.published) === 25),
      'Explicit inbound port missing',
    );
  for (const [name, service] of Object.entries(model.services)) {
    for (const port of service.ports ?? []) {
      if (port.host_ip === '127.0.0.1' || port.host_ip === '::1') continue;
      requireCondition(
        (name === 'ingress' && [80, 443].includes(Number(port.published))) ||
          (postal && name === 'postal-smtp' && Number(port.published) === 25),
        'Unexpected publicly published port',
      );
    }
  }
  requireCondition(
    !model.services['novu-api'].ports?.length && !model.services['novu-dashboard'].ports?.length,
    'Native Novu administration exposed',
  );
}

// Consume expanded Compose JSON privately; never print it (it may contain secrets).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--postal-inbound', '--split-web'].includes(arg))) throw new Error();
    validateStagingModel(JSON.parse(readFileSync(0, 'utf8')), {
      postal: args.includes('--postal-inbound'),
      splitWeb: args.includes('--split-web'),
    });
    console.log('Staging model boundary checks passed.');
  } catch {
    console.error(
      'Staging model boundary validation failed; expanded configuration is not logged.',
    );
    process.exitCode = 1;
  }
}
