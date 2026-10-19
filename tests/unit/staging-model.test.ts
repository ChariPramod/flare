import { describe, expect, it } from 'vitest';
import { validateStagingModel } from '../../scripts/staging/validate-model.mjs';

function model(splitWeb = false) {
  return {
    services: {
      ...Object.fromEntries(
        ['postgres', 'redis', 'minio', 'postal-mariadb', 'novu-mongodb', 'novu-redis'].map(
          (name) => [name, { restart: 'unless-stopped' }],
        ),
      ),
      ...Object.fromEntries(
        ['minio-init', 'postal-config', 'postal-init', 'flare-migrate'].map((name) => [name, {}]),
      ),
      ingress: {
        image: 'caddy:2.10.2-alpine',
        networks: { default: { ipv4_address: '172.30.250.10' } },
        ports: [
          { published: '80', protocol: 'tcp' },
          { published: '443', protocol: 'tcp' },
          { published: '443', protocol: 'udp' },
        ],
        volumes: [
          {
            type: 'bind',
            source: `/deployment/ops/staging/${splitWeb ? 'Caddyfile.split-web' : 'Caddyfile'}`,
            target: '/etc/caddy/Caddyfile',
            read_only: true,
          },
        ],
      },
      'flare-web': {
        networks: { default: { ipv4_address: '172.30.250.11' } },
        environment: { FLARE_FORWARD_CLIENT_IP: splitWeb ? 'false' : 'true' },
        ports: [{ host_ip: '127.0.0.1', published: '3000' }],
      },
      'flare-api': {
        environment: {
          STAGING_WEB_MODE: splitWeb ? 'vercel' : 'compose',
          TRUST_PROXY: splitWeb ? '172.30.250.10' : '172.30.250.10,172.30.250.11',
          FLARE_DASHBOARD_INBOX_WS: splitWeb ? 'true' : '',
          NOVU_WS_URL: 'http://novu-ws:3002',
          FLARE_DASHBOARD_PROXY_SECRET: splitWeb
            ? `fdp_${Buffer.alloc(32, 27).toString('base64')}`
            : '',
        },
        ports: [{ host_ip: '127.0.0.1', published: '4000' }],
      },
      'postal-smtp': { ports: [] as { published: string; protocol: string }[] },
      'novu-api': { ports: [] as { published: string; host_ip?: string }[] },
      'novu-dashboard': {},
    },
    networks: {
      default: { ipam: { config: [{ subnet: '172.30.250.0/24', ip_range: '172.30.250.128/25' }] } },
    },
  };
}

describe('expanded staging Compose boundaries', () => {
  it('supports each explicit web mode with optional inbound without widening other ports', () => {
    for (const splitWeb of [false, true]) {
      const fixture = model(splitWeb);
      expect(() => validateStagingModel(fixture, { splitWeb })).not.toThrow();
      fixture.services['postal-smtp'].ports.push({ published: '25', protocol: 'tcp' });
      expect(() => validateStagingModel(fixture, { splitWeb, postal: true })).not.toThrow();
      expect(() => validateStagingModel(fixture, { splitWeb })).toThrow(
        'Unexpected publicly published port',
      );
    }
  });
  it('rejects omitted/wrong overlay selection and a mismatched active Caddy asset', () => {
    expect(() => validateStagingModel(model(true))).toThrow('web mode');
    expect(() => validateStagingModel(model(false), { splitWeb: true })).toThrow('web mode');
    const fixture = model(true);
    fixture.services.ingress.volumes[0].source = '/deployment/ops/staging/Caddyfile';
    expect(() => validateStagingModel(fixture, { splitWeb: true })).toThrow('configuration mount');
    fixture.services.ingress.volumes[0].source += '.split-web';
    fixture.services.ingress.volumes[0].read_only = false;
    expect(() => validateStagingModel(fixture, { splitWeb: true })).toThrow('configuration mount');
  });
  it('rejects legacy trust, missing signing, or a native public WS endpoint in split mode', () => {
    for (const change of [
      { TRUST_PROXY: '172.30.250.10,172.30.250.11' },
      { FLARE_DASHBOARD_PROXY_SECRET: '' },
      { FLARE_DASHBOARD_PROXY_SECRET: `fdp_${'x'.repeat(43)}=` },
      { FLARE_DASHBOARD_INBOX_WS: 'false' },
      { NOVU_WS_URL: 'https://ws.novu.co' },
    ]) {
      const fixture = model(true);
      Object.assign(fixture.services['flare-api'].environment, change);
      expect(() => validateStagingModel(fixture, { splitWeb: true })).toThrow();
    }
    const fixture = model(true);
    fixture.services['flare-web'].environment.FLARE_FORWARD_CLIENT_IP = 'true';
    expect(() => validateStagingModel(fixture, { splitWeb: true })).toThrow('legacy client IP');
  });
  it('rejects exposed native administration and newly published backend ports', () => {
    const fixture = model(true);
    fixture.services['novu-api'].ports = [{ published: '3000', host_ip: '127.0.0.1' }];
    expect(() => validateStagingModel(fixture, { splitWeb: true })).toThrow('Native Novu');
    fixture.services['novu-api'].ports = [];
    fixture.services['flare-api'].ports[0].host_ip = '0.0.0.0';
    expect(() => validateStagingModel(fixture, { splitWeb: true })).toThrow('publicly published');
  });
});
