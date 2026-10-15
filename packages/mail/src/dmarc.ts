import { getDomain } from 'tldts';
import { z } from 'zod';

export const evidenceMaxAgeMs = 24 * 60 * 60 * 1000;
export const dmarcEvidenceSchema = z
  .object({
    status: z.enum(['verified', 'missing', 'invalid', 'temporary_failure']),
    record_domain: z.string(),
    checked_at: z.string().datetime(),
    policy: z.enum(['none', 'quarantine', 'reject']).optional(),
    adkim: z.enum(['r', 's']).optional(),
    aspf: z.enum(['r', 's']).optional(),
    inherited: z.boolean(),
    error: z.enum(['missing', 'multiple_records', 'malformed', 'dns_unavailable']).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === 'verified' && (!value.policy || !value.adkim || !value.aspf))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Verified DMARC evidence requires policy and alignment modes',
      });
  });
export type DmarcEvidence = z.infer<typeof dmarcEvidenceSchema>;
export type TxtResolver = { resolveTxt(name: string): Promise<string[][]> };
const policies = new Set(['none', 'quarantine', 'reject']);
export function normalizeDomain(value: string) {
  return value.toLowerCase().replace(/\.$/, '');
}
export function organizationalDomain(value: string) {
  return getDomain(normalizeDomain(value), { allowPrivateDomains: true });
}
export function domainsAlign(author: string, authenticated: string, mode: 'r' | 's') {
  const left = normalizeDomain(author),
    right = normalizeDomain(authenticated);
  if (left === right) return true;
  if (mode === 's') return false;
  const domain = organizationalDomain(left);
  return domain !== null && domain === organizationalDomain(right);
}
/** Strict onboarding validation; never repair or silently ignore malformed policy tags. */
export function parseDmarc(value: string) {
  if (value.length > 8192 || /[\r\n\0]/.test(value)) return null;
  const parts = value
    .trim()
    .replace(/;\s*$/, '')
    .split(';')
    .map((part) => part.trim());
  const tags: Record<string, string> = {};
  for (const part of parts) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(part);
    if (!match || !match[1] || !match[2]) return null;
    const name = match[1].toLowerCase();
    if (Object.hasOwn(tags, name)) return null;
    tags[name] = match[2].trim();
  }
  if (
    !/^v\s*=\s*DMARC1$/.test(parts[0] ?? '') ||
    tags.v !== 'DMARC1' ||
    !policies.has(tags.p ?? '')
  )
    return null;
  if (tags.sp !== undefined && !policies.has(tags.sp)) return null;
  if (
    [tags.adkim, tags.aspf].some((value) => value !== undefined && value !== 'r' && value !== 's')
  )
    return null;
  if (tags.pct !== undefined && (!/^\d{1,3}$/.test(tags.pct) || Number(tags.pct) > 100))
    return null;
  if (tags.ri !== undefined && !/^\d{1,10}$/.test(tags.ri)) return null;
  if (tags.fo !== undefined && !/^(?:0|1|d|s)(?::(?:0|1|d|s))*$/.test(tags.fo)) return null;
  // Reporting is optional. We validate mailto destinations but never fetch them.
  for (const field of ['rua', 'ruf']) {
    if (
      tags[field] !== undefined &&
      !tags[field]!.split(',').every((uri) =>
        /^mailto:[^\s@,;]+@[^\s@,;!]+(?:!\d+[kmgt]?)?$/i.test(uri.trim()),
      )
    )
      return null;
  }
  return {
    policy: tags.p as 'none' | 'quarantine' | 'reject',
    subdomain_policy: tags.sp as 'none' | 'quarantine' | 'reject' | undefined,
    adkim: (tags.adkim ?? 'r') as 'r' | 's',
    aspf: (tags.aspf ?? 'r') as 'r' | 's',
  };
}
/** RFC 7489 discovery: exact author domain, then its PSL organizational domain only. */
export async function resolveDmarc(
  name: string,
  dns: TxtResolver,
  now = Date.now(),
): Promise<DmarcEvidence> {
  const domain = normalizeDomain(name),
    organization = organizationalDomain(domain);
  const candidates = organization && organization !== domain ? [domain, organization] : [domain];
  for (const [index, candidate] of candidates.entries()) {
    const base = {
      record_domain: candidate,
      checked_at: new Date(now).toISOString(),
      inherited: index > 0,
    };
    let values: string[];
    try {
      values = (await dns.resolveTxt(`_dmarc.${candidate}`)).map((chunks) => chunks.join(''));
    } catch (error) {
      if (!['ENODATA', 'ENOTFOUND'].includes((error as { code?: string }).code ?? ''))
        return { ...base, status: 'temporary_failure', error: 'dns_unavailable' };
      values = [];
    }
    // Detect misplaced/invalid-version DMARC tags as invalid instead of falling back.
    const records = values.filter((value) => /(?:^|;)\s*v\s*=\s*DMARC/i.test(value));
    if (!records.length) continue;
    if (records.length !== 1) return { ...base, status: 'invalid', error: 'multiple_records' };
    const policy = parseDmarc(records[0]!);
    if (!policy) return { ...base, status: 'invalid', error: 'malformed' };
    return {
      ...base,
      status: 'verified',
      policy: index > 0 ? (policy.subdomain_policy ?? policy.policy) : policy.policy,
      adkim: policy.adkim,
      aspf: policy.aspf,
    };
  }
  return {
    status: 'missing',
    record_domain: domain,
    checked_at: new Date(now).toISOString(),
    inherited: false,
    error: 'missing',
  };
}
export function evidenceFresh(checkedAt: unknown, now = Date.now()) {
  const checked =
    checkedAt instanceof Date
      ? checkedAt.getTime()
      : typeof checkedAt === 'string'
        ? Date.parse(checkedAt)
        : NaN;
  return Number.isFinite(checked) && checked <= now && now - checked < evidenceMaxAgeMs;
}
