import { Resolver } from 'node:dns/promises';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { encrypt } from '@flare/shared';
import { resolveDmarc } from './dmarc.js';
import { parseNamedTransports } from './routes.js';
export const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const domainSchema = z
  .object({
    name: domainName,
    region: z.string().min(1).max(64).default('us-east-1'),
    sending: z.boolean().default(true),
    receiving: z.boolean().default(false),
    open_tracking: z.boolean().default(false),
    click_tracking: z.boolean().default(false),
    tracking_subdomain: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
      .default('track'),
    enforce_tls: z.boolean().default(false),
  })
  .strict();
export type DomainSettings = z.infer<typeof domainSchema>;
export interface DnsRecord {
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;
  value: string;
  purpose: 'dkim' | 'spf' | 'return_path' | 'receiving' | 'tracking' | 'dmarc';
  required: boolean;
  status: 'pending' | 'verified' | 'failed' | 'temporary_failure';
}
export function generateDomain(name: string, aad: string, key: string) {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    selector: `flare${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    publicKey: pair.publicKey.replace(/-----[^-]+-----|\s/g, ''),
    cipher: encrypt(pair.privateKey, key, aad),
    name,
  };
}
export function domainRecords(
  domain: DomainSettings & { dkim_selector: string; dkim_public: string },
): DnsRecord[] {
  const record = (
    type: DnsRecord['type'],
    name: string,
    value: string,
    purpose: DnsRecord['purpose'],
    required = true,
  ): DnsRecord => ({ type, name, value, purpose, required, status: 'pending' });
  const host = process.env.POSTAL_HOSTNAME ?? 'postal.localhost';
  const postal = process.env.MAIL_TRANSPORTS
    ? parseNamedTransports(process.env.MAIL_TRANSPORTS).some(
        (transport) => transport.kind === 'postal',
      )
    : (process.env.TRANSPORT_PRIORITY || process.env.TRANSPORT || 'postal')
        .split(',')
        .map((v) => v.trim())
        .includes('postal');
  const returnPrefix = z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
    .parse(process.env.POSTAL_RETURN_PATH_PREFIX ?? 'psrp');
  const result = [
    record(
      'TXT',
      `${domain.dkim_selector}._domainkey.${domain.name}`,
      `v=DKIM1; k=rsa; p=${domain.dkim_public}`,
      'dkim',
      true,
    ),
    record('TXT', `_dmarc.${domain.name}`, 'v=DMARC1; p=none', 'dmarc', false),
  ];
  // Ownership is the generated DKIM record. Provider DNS instructions are separate readiness evidence.
  if (postal)
    result.push(
      record(
        'TXT',
        domain.name,
        `v=spf1 include:${process.env.POSTAL_SPF_HOST ?? host} ~all`,
        'spf',
        false,
      ),
      record(
        'CNAME',
        `${returnPrefix}.${domain.name}`,
        process.env.POSTAL_RETURN_PATH ?? host,
        'return_path',
        false,
      ),
    );
  if (domain.receiving) result.push(record('MX', domain.name, host, 'receiving', false));
  if (domain.open_tracking || domain.click_tracking)
    result.push(
      record(
        'CNAME',
        `${domain.tracking_subdomain}.${domain.name}`,
        new URL(process.env.TRACKING_URL ?? 'http://localhost:4000').hostname,
        'tracking',
        false,
      ),
    );
  return result;
}
export interface DnsResolver {
  resolveTxt(host: string): Promise<string[][]>;
  resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>;
  resolveCname(host: string): Promise<string[]>;
}
export const domainResolver = new Resolver({ timeout: 5000, tries: 2 });
// Operator-controlled resolvers support private authoritative DNS; never accept these from a request.
if (process.env.DOMAIN_DNS_SERVERS)
  domainResolver.setServers(
    process.env.DOMAIN_DNS_SERVERS.split(',').map((server) => server.trim()),
  );
const normalizeHost = (s: string) => s.toLowerCase().replace(/\.$/, '');
const txtTags = (value: string) =>
  Object.fromEntries(
    value
      .split(';')
      .map((v) => v.trim().split(/=(.*)/s).slice(0, 2))
      .filter((v) => v.length === 2)
      .map(([k, v]) => [k!.toLowerCase(), v!.trim()]),
  );
export async function verifyRecords(records: DnsRecord[], dns: DnsResolver = domainResolver) {
  return Promise.all(
    records.map(async (record) => {
      try {
        let valid = false;
        if (record.purpose === 'dmarc') {
          const dmarc = await resolveDmarc(record.name.replace(/^_dmarc\./, ''), dns);
          return {
            ...record,
            status:
              dmarc.status === 'verified'
                ? ('verified' as const)
                : dmarc.status === 'temporary_failure'
                  ? ('temporary_failure' as const)
                  : ('failed' as const),
          };
        }
        if (record.type === 'MX')
          valid = (await dns.resolveMx(record.name)).some(
            (r) => normalizeHost(r.exchange) === normalizeHost(record.value),
          );
        else if (record.type === 'CNAME')
          valid = (await dns.resolveCname(record.name)).some(
            (v) => normalizeHost(v) === normalizeHost(record.value),
          );
        else {
          const values = (await dns.resolveTxt(record.name)).map((chunks) => chunks.join(''));
          if (record.purpose === 'spf') {
            const spf = values.filter((v) => /^v=spf1(?:\s|$)/i.test(v));
            valid = spf.length === 1 && spf[0]!.split(/\s+/).includes(record.value.split(' ')[1]!);
          } else if (record.purpose === 'dkim')
            valid = values.some((v) => {
              const tags = txtTags(v);
              return (
                tags.p === txtTags(record.value).p &&
                (!tags.v || tags.v === 'DKIM1') &&
                (!tags.k || tags.k === 'rsa')
              );
            });
          else valid = values.some((v) => txtTags(v).v === 'DMARC1');
        }
        return { ...record, status: valid ? ('verified' as const) : ('failed' as const) };
      } catch (error) {
        const code = (error as { code?: string }).code;
        return {
          ...record,
          status: ['ENODATA', 'ENOTFOUND'].includes(code ?? '')
            ? ('failed' as const)
            : ('temporary_failure' as const),
        };
      }
    }),
  );
}
export function verificationStatus(records: DnsRecord[]) {
  const required = records.filter((v) => v.purpose === 'dkim');
  if (!required.length) return 'failed';
  return required.some((v) => v.status === 'temporary_failure')
    ? 'temporary_failure'
    : required.every((v) => v.status === 'verified')
      ? 'verified'
      : 'failed';
}
export function verificationDelay(attempt: number, verified: boolean) {
  return verified ? 3600 : Math.min(86400, 30 * 2 ** Math.min(attempt, 12));
}
