import { readFileSync } from 'node:fs';
// Consume expanded Compose JSON privately; never print it (it may contain secrets).
try {
  const model = JSON.parse(readFileSync(0, 'utf8'));
  const postal = process.argv.includes('--postal-inbound');
  const requireCondition = (condition, message) => {
    if (!condition) throw new Error(message);
  };
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
    model.services['flare-api'].environment.TRUST_PROXY === '172.30.250.10,172.30.250.11',
    'Unexpected proxy trust',
  );
  requireCondition(
    model.services['flare-web'].environment.FLARE_FORWARD_CLIENT_IP === 'true',
    'Client IP forwarding flag missing',
  );
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
  console.log('Staging model boundary checks passed.');
} catch {
  console.error('Staging model boundary validation failed; expanded configuration is not logged.');
  process.exitCode = 1;
}
