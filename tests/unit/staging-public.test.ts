import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, request } from 'node:https';
import type { Server, RequestOptions } from 'node:https';
import {
  certificateCode,
  publicIPv4,
  publicIPv6,
  validatePublicManifest,
  verifyPublic,
  requestPublicHttps,
  PUBLIC_PROBES,
  UNVERIFIED,
} from '../../scripts/staging/verify-public.mjs';

const manifest = {
  version: 1,
  ipv4: '8.8.4.4',
  hosts: {
    dashboard: 'flare.staging.pareto.dev',
    api: 'api.staging.pareto.dev',
    ws: 'ws.staging.pareto.dev',
    tracking: 'track.notify.staging.pareto.dev',
    mail: 'mail.staging.pareto.dev',
  },
};
function adapters() {
  return {
    dns: vi.fn(async (_host: string, kind: string): Promise<string[]> => {
      if (kind === 'A') return [manifest.ipv4];
      if (kind === 'AAAA') return [];
      if (kind === 'CNAME') return [manifest.hosts.api];
      if (kind === 'PTR') return [manifest.hosts.mail];
      throw new Error('unexpected');
    }),
    https: vi.fn(async (target: { hostname: string; path: string }) => {
      const service = Object.entries(manifest.hosts).find(
        ([, host]) => host === target.hostname,
      )![0];
      const probe = PUBLIC_PROBES.find(
        (candidate: { service: string; path: string }) =>
          candidate.service === service && candidate.path === target.path,
      )!;
      return { code: 'ok', status: probe.status, contentType: probe.contentType };
    }),
  };
}

describe('public staging manifest and read-only plan', () => {
  it('accepts the explicit narrow IPv4 manifest and never invokes adapters for invalid shapes', async () => {
    expect(validatePublicManifest(manifest)).toBe(true);
    for (const input of [
      null,
      {},
      { ...manifest, version: 2 },
      { ...manifest, token: 'secret' },
      { ...manifest, ipv4: '127.0.0.1' },
      { ...manifest, hosts: { ...manifest.hosts, api: 'https://api.pareto.dev' } },
      { ...manifest, hosts: { ...manifest.hosts, mail: manifest.hosts.api.toUpperCase() } },
      { ...manifest, hosts: { ...manifest.hosts, mail: 'mail.local' } },
      { ...manifest, hosts: { ...manifest.hosts, password: 'secret' } },
    ]) {
      const io = adapters();
      expect((await verifyPublic(input, io)).checks).toEqual([
        { service: 'manifest', check: 'shape', code: 'manifest-invalid' },
      ]);
      expect(io.dns).not.toHaveBeenCalled();
      expect(io.https).not.toHaveBeenCalled();
    }
  });
  it('rejects private, metadata, reserved, documentation, IPv6 and ambiguous addresses', () => {
    for (const ip of [
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '127.1.2.3',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.254',
      '192.0.0.1',
      '192.0.2.1',
      '192.88.99.1',
      '192.168.0.1',
      '198.18.0.1',
      '198.19.255.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::ffff:8.8.8.8',
      '010.1.2.3',
      '8.8.8.8:443',
    ])
      expect(publicIPv4(ip)).toBe(false);
    expect(publicIPv4(manifest.ipv4)).toBe(true);
  });
  it('reports bounded ingress evidence without claiming full staging readiness', async () => {
    const io = adapters();
    const report = await verifyPublic(manifest, io);
    expect(report.ok).toBe(true);
    expect(report.scope).toBe('public-ingress-only');
    expect(report.unverified).toEqual(UNVERIFIED);
    expect(io.https).toHaveBeenCalledTimes(24);
    expect(
      io.https.mock.calls.every(
        ([target]) => Object.keys(target).sort().join(',') === 'hostname,ipv4,path',
      ),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain(manifest.ipv4);
    expect(JSON.stringify(report)).not.toContain(manifest.hosts.api);
  });
  it.each([
    ['A', ['1.1.1.1'], 'dns-address-mismatch'],
    ['A', [], 'dns-address-mismatch'],
    ['A', [manifest.ipv4, '10.0.0.1'], 'dns-non-public-address'],
    ['A', [manifest.ipv4, '1.1.1.1'], 'dns-address-mismatch'],
    ['AAAA', ['2606:4700:4700::1111'], 'dns-unplanned-ipv6'],
    ['AAAA', ['::1'], 'dns-unplanned-ipv6'],
    ['CNAME', ['other.pareto.dev'], 'dns-cname-mismatch'],
    ['CNAME', [], 'dns-cname-mismatch'],
    ['PTR', ['mail.other.dev'], 'dns-ptr-mismatch'],
    ['PTR', [manifest.hosts.mail, 'unexpected.pareto.dev'], 'dns-ptr-mismatch'],
  ])('does not connect after a failed %s lookup (%j)', async (kind, value, code) => {
    const io = adapters();
    const normal = io.dns.getMockImplementation()!;
    io.dns.mockImplementation(async (host, type) =>
      type === kind ? (value as string[]) : normal(host, type),
    );
    const report = await verifyPublic(manifest, io);
    expect(report.ok).toBe(false);
    expect(report.checks.some((check: { code: string }) => check.code === code)).toBe(true);
    expect(io.https).not.toHaveBeenCalled();
  });
  it('sanitizes DNS errors and fails closed on unavailable or malformed answers', async () => {
    const io = adapters();
    io.dns.mockRejectedValue(
      new Error('secret DNS server response at https://user:password@private'),
    );
    let report = await verifyPublic(manifest, io);
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain('user:password');
    expect(io.https).not.toHaveBeenCalled();
    io.dns.mockResolvedValue(null as unknown as string[]);
    report = await verifyPublic(manifest, io);
    expect(
      report.checks.some((check: { code: string }) => check.code === 'dns-invalid-answer'),
    ).toBe(true);
    expect(io.https).not.toHaveBeenCalled();
  });
  it('bounds stalled DNS lookups and refuses all HTTPS afterward', async () => {
    const io = adapters();
    io.dns.mockImplementationOnce(() => new Promise(() => {}));
    const report = await verifyPublic(manifest, io);
    expect(report.ok).toBe(false);
    expect(report.checks[0].code).toBe('dns-unavailable');
    expect(io.https).not.toHaveBeenCalled();
  }, 10000);
  it.each([
    [{ code: 'ok', status: 302, contentType: 'text/html' }, 'https-redirect'],
    [{ code: 'ok', status: 500, contentType: 'text/html' }, 'https-status-mismatch'],
    [{ code: 'ok', status: 200, contentType: 'application/json' }, 'https-content-type-mismatch'],
    [{ code: 'tls-expired' }, 'tls-expired'],
    [{ code: 'https-unavailable' }, 'https-unavailable'],
    [{ code: 'remote-secret-message' }, 'https-unavailable'],
  ])('rejects unsuitable HTTPS evidence without exposing content (%j)', async (response, code) => {
    const io = adapters();
    io.https.mockResolvedValue(response as never);
    const report = await verifyPublic(manifest, io);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check: { check: string }) => check.check === '/login')?.code).toBe(
      code,
    );
    expect(JSON.stringify(report)).not.toContain('remote-secret-message');
  });
  it('rejects oversized or secret-bearing manifest files without exposing values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flare-public-manifest-'));
    const file = join(directory, 'input.json');
    try {
      for (const content of [
        JSON.stringify({ ...manifest, credential: 'do-not-print-this' }),
        JSON.stringify(manifest) + ' '.repeat(16384),
      ]) {
        writeFileSync(file, content);
        try {
          execFileSync(
            process.execPath,
            ['scripts/staging/verify-public.mjs', '--manifest', file],
            { encoding: 'utf8' },
          );
          throw new Error('must reject');
        } catch (error) {
          const result = error as { status: number; stdout: string; stderr: string };
          expect(result.status).toBe(1);
          expect(JSON.parse(result.stdout).checks[0].code).toBe('manifest-invalid');
          expect(result.stdout).not.toContain('do-not-print-this');
          expect(result.stderr).toBe('');
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('imports without network or output and rejects malformed CLI inputs without leaking them', () => {
    const script = join(process.cwd(), 'scripts/staging/verify-public.mjs');
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(script)})`],
      { encoding: 'utf8' },
    );
    expect(output).toBe('');
    try {
      execFileSync(process.execPath, [script, '--token', 'do-not-print-this'], {
        encoding: 'utf8',
      });
      throw new Error('CLI should reject unknown arguments');
    } catch (error) {
      const result = error as { status: number; stdout: string; stderr: string };
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).checks[0].code).toBe('manifest-invalid');
      expect(result.stdout).not.toContain('do-not-print-this');
      expect(result.stderr).toBe('');
    }
  });
});

describe('external dashboard manifest', () => {
  const split = { ...manifest, version: 2, dashboard: 'external' };
  const v4 = '1.1.1.1';
  const v6 = '2606:4700:4700::1111';
  function externalAdapters(a = [v4], aaaa = [v6]) {
    const io = adapters();
    const normal = io.dns.getMockImplementation()!;
    io.dns.mockImplementation(async (host, kind) =>
      host === manifest.hosts.dashboard && ['A', 'AAAA'].includes(kind)
        ? kind === 'A'
          ? a
          : aaaa
        : normal(host, kind),
    );
    return io;
  }
  it('requires the explicit versioned external mode; legacy shape stays exact', () => {
    expect(validatePublicManifest(split)).toBe(true);
    for (const invalid of [
      { ...split, dashboard: 'vercel' },
      { ...split, version: 1 },
      { ...split, dashboard: { mode: 'external' } },
      { ...manifest, version: 2 },
      { ...split, url: 'https://private' },
    ])
      expect(validatePublicManifest(invalid)).toBe(false);
  });
  it('allows ordinary global IPv6 but rejects local, embedded, scoped and special addresses', () => {
    for (const value of [v6, '2001:4860:4860::8888', '2620:fe::9'])
      expect(publicIPv6(value)).toBe(true);
    for (const value of [
      '::',
      '::1',
      '::ffff:8.8.8.8',
      'fc00::1',
      'fd00::1',
      'fe80::1',
      'fe80::1%lo0',
      'ff02::1',
      '64:ff9b::808:808',
      '100::1',
      '2001::1',
      '2001:2::1',
      '2001:10::1',
      '2001:20::1',
      '2001:db8::1',
      '2002:808:808::1',
      '3ffe::1',
      '3fff::1',
      '3fff:0fff::1',
      '[2606:4700:4700::1111]',
      '8.8.8.8',
      '',
    ])
      expect(publicIPv6(value)).toBe(false);
  });
  it('pins and checks every resolved dashboard address while retaining backend IPv4/PTR', async () => {
    const io = externalAdapters();
    const report = await verifyPublic(split, io);
    expect(report.ok).toBe(true);
    const dashboard = io.https.mock.calls
      .map(([target]) => target)
      .filter((target) => target.hostname === manifest.hosts.dashboard);
    expect(dashboard).toHaveLength(12);
    expect(new Set(dashboard.map((target) => (target as { address?: string }).address))).toEqual(
      new Set([v4, v6]),
    );
    expect(io.dns).toHaveBeenCalledWith(manifest.ipv4, 'PTR');
    const backend = io.https.mock.calls
      .map(([target]) => target)
      .filter((target) => target.hostname !== manifest.hosts.dashboard);
    expect(backend.every((target) => (target as { ipv4?: string }).ipv4 === manifest.ipv4)).toBe(
      true,
    );
    expect(JSON.stringify(report)).not.toContain(v6);
    expect(JSON.stringify(report)).not.toContain(v4);
  });
  it('supports an IPv6-only external dashboard and does not silently skip IPv6 probes', async () => {
    const io = externalAdapters([], [v6]);
    expect((await verifyPublic(split, io)).ok).toBe(true);
    const normal = io.https.getMockImplementation()!;
    io.https.mockImplementation(async (target) =>
      target.hostname === manifest.hosts.dashboard
        ? { code: 'https-unavailable', status: undefined, contentType: undefined }
        : normal(target),
    );
    expect((await verifyPublic(split, io)).ok).toBe(false);
  });
  it.each([
    [[], [], 'dns-address-missing'],
    [[v4, '127.0.0.1'], [], 'dns-non-public-address'],
    [[v4], ['::1'], 'dns-non-public-address'],
    [[v4], ['::ffff:127.0.0.1'], 'dns-non-public-address'],
    [[v4], ['2001:db8::1'], 'dns-non-public-address'],
    [Array.from({ length: 9 }, (_, i) => `8.8.8.${i + 1}`), [], 'dns-address-limit'],
  ])('never starts HTTPS after unsafe or missing external DNS (%j, %j)', async (a, aaaa, code) => {
    const io = externalAdapters(a as string[], aaaa as string[]);
    const report = await verifyPublic(split, io);
    expect(report.ok).toBe(false);
    expect(report.checks.some((check: { code: string }) => check.code === code)).toBe(true);
    expect(io.https).not.toHaveBeenCalled();
  });
  it('still refuses unexpected backend IPv6 and changed backend A addresses', async () => {
    for (const kind of ['A', 'AAAA']) {
      const io = externalAdapters();
      const normal = io.dns.getMockImplementation()!;
      io.dns.mockImplementation(async (host, type) =>
        host === manifest.hosts.api && type === kind
          ? [type === 'A' ? v4 : v6]
          : normal(host, type),
      );
      expect((await verifyPublic(split, io)).ok).toBe(false);
      expect(io.https).not.toHaveBeenCalled();
    }
  });
});

describe('certificate evidence', () => {
  const now = Date.UTC(2026, 0, 1);
  const cert = {
    authorized: true,
    valid_from: new Date(now - 86400000).toUTCString(),
    valid_to: new Date(now + 30 * 86400000).toUTCString(),
    subjectaltname: `DNS:${manifest.hosts.dashboard}`,
  };
  it.each([
    [{}, 'ok'],
    [{ authorized: false }, 'tls-untrusted'],
    [{ subjectaltname: 'DNS:other.pareto.dev' }, 'tls-hostname-mismatch'],
    [{ valid_to: new Date(now).toUTCString() }, 'tls-expired'],
    [{ valid_from: new Date(now + 86400000).toUTCString() }, 'tls-not-yet-valid'],
    [{ valid_to: new Date(now + 6 * 86400000).toUTCString() }, 'tls-expiring'],
    [{ valid_to: 'bad' }, 'tls-certificate-invalid'],
  ])('checks trust, hostname and certificate validity (%j)', (change, code) => {
    expect(certificateCode({ ...cert, ...change }, manifest.hosts.dashboard, now)).toBe(code);
  });
});

describe('actual HTTPS request path using an isolated local TLS fixture', () => {
  let directory: string;
  let certificate: Buffer;
  let server: Server;
  let port: number;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'flare-public-tls-'));
    writeFileSync(
      join(directory, 'openssl.cnf'),
      `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=${manifest.hosts.dashboard}\n[ext]\nsubjectAltName=DNS:${manifest.hosts.dashboard}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
    );
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '30',
        '-config',
        join(directory, 'openssl.cnf'),
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    certificate = readFileSync(join(directory, 'cert.pem'));
    server = createServer(
      { cert: certificate, key: readFileSync(join(directory, 'key.pem')) },
      (req, res) => {
        if (req.url === '/hang') return;
        if (req.url === '/headers') {
          res.setHeader('x-large', 'x'.repeat(16385));
          res.end();
          return;
        }
        if (req.url === '/disconnect') {
          req.socket.destroy();
          return;
        }
        if (req.url === '/redirect') {
          res.writeHead(302, { location: 'https://secret:credential@other.pareto.dev' });
          res.end();
          return;
        }
        res.setHeader('content-type', 'text/html');
        if (req.url === '/oversized') res.end('x'.repeat(65537));
        else res.end('<!doctype html><title>Fixture</title>');
      },
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });
  function connector(trust = true) {
    return (options: RequestOptions, callback: Parameters<typeof request>[1]) => {
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.agent).toBe(false);
      expect(options.method).toBe('GET');
      expect(options.servername).toBe(options.hostname);
      expect(options.headers).not.toHaveProperty('Authorization');
      return request({ ...options, port, ...(trust ? { ca: certificate } : {}) }, callback);
    };
  }
  it('uses the pinned address, SNI and validated certificate; no alternate DNS lookup', async () => {
    expect(
      await requestPublicHttps(
        { hostname: manifest.hosts.dashboard, ipv4: '127.0.0.1', path: '/login' },
        { requestImpl: connector() },
      ),
    ).toEqual({ code: 'ok', status: 200, contentType: 'text/html' });
    expect(validatePublicManifest({ ...manifest, ipv4: '127.0.0.1' })).toBe(false);
  });
  it('uses an actual pinned IPv6 connection with exact hostname TLS checks', async () => {
    const ipv6 = createServer(
      { cert: certificate, key: readFileSync(join(directory, 'key.pem')) },
      (_req, res) => {
        res.setHeader('content-type', 'text/html');
        res.end('IPv6 fixture');
      },
    );
    await new Promise<void>((resolve, reject) => {
      ipv6.once('error', reject);
      ipv6.listen(0, '::1', resolve);
    });
    try {
      const result = await requestPublicHttps(
        { hostname: manifest.hosts.dashboard, address: '::1', path: '/login' },
        {
          requestImpl: (options: RequestOptions, callback: Parameters<typeof request>[1]) => {
            expect(options.family).toBe(6);
            expect(options.rejectUnauthorized).toBe(true);
            expect(options.servername).toBe(manifest.hosts.dashboard);
            return request(
              { ...options, ca: certificate, port: (ipv6.address() as { port: number }).port },
              callback,
            );
          },
        },
      );
      expect(result).toEqual({ code: 'ok', status: 200, contentType: 'text/html' });
      expect(publicIPv6('::1')).toBe(false);
    } finally {
      ipv6.closeAllConnections();
      await new Promise<void>((resolve) => ipv6.close(() => resolve()));
    }
  });
  it('rejects an untrusted CA and mismatched certificate hostname', async () => {
    expect(
      await requestPublicHttps(
        { hostname: manifest.hosts.dashboard, ipv4: '127.0.0.1', path: '/login' },
        { requestImpl: connector(false) },
      ),
    ).toEqual({ code: 'tls-untrusted' });
    expect(
      await requestPublicHttps(
        { hostname: manifest.hosts.api, ipv4: '127.0.0.1', path: '/login' },
        { requestImpl: connector() },
      ),
    ).toEqual({ code: 'tls-hostname-mismatch' });
  });
  it('rejects peer-address changes even when a connector resolves elsewhere', async () => {
    const connect = connector();
    const result = await requestPublicHttps(
      { hostname: manifest.hosts.dashboard, ipv4: manifest.ipv4, path: '/login' },
      {
        requestImpl: (options: RequestOptions, callback: Parameters<typeof request>[1]) =>
          connect(
            { ...options, lookup: (_host, _options, cb) => cb(null, '127.0.0.1', 4) },
            callback,
          ),
      },
    );
    expect(result).toEqual({ code: 'https-address-mismatch' });
  });
  it.each([
    ['/headers', 'https-unavailable'],
    ['/disconnect', 'https-unavailable'],
    ['/redirect', 'https-redirect'],
    ['/oversized', 'https-body-limit'],
    ['/hang', 'https-timeout'],
  ])('bounds and rejects %s responses', async (path, code) => {
    const response = await requestPublicHttps(
      { hostname: manifest.hosts.dashboard, ipv4: '127.0.0.1', path },
      { requestImpl: connector(), timeoutMs: 100 },
    );
    expect(response).toEqual({ code });
    expect(JSON.stringify(response)).not.toContain('credential');
  });
});
