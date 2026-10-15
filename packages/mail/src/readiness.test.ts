import { afterEach, describe, expect, it, vi } from 'vitest';
import { domainRecords, domainSchema, verificationDelay, verifyRecords } from './domains.js';
import { domainsAlign, evidenceFresh, parseDmarc, resolveDmarc } from './dmarc.js';
import { checkSesIdentity, evaluateSendingReadiness, sesMailFromRecords } from './readiness.js';

const now = Date.parse('2026-10-15T12:00:00Z'),
  checked_at = new Date(now - 1000).toISOString();
const dns = (values: Record<string, string[][]>) => ({
  resolveTxt: vi.fn(async (name: string) => values[name] ?? []),
  resolveMx: async () => [],
  resolveCname: async () => [],
});
afterEach(() => vi.unstubAllEnvs());
describe('DMARC discovery and alignment', () => {
  it.each([
    'v=DMARC1',
    'v=DMARC1; p=bogus',
    'v=DMARC1; p=none; p=reject',
    'v=DMARC1; p=none; adkim=x',
    'v=DMARC1; p=none; pct=101',
    'v=DMARC1; p=none; sp=x',
    'v=DMARC1; p=none; rua=javascript:alert(1)',
    'v=DMARC1; p=none;; aspf=r',
    'p=none; v=DMARC1',
  ])('rejects malformed policy %s', (value) => expect(parseDmarc(value)).toBeNull());
  it('accepts all valid policy modes, strict/relaxed alignment, and bounded reporting options', () => {
    for (const p of ['none', 'quarantine', 'reject'])
      expect(
        parseDmarc(
          `v=DMARC1; p=${p}; adkim=s; aspf=r; pct=50; rua=mailto:reports@example.com!10m;`,
        ),
      ).toMatchObject({ policy: p, adkim: 's', aspf: 'r' });
  });
  it('joins split TXT chunks and falls back only to the PSL organizational domain', async () => {
    const resolver = dns({
      '_dmarc.example.co.uk': [['v=DMARC1; p=none; ', 'sp=reject; adkim=s']],
    });
    const evidence = await resolveDmarc('a.b.example.co.uk', resolver, now);
    expect(evidence).toMatchObject({
      status: 'verified',
      record_domain: 'example.co.uk',
      policy: 'reject',
      adkim: 's',
      aspf: 'r',
      inherited: true,
    });
    expect(resolver.resolveTxt.mock.calls.map(([name]) => name)).toEqual([
      '_dmarc.a.b.example.co.uk',
      '_dmarc.example.co.uk',
    ]);
    expect(domainsAlign('a.example.co.uk', 'mail.example.co.uk', 'r')).toBe(true);
    expect(domainsAlign('a.example.co.uk', 'mail.example.co.uk', 's')).toBe(false);
    expect(domainsAlign('tenant-a.github.io', 'tenant-b.github.io', 'r')).toBe(false);
    expect(domainsAlign('EXAMPLE.COM.', 'example.com', 's')).toBe(true);
  });
  it('does not hide duplicate or malformed exact policy behind valid parent policy', async () => {
    for (const records of [[['v=DMARC1; p=none'], ['v=DMARC1; p=reject']], [['v=DMARC1; p=bad']]]) {
      const resolver = dns({
        '_dmarc.mail.example.com': records,
        '_dmarc.example.com': [['v=DMARC1; p=reject']],
      });
      expect((await resolveDmarc('mail.example.com', resolver, now)).status).toBe('invalid');
      expect(resolver.resolveTxt).toHaveBeenCalledTimes(1);
    }
  });
  it('keeps missing evidence distinct from temporary resolver failure and fails closed on timeouts', async () => {
    expect((await resolveDmarc('example.com', dns({}), now)).status).toBe('missing');
    const resolver = {
      resolveTxt: vi.fn(async () => {
        throw Object.assign(new Error('private resolver details'), { code: 'ETIMEOUT' });
      }),
    };
    expect(await resolveDmarc('mail.example.com', resolver, now)).toMatchObject({
      status: 'temporary_failure',
      error: 'dns_unavailable',
    });
    expect(resolver.resolveTxt).toHaveBeenCalledTimes(1);
  });
  it('does not count advisory DMARC as ownership, but validates its parsed status', async () => {
    const record = {
      type: 'TXT' as const,
      name: '_dmarc.example.com',
      value: 'v=DMARC1; p=none',
      purpose: 'dmarc' as const,
      required: false,
      status: 'pending' as const,
    };
    expect(
      (await verifyRecords([record], dns({ '_dmarc.example.com': [['v=DMARC1']] })))[0],
    ).toMatchObject({ required: false, status: 'failed' });
  });
});
const domain = () => ({
  name: 'example.com',
  status: 'verified',
  sending: true,
  checked_at,
  records: [
    { purpose: 'dkim', status: 'verified' },
    { purpose: 'spf', name: 'example.com', status: 'verified' },
    {
      purpose: 'return_path',
      type: 'CNAME',
      name: 'psrp.example.com',
      value: 'rp.postal.example.net',
      status: 'verified',
    },
  ],
  dmarc_evidence: {
    status: 'verified',
    record_domain: 'example.com',
    policy: 'none',
    adkim: 's',
    aspf: 's',
    checked_at,
    inherited: false,
  },
});
const evidence = () => ({
  kind: 'received_headers',
  provenance: 'operator_attested_receiver_headers',
  transport_instance: 'postal-route-v1',
  proof_reference: 'secure-evidence:receipt-123',
  checked_at,
  header_from_domain: 'example.com',
  dkim_domain: 'example.com',
  dkim_pass: true,
  mail_from_domain: 'psrp.example.com',
  spf_pass: true,
  dmarc_pass: true,
});
const options = () => ({
  production: true,
  provider: 'postal',
  transportInstance: 'postal-route-v1',
  evidence: evidence(),
});
describe('production sending readiness', () => {
  it('never promotes ownership DNS alone to transport readiness', () => {
    expect(evaluateSendingReadiness(domain(), { ...options(), evidence: {} }, now)).toMatchObject({
      ready: false,
      blockers: ['transport_evidence_missing'],
    });
  });
  it('requires a fresh attested provider route and accepts DMARC via exact DKIM when strict SPF is unaligned', () => {
    vi.stubEnv('POSTAL_RETURN_PATH', 'rp.postal.example.net');
    expect(evaluateSendingReadiness(domain(), options(), now)).toEqual({
      ready: true,
      blockers: [],
      dkim_aligned: true,
      spf_aligned: false,
    });
  });
  it('blocks stale/future DNS evidence, drift, revoked and changed transports', () => {
    vi.stubEnv('POSTAL_RETURN_PATH', 'rp.postal.example.net');
    const input = domain();
    expect(
      evaluateSendingReadiness(
        { ...input, checked_at: new Date(now - 86400000).toISOString() },
        options(),
        now,
      ).blockers,
    ).toContain('dns_evidence_stale');
    expect(evidenceFresh(new Date(now + 1), now)).toBe(false);
    expect(
      evaluateSendingReadiness({ ...input, status: 'failed' }, options(), now).blockers,
    ).toContain('domain_unverified');
    expect(
      evaluateSendingReadiness(
        input,
        { ...options(), revokedAt: checked_at, transportInstance: 'new-route' },
        now,
      ).blockers,
    ).toEqual(
      expect.arrayContaining(['transport_evidence_revoked', 'transport_evidence_mismatch']),
    );
    expect(
      evaluateSendingReadiness(
        input,
        {
          ...options(),
          evidence: { ...evidence(), checked_at: new Date(now - 86400000).toISOString() },
        },
        now,
      ).blockers,
    ).toContain('transport_evidence_stale');
    expect(
      evaluateSendingReadiness(
        { ...input, dmarc_evidence: { ...input.dmarc_evidence, status: 'missing' } },
        options(),
        now,
      ).blockers,
    ).toContain('dmarc_unverified');
  });
  it('rejects attested headers that disagree with sender or configured Postal return path', () => {
    vi.stubEnv('POSTAL_RETURN_PATH', 'rp.postal.example.net');
    const result = evaluateSendingReadiness(
      domain(),
      {
        ...options(),
        evidence: {
          ...evidence(),
          header_from_domain: 'evil.example',
          dkim_domain: 'evil.example',
          mail_from_domain: 'rp.postal.example.net',
        },
      },
      now,
    );
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'sender_evidence_mismatch',
        'dmarc_unaligned',
        'postal_return_path_mismatch',
      ]),
    );
  });
  it('generates Postal CNAME from configured prefix and polls verified DNS hourly', () => {
    vi.stubEnv('TRANSPORT', 'postal');
    vi.stubEnv('POSTAL_RETURN_PATH_PREFIX', 'bounce');
    vi.stubEnv('POSTAL_RETURN_PATH', 'rp.postal.example.net');
    expect(
      domainRecords({
        ...domainSchema.parse({ name: 'example.com' }),
        dkim_selector: 'flare',
        dkim_public: 'public',
      }),
    ).toContainEqual(
      expect.objectContaining({
        name: 'bounce.example.com',
        type: 'CNAME',
        value: 'rp.postal.example.net',
        purpose: 'return_path',
      }),
    );
    expect(verificationDelay(0, true)).toBe(3600);
  });
});
describe('SES provider configuration evidence', () => {
  it('requires verified custom MAIL FROM with RejectMessage and never treats that as received proof', async () => {
    const response = {
      VerifiedForSendingStatus: true,
      MailFromAttributes: {
        MailFromDomain: 'ses.example.com',
        MailFromDomainStatus: 'SUCCESS',
        BehaviorOnMxFailure: 'REJECT_MESSAGE',
      },
    };
    const check = await checkSesIdentity('example.com', 'us-east-1', async () => response, now);
    expect(check.status).toBe('verified');
    expect(
      evaluateSendingReadiness(
        domain(),
        {
          production: true,
          transportInstance: 'ses-v1',
          provider: 'ses',
          evidence: check.evidence,
        },
        now,
      ).ready,
    ).toBe(false);
    const proof = {
      ...evidence(),
      transport_instance: 'ses-v1',
      mail_from_domain: 'ses.example.com',
      ses: check.evidence,
    };
    expect(
      evaluateSendingReadiness(
        domain(),
        { production: true, transportInstance: 'ses-v1', provider: 'ses', evidence: proof },
        now,
      ).ready,
    ).toBe(true);
    for (const [field, value] of [
      ['MailFromDomainStatus', 'PENDING'],
      ['BehaviorOnMxFailure', 'USE_DEFAULT_VALUE'],
      ['MailFromDomain', 'unrelated.example'],
    ]) {
      expect(
        (
          await checkSesIdentity(
            'example.com',
            'us-east-1',
            async () => ({
              ...response,
              MailFromAttributes: { ...response.MailFromAttributes, [field!]: value },
            }),
            now,
          )
        ).status,
      ).toBe('failed');
    }
    expect(
      (
        await checkSesIdentity(
          'example.com',
          'us-east-1',
          async () => {
            throw new Error('credentials detail');
          },
          now,
        )
      ).status,
    ).toBe('temporary_failure');
    expect(sesMailFromRecords('ses.example.com', 'us-east-1')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com' }),
        expect.objectContaining({ type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' }),
      ]),
    );
  });
});
