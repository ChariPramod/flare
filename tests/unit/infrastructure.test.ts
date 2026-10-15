import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
const compose = parse(readFileSync('docker-compose.yml', 'utf8'), { merge: true }) as {
  services: Record<
    string,
    {
      image?: string;
      platform?: string;
      ports?: string[];
      command?: string[];
      environment?: Record<string, unknown>;
    }
  >;
};
describe('deployment boundaries', () => {
  it('selects the only published Postal architecture without forcing Novu off native ARM64', () => {
    for (const name of ['postal-config', 'postal-init', 'postal', 'postal-worker', 'postal-smtp']) {
      expect(compose.services[name]?.image).toBe('ghcr.io/postalserver/postal:3.3.7');
      expect(compose.services[name]?.platform).toBe('linux/amd64');
    }
    for (const component of ['api', 'worker', 'ws', 'dashboard'])
      expect(compose.services[`novu-${component}`]?.platform).toBeUndefined();
  });
  it('pins every Novu component to the approved version', () => {
    for (const component of ['api', 'worker', 'ws', 'dashboard'])
      expect(compose.services[`novu-${component}`]?.image).toBe(
        `ghcr.io/novuhq/novu/${component}:3.19.0`,
      );
  });
  it('keeps admin and data services internal and binds published ports to loopback', () => {
    for (const name of [
      'novu-dashboard',
      'postgres',
      'redis',
      'novu-mongodb',
      'novu-redis',
      'novu-api',
    ])
      expect(compose.services[name]?.ports).toBeUndefined();
    for (const service of Object.values(compose.services))
      for (const port of service.ports ?? []) expect(port.startsWith('127.0.0.1:')).toBe(true);
  });
  it('separates Redis instances and persists queues', () => {
    expect(compose.services.redis?.command).toContain('--appendonly');
    expect(compose.services['novu-redis']?.command).toContain('--appendonly');
    expect(compose.services['novu-api']?.environment?.REDIS_HOST).toBe('novu-redis');
  });
  it('allows only the internal relay through the native outbound guard', () => {
    for (const component of ['novu-api', 'novu-worker'])
      expect(compose.services[component]?.environment?.NOVU_SAFE_OUTBOUND_ALLOW).toBe(
        'flare-smtp-relay',
      );
  });
});
