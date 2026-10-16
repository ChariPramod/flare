import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  address,
  recipients,
  schedule,
  canTransition,
  publicAddress,
  downloadAttachment,
  signTracking,
  verifyTracking,
  trackHtml,
  verifyPostal,
  snsCanonical,
  verifyRecords,
  verificationStatus,
  verificationDelay,
  buildMime,
  PostalAdapter,
} from './index.js';
import type { DnsRecord } from './index.js';
const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { format: 'pem', type: 'spki' },
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
});
describe('email validation and scheduling', () => {
  const body = {
    from: 'Sender <sender@example.com>',
    to: ['reader@example.net'],
    subject: 'Hello',
    text: 'Hello',
  };
  it('bounds combined recipients and rejects header injection', () => {
    expect(
      emailSchema.safeParse({
        ...body,
        to: Array(50).fill('reader@example.net'),
        bcc: ['hidden@example.net'],
      }).success,
    ).toBe(false);
    expect(
      emailSchema.safeParse({ ...body, subject: 'Hello\r\nBcc: thief@example.net' }).success,
    ).toBe(false);
    expect(emailSchema.safeParse({ ...body, headers: { Bcc: 'thief@example.net' } }).success).toBe(
      false,
    );
    expect(
      recipients(emailSchema.parse({ ...body, bcc: ['READER@example.net', 'hidden@example.net'] })),
    ).toHaveLength(2);
  });
  it('rejects mailbox lists, groups and unmatched brackets in every mailbox field', () => {
    const invalid = [
      'attacker@evil.example, Sender <sender@example.com>',
      'Group: Sender <sender@example.com>',
      'Group: Sender <sender@example.com>;',
      'Sender <sender@example.com',
      'sender@example.com>',
    ];
    for (const value of invalid) {
      expect(() => address(value)).toThrow();
      for (const field of ['from', 'to', 'cc', 'bcc', 'reply_to'])
        expect(emailSchema.safeParse({ ...body, [field]: value }).success).toBe(false);
    }
    expect(address('"Doe, Jane" <SENDER@example.com>')).toBe('sender@example.com');
    expect(address('Sender <sender@example.com>')).toBe('sender@example.com');
    expect(address('sender@example.com')).toBe('sender@example.com');
  });
  it('resolves relative schedules in UTC and rejects ambiguous ISO timezones', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    expect(schedule('in 2 hours', now).toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(() => schedule('2026-10-12T12:00:00', now)).toThrow();
    expect(() => schedule('2026-10-11T12:00:00Z', now)).toThrow();
    expect(() => schedule('in 31 days', now)).toThrow();
  });
  it('does not conflate provider acceptance with delivery or revive canceled mail', () => {
    expect(canTransition('queued', 'delivered')).toBe(false);
    expect(canTransition('sent', 'delivered')).toBe(true);
    expect(canTransition('delivered', 'bounced')).toBe(true);
    expect(canTransition('canceled', 'sent')).toBe(false);
    expect(canTransition('complained', 'delivered')).toBe(false);
  });
  it('signs MIME once and omits Bcc without removing its envelope recipient', async () => {
    const input = emailSchema.parse({
      ...body,
      from: '"Doe, Jane" <sender@example.com>',
      bcc: ['hidden@example.net'],
      attachments: [{ filename: 'hello.txt', content: Buffer.from('hello').toString('base64') }],
    });
    const result = await buildMime(
      input,
      randomUUID(),
      {
        name: 'example.com',
        dkim_selector: 'flare',
        privateKey: pair.privateKey,
        open_tracking: false,
        click_tracking: false,
        trackingUrl: 'https://track.example.com',
      },
      'test-key',
    );
    expect(result.raw.toString()).toMatch(/^DKIM-Signature: v=1; a=rsa-sha256;/m);
    expect(result.raw.toString()).toMatch(/^From: "Doe, Jane" <sender@example.com>\r?$/m);
    expect(result.raw.toString()).not.toMatch(/^Bcc:/im);
    expect(result.raw.toString()).not.toContain('hidden@example.net');
    expect(recipients(input)).toContainEqual({ address: 'hidden@example.net', kind: 'bcc' });
  });
});
describe('attachment network boundary', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '224.0.0.1',
  ])('rejects %s', (ip) => expect(publicAddress(ip)).toBe(false));
  it('allows public addresses and rejects URL credentials and private literals', async () => {
    expect(publicAddress('1.1.1.1')).toBe(true);
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
    await expect(downloadAttachment('http://127.1/a', 1024)).rejects.toThrow('non-public');
    await expect(downloadAttachment('https://user:pass@example.com/a', 1024)).rejects.toThrow(
      'credentials',
    );
  });
});
describe('DNS and signed events', () => {
  it('joins split TXT chunks and rejects duplicate SPF records', async () => {
    const records: DnsRecord[] = [
      {
        type: 'TXT',
        name: 'flare._domainkey.example.com',
        value: 'v=DKIM1; k=rsa; p=abcd',
        purpose: 'dkim',
        required: true,
        status: 'pending',
      },
      {
        type: 'TXT',
        name: 'example.com',
        value: 'v=spf1 include:spf.example.net ~all',
        purpose: 'spf',
        required: true,
        status: 'pending',
      },
    ];
    const dns = {
      resolveTxt: async (host: string) =>
        host.startsWith('flare')
          ? [['v=DKIM1; k=rsa; p=', 'abcd']]
          : [['v=spf1 include:spf.example.net ~all']],
      resolveMx: async () => [],
      resolveCname: async () => [],
    };
    expect(verificationStatus(await verifyRecords(records, dns))).toBe('verified');
    expect(
      verificationStatus(
        await verifyRecords([records[1]!], {
          ...dns,
          resolveTxt: async () => [['v=spf1 include:spf.example.net ~all'], ['v=spf1 -all']],
        }),
      ),
    ).toBe('failed');
    expect(
      verificationStatus(
        await verifyRecords(records, {
          ...dns,
          resolveTxt: async () => {
            throw Object.assign(new Error(), { code: 'ETIMEOUT' });
          },
        }),
      ),
    ).toBe('temporary_failure');
    expect(verificationDelay(20, false)).toBe(86400);
  });
  it('verifies native Postal RSA/SHA256 and rejects body or signature tampering', () => {
    const raw = Buffer.from('{"event":"MessageSent"}');
    const signature = sign('RSA-SHA256', raw, pair.privateKey).toString('base64');
    expect(() => verifyPostal(raw, signature, pair.publicKey)).not.toThrow();
    expect(() => verifyPostal(Buffer.from('{}'), signature, pair.publicKey)).toThrow(
      'Invalid Postal',
    );
    expect(() =>
      verifyPostal(raw, sign('RSA-SHA1', raw, pair.privateKey).toString('base64'), pair.publicKey),
    ).toThrow();
  });
  it('canonicalizes SNS optional Subject only when present', () => {
    expect(
      snsCanonical({
        Type: 'Notification',
        Message: 'hello',
        MessageId: 'id',
        TopicArn: 'arn',
        Timestamp: 'now',
        SignatureVersion: '2',
        Signature: 'sig',
        SigningCertURL: 'https://example.com',
      }),
    ).toBe('Message\nhello\nMessageId\nid\nTimestamp\nnow\nTopicArn\narn\nType\nNotification\n');
  });
  it('signs tracking purpose, target, and expiry and only rewrites HTTP links', () => {
    const token = signTracking(
      { id: randomUUID(), kind: 'click', url: 'https://example.com/path', exp: 2000000000 },
      'secret',
    );
    expect(verifyTracking(token, 'secret').url).toBe('https://example.com/path');
    expect(() => verifyTracking(token, 'other')).toThrow();
    expect(() => verifyTracking(token, 'secret', 3000000000000)).toThrow();
    const html = trackHtml(
      '<a href="https://example.com">go</a><a href="mailto:a@example.com">email</a>',
      {
        id: randomUUID(),
        open: true,
        click: true,
        baseUrl: 'https://track.example.com',
        key: 'secret',
      },
    );
    expect(html).toContain('https://track.example.com/t/');
    expect(html).toContain('mailto:a@example.com');
  });
  it('rejects Postal when required outbound TLS cannot be guaranteed', async () => {
    expect(
      await new PostalAdapter('https://postal.example.com', 'test').supportsRequiredTls(),
    ).toBe(false);
  });
});
