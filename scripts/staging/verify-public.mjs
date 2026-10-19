// Explicit, read-only public ingress checks. Importing this module performs no I/O.
import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { Resolver } from 'node:dns/promises';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { setTimeout, clearTimeout } from 'node:timers';
import { publicHostname } from './preflight.mjs';

const SERVICES = ['dashboard', 'api', 'ws', 'tracking', 'mail'];
const TIMEOUT_MS = 5000;
const BODY_LIMIT = 65536;
const CERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EXTERNAL_ADDRESSES = 8;
export const UNVERIFIED = Object.freeze([
  'http-to-https-redirects',
  'port-25-ingress-and-egress',
  'spf-dkim-dmarc-and-receiver-evidence',
  'physical-postal-pool-isolation',
  'signed-delivery-and-inbound-callbacks',
  'password-mfa-and-inbox-session',
  'off-host-backup-restore-and-alerts',
  'host-reboot-recovery',
]);

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function publicIPv4(value) {
  if (typeof value !== 'string' || isIP(value) !== 4) return false;
  const [a, b, c] = value.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function publicIPv6(value) {
  if (typeof value !== 'string' || isIP(value) !== 6 || value.includes('%')) return false;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [first, second] = normalized.split(':').map((part) => parseInt(part || '0', 16));
  // Conservatively permit ordinary global unicast, excluding special-purpose,
  // transition, former 6bone and documentation allocations. Never treat an
  // embedded IPv4, local, multicast or scoped address as public ingress.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) &&
    first !== 0x2002 &&
    first !== 0x3ffe &&
    !(first === 0x3fff && second <= 0x0fff)
  );
}

export function validatePublicManifest(manifest) {
  return Boolean(
    ((exactKeys(manifest, ['version', 'ipv4', 'hosts']) && manifest.version === 1) ||
      (exactKeys(manifest, ['version', 'ipv4', 'hosts', 'dashboard']) &&
        manifest.version === 2 &&
        manifest.dashboard === 'external')) &&
    publicIPv4(manifest.ipv4) &&
    exactKeys(manifest.hosts, SERVICES) &&
    SERVICES.every((service) => publicHostname(manifest.hosts[service])) &&
    new Set(SERVICES.map((service) => manifest.hosts[service].toLowerCase())).size ===
      SERVICES.length,
  );
}

function deadline(work, milliseconds = TIMEOUT_MS, cancel = () => {}) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      cancel();
      reject(new Error('timeout'));
    }, milliseconds);
    Promise.resolve()
      .then(work)
      .then(resolvePromise, reject)
      .finally(() => clearTimeout(timer));
  });
}

export function certificateCode(certificate, hostname, now = Date.now()) {
  if (!certificate || certificate.authorized !== true) return 'tls-untrusted';
  const from = Date.parse(certificate.valid_from);
  const until = Date.parse(certificate.valid_to);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from)
    return 'tls-certificate-invalid';
  if (from > now) return 'tls-not-yet-valid';
  if (until <= now) return 'tls-expired';
  if (until - now < CERT_WINDOW_MS) return 'tls-expiring';
  try {
    if (checkServerIdentity(hostname, certificate)) return 'tls-hostname-mismatch';
  } catch {
    return 'tls-certificate-invalid';
  }
  return 'ok';
}

function tlsErrorCode(error) {
  if (error?.code === 'ERR_TLS_CERT_ALTNAME_INVALID') return 'tls-hostname-mismatch';
  if (error?.code === 'CERT_HAS_EXPIRED') return 'tls-expired';
  if (error?.code === 'CERT_NOT_YET_VALID') return 'tls-not-yet-valid';
  if (
    [
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'CERT_REVOKED',
    ].includes(error?.code)
  )
    return 'tls-untrusted';
  return 'https-unavailable';
}

// requestImpl is an injection seam for local TLS fixtures, never a CLI option.
// Production uses Node's normal trust store and pins the connection without a second DNS lookup.
export function requestPublicHttps(target, { requestImpl = request, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise) => {
    const address = target.address ?? target.ipv4;
    const family = isIP(address);
    const canonical = (value) =>
      isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
    let done = false;
    let req;
    let res;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      res?.destroy();
      req?.destroy();
      resolvePromise(result);
    };
    const timer = setTimeout(() => finish({ code: 'https-timeout' }), timeoutMs);
    try {
      req = requestImpl(
        {
          hostname: target.hostname,
          port: 443,
          path: target.path,
          method: 'GET',
          servername: target.hostname,
          family,
          agent: false,
          rejectUnauthorized: true,
          maxHeaderSize: 16384,
          lookup: (_hostname, options, callback) => {
            callback(null, options.all ? [{ address, family }] : address, family);
          },
          headers: { Accept: '*/*', 'User-Agent': 'Flare-staging-public-check/1' },
        },
        (response) => {
          res = response;
          const socket = response.socket;
          const peer =
            family === 4 ? socket.remoteAddress?.replace(/^::ffff:/, '') : socket.remoteAddress;
          if (canonical(peer) !== canonical(address))
            return finish({ code: 'https-address-mismatch' });
          const certificate = { ...socket.getPeerCertificate(), authorized: socket.authorized };
          const code = certificateCode(certificate, target.hostname);
          if (code !== 'ok') return finish({ code });
          if (response.statusCode >= 300 && response.statusCode <= 399)
            return finish({ code: 'https-redirect' });
          let bytes = 0;
          response.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > BODY_LIMIT) finish({ code: 'https-body-limit' });
          });
          response.on('end', () =>
            finish({
              code: 'ok',
              status: response.statusCode,
              contentType: response.headers['content-type'],
            }),
          );
          response.on('error', () => finish({ code: 'https-unavailable' }));
          response.on('aborted', () => finish({ code: 'https-unavailable' }));
        },
      );
      req.on('error', (error) => finish({ code: tlsErrorCode(error) }));
      req.end();
    } catch {
      finish({ code: 'https-unavailable' });
    }
  });
}

export function networkAdapters() {
  return {
    async dns(hostname, kind) {
      const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
      try {
        return await deadline(
          () => (kind === 'PTR' ? resolver.reverse(hostname) : resolver.resolve(hostname, kind)),
          TIMEOUT_MS,
          () => resolver.cancel(),
        );
      } catch (error) {
        if (['ENODATA', 'ENOTFOUND'].includes(error?.code)) return [];
        throw new Error('dns-unavailable');
      }
    },
    https: requestPublicHttps,
  };
}

export const PUBLIC_PROBES = Object.freeze([
  { service: 'dashboard', path: '/login', status: 200, contentType: 'text/html' },
  { service: 'api', path: '/v1/domains', status: 401, contentType: 'application/json' },
  { service: 'tracking', path: '/v1/domains', status: 401, contentType: 'application/json' },
  { service: 'ws', path: '/', status: 404 },
  ...['dashboard', 'api', 'tracking', 'ws'].flatMap((service) =>
    ['/health', '/ready', '/internal/metrics', '/v1/internal', '/api/internal'].map((path) => ({
      service,
      path,
      status: 404,
    })),
  ),
]);

const HTTPS_CODES = new Set([
  'ok',
  'https-timeout',
  'https-unavailable',
  'https-address-mismatch',
  'https-redirect',
  'https-body-limit',
  'tls-untrusted',
  'tls-hostname-mismatch',
  'tls-expired',
  'tls-not-yet-valid',
  'tls-expiring',
  'tls-certificate-invalid',
]);

export async function verifyPublic(manifest, adapters = networkAdapters()) {
  const report = {
    version: 1,
    scope: 'public-ingress-only',
    ok: false,
    checks: [],
    unverified: [...UNVERIFIED],
  };
  const add = (service, check, code) => report.checks.push({ service, check, code });
  if (!validatePublicManifest(manifest)) {
    add('manifest', 'shape', 'manifest-invalid');
    return report;
  }
  const hosts = Object.fromEntries(
    SERVICES.map((service) => [service, manifest.hosts[service].toLowerCase()]),
  );
  const externalDashboard = manifest.version === 2;
  const dashboardAddresses = [];
  for (const service of SERVICES) {
    for (const kind of ['A', 'AAAA']) {
      try {
        const addresses = await deadline(() => adapters.dns(hosts[service], kind));
        let code = 'ok';
        if (!Array.isArray(addresses)) code = 'dns-invalid-answer';
        else if (service === 'dashboard' && externalDashboard) {
          const valid = kind === 'A' ? publicIPv4 : publicIPv6;
          if (addresses.some((address) => !valid(address))) code = 'dns-non-public-address';
          else if (addresses.length + dashboardAddresses.length > MAX_EXTERNAL_ADDRESSES)
            code = 'dns-address-limit';
          else dashboardAddresses.push(...addresses);
        } else if (kind === 'AAAA') {
          if (addresses.length) code = 'dns-unplanned-ipv6';
        } else if (addresses.some((address) => !publicIPv4(address)))
          code = 'dns-non-public-address';
        else if (!addresses.length || addresses.some((address) => address !== manifest.ipv4))
          code = 'dns-address-mismatch';
        add(service, `dns-${kind.toLowerCase()}`, code);
      } catch {
        add(service, `dns-${kind.toLowerCase()}`, 'dns-unavailable');
      }
    }
  }
  if (externalDashboard && !dashboardAddresses.length)
    add('dashboard', 'dns-addresses', 'dns-address-missing');
  for (const [service, kind, hostname, expected] of [
    ['tracking', 'CNAME', hosts.tracking, hosts.api],
    ['mail', 'PTR', manifest.ipv4, hosts.mail],
  ]) {
    try {
      const names = await deadline(() => adapters.dns(hostname, kind));
      const valid =
        Array.isArray(names) &&
        names.length === 1 &&
        typeof names[0] === 'string' &&
        names[0].toLowerCase().replace(/\.$/, '') === expected;
      add(
        service,
        `dns-${kind.toLowerCase()}`,
        valid ? 'ok' : `dns-${kind.toLowerCase()}-mismatch`,
      );
    } catch {
      add(service, `dns-${kind.toLowerCase()}`, 'dns-unavailable');
    }
  }
  if (report.checks.some((check) => check.code !== 'ok')) {
    add('ingress', 'https', 'https-not-attempted');
    return report;
  }
  for (const probe of PUBLIC_PROBES) {
    const targets =
      probe.service === 'dashboard' && externalDashboard
        ? [...new Set(dashboardAddresses)].map((address) => ({ address }))
        : [{ ipv4: manifest.ipv4 }];
    for (const [index, target] of targets.entries()) {
      let code;
      try {
        const result = await deadline(
          () =>
            adapters.https({
              hostname: hosts[probe.service],
              ...target,
              path: probe.path,
            }),
          TIMEOUT_MS + 100,
        );
        code = HTTPS_CODES.has(result?.code) ? result.code : 'https-unavailable';
        if (code === 'ok') {
          if (result.status >= 300 && result.status <= 399) code = 'https-redirect';
          else if (result.status !== probe.status) code = 'https-status-mismatch';
          else if (
            probe.contentType &&
            (typeof result.contentType !== 'string' ||
              result.contentType.split(';')[0].trim().toLowerCase() !== probe.contentType)
          )
            code = 'https-content-type-mismatch';
        }
      } catch {
        code = 'https-unavailable';
      }
      add(
        probe.service,
        externalDashboard && probe.service === 'dashboard'
          ? `${probe.path}:address-${index + 1}`
          : probe.path,
        code,
      );
    }
  }
  report.ok = report.checks.every((check) => check.code === 'ok');
  return report;
}

export async function main(args = process.argv.slice(2)) {
  let manifest;
  try {
    if (args.length !== 2 || args[0] !== '--manifest') throw new Error();
    const file = resolve(args[1]);
    const descriptor = openSync(file, 'r');
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile() || stat.size > 16384) throw new Error();
      // Also bound the read if the file grows after fstat. No deployment secrets are loaded.
      const bytes = Buffer.alloc(16385);
      let length = 0;
      for (;;) {
        const count = readSync(descriptor, bytes, length, bytes.length - length, length);
        length += count;
        if (length > 16384) throw new Error();
        if (!count) break;
      }
      manifest = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    } finally {
      closeSync(descriptor);
    }
  } catch {
    manifest = null;
  }
  const report = await verifyPublic(manifest);
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
