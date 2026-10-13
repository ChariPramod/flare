import { describe, it, expect } from 'vitest';
import { Webhook } from 'svix';
import {
  webhookSecret,
  signWebhook,
  verifyWebhook,
  eventMatches,
  webhookRetrySeconds,
} from './webhooks.js';
import { redact, csvCell } from './redaction.js';
describe('webhook interoperability', () => {
  it('signs payloads accepted by the official Svix verifier', () => {
    const secret = webhookSecret(),
      id = 'event-123',
      now = Math.floor(Date.now() / 1000),
      payload = '{"type":"email.sent","data":{"message":"héllo"}}';
    const headers = {
      'svix-id': id,
      'svix-timestamp': String(now),
      'svix-signature': signWebhook(secret, id, now, payload),
    };
    expect(() => new Webhook(secret).verify(payload, headers)).not.toThrow();
    expect(() => new Webhook(secret).verify(`${payload} `, headers)).toThrow();
    expect(verifyWebhook(secret, payload, headers)).toEqual(JSON.parse(payload));
  });
  it('accepts signatures from the official implementation including rotation', () => {
    const old = webhookSecret(),
      secret = webhookSecret(),
      body = '{"a":1}',
      now = new Date(),
      id = 'event-2';
    const signature = new Webhook(secret).sign(id, now, body),
      headers = {
        'svix-id': id,
        'svix-timestamp': String(Math.floor(+now / 1000)),
        'svix-signature': `${signWebhook(old, id, Math.floor(+now / 1000), body)} ${signature}`,
      };
    expect(verifyWebhook(secret, body, headers)).toEqual({ a: 1 });
  });
  it('rejects body/id/time tampering, stale and future timestamps', () => {
    const secret = webhookSecret(),
      body = '{}',
      now = Math.floor(Date.now() / 1000),
      headers = {
        'svix-id': 'event',
        'svix-timestamp': String(now),
        'svix-signature': signWebhook(secret, 'event', now, body),
      };
    expect(() => verifyWebhook(secret, '{ }', headers)).toThrow('signature');
    expect(() => verifyWebhook(secret, body, { ...headers, 'svix-id': 'other' })).toThrow(
      'signature',
    );
    for (const offset of [-301, 301])
      expect(() => verifyWebhook(secret, body, headers, (now + offset) * 1000)).toThrow('window');
    expect(() => verifyWebhook(secret, body, { ...headers, 'svix-timestamp': 'NaN' })).toThrow();
  });
  it('matches exact names and category wildcards and uses the required retry schedule', () => {
    expect(eventMatches(['email.*'], 'email.sent')).toBe(true);
    expect(eventMatches(['email.*'], 'domain.verified')).toBe(false);
    expect(eventMatches(['email.sent'], 'email.sent.extra')).toBe(false);
    expect(webhookRetrySeconds).toEqual([0, 5, 300, 1800, 7200, 18000, 36000, 36000]);
  });
});
describe('request log redaction', () => {
  it('removes nested credentials, MFA, keys, cookies, MIME and attachment data', () => {
    const input = {
      nested: {
        password: 'secret',
        novu_api_key: 'key',
        headers: { Authorization: 'Bearer test', Cookie: 's=key' },
        recovery_codes: ['code'],
        uri: 'otpauth://secret',
        source: 'raw MIME',
        attachments: [{ content: 'base64' }],
      },
      subject: 'Hello',
      status: 'sent',
    };
    const result = JSON.stringify(redact(input));
    expect(result).not.toContain('base64');
    expect(result).not.toContain('Bearer test');
    expect(result).not.toContain('otpauth://');
    expect(result).not.toContain('raw MIME');
    expect(JSON.parse(result).nested.novu_api_key).toBe('[REDACTED]');
    expect(result).toContain('Hello');
  });
  it('bounds strings and prevents CSV formula execution', () => {
    expect(JSON.stringify(redact({ body: 'x'.repeat(1000000) })).length).toBeLessThan(5000);
    expect(csvCell('=IMPORTDATA("x")')).toBe('"\'=IMPORTDATA(""x"")"');
    expect(csvCell('hello,world')).toBe('"hello,world"');
    expect(JSON.stringify(redact({ ['k'.repeat(1000000)]: 'value' })).length).toBeLessThan(1000);
    const url = JSON.stringify(
      redact({ url: 'https://user:password@example.com/?api_key=hello&normal=ok' }),
    );
    expect(url).not.toContain('password');
    expect(url).not.toContain('hello');
    expect(url).toContain('normal=ok');
  });
});
