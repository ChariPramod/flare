import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeFeedback, normalizeSesNotification } from './events.js';
import { PostalAdapter, retryAfterSeconds, transportError } from './transports.js';

afterEach(() => vi.unstubAllGlobals());
describe('provider feedback normalization', () => {
  const mail = { messageId: 'native-id', destination: ['first@example.net', 'second@example.net'] };
  it('uses only actual SES delayed recipients and keeps bounded diagnostic evidence', () => {
    const [event] = normalizeSesNotification({
      eventType: 'DeliveryDelay',
      mail,
      deliveryDelay: {
        delayType: 'IPFailure',
        timestamp: '2026-10-15T12:00:00Z',
        delayedRecipients: [
          {
            emailAddress: 'SECOND@example.net',
            status: '4.7.1',
            diagnosticCode: '421 4.7.1 deferred second@example.net\r\n' + 'x'.repeat(1000),
          },
        ],
      },
    });
    expect(event).toMatchObject({
      recipient: 'second@example.net',
      type: 'delivery_delayed',
      data: {
        classification: 'transient',
        smtp_status: 421,
        enhanced_status: '4.7.1',
        provider_reason: 'IPFailure',
      },
    });
    expect(event!.data.diagnostic!.length).toBeLessThanOrEqual(500);
    expect(event!.data.diagnostic).not.toContain('second@example.net');
    expect(() => normalizeSesNotification({ eventType: 'DeliveryDelay', mail })).toThrow(
      'affected recipients',
    );
  });
  it('keeps unknown bounces distinct from soft and hard bounces', () => {
    for (const [bounceType, bounceClass, classification] of [
      ['Permanent', 'hard', 'hard_bounce'],
      ['Transient', 'soft', 'soft_bounce'],
      ['Undetermined', 'unknown', 'unknown'],
    ]) {
      const [event] = normalizeSesNotification({
        eventType: 'Bounce',
        mail,
        bounce: { bounceType, bouncedRecipients: [{ emailAddress: mail.destination[0] }] },
      });
      expect(event).toMatchObject({ bounceClass, data: { classification } });
    }
  });
  it('attributes actual SES sending IP separately from caller and remote recipient IPs', () => {
    const [event] = normalizeSesNotification({
      eventType: 'Delivery',
      mail: { ...mail, tags: { 'ses:outgoing-ip': ['192.0.2.4'], 'ses:source-ip': ['192.0.2.8'] } },
      delivery: {
        recipients: [mail.destination[0]],
        smtpResponse: '250 accepted',
        remoteMtaIp: '2001:db8::1',
      },
    });
    expect(event!.data).toMatchObject({
      sending_ip: '192.0.2.4',
      remote_mta_ip: '2001:db8::1',
      classification: 'delivered',
    });
    expect(JSON.stringify(event)).not.toContain('192.0.2.8');
    expect(
      normalizeFeedback({ classification: 'unknown', sendingIp: 'not-an-ip' }),
    ).not.toHaveProperty('sending_ip');
  });
  it('rejects recipients outside the original envelope and deduplicates normalized recipients', () => {
    expect(() =>
      normalizeSesNotification({
        eventType: 'Delivery',
        mail,
        delivery: { recipients: ['foreign@example.net'] },
      }),
    ).toThrow('not a destination');
    expect(
      normalizeSesNotification({
        eventType: 'Delivery',
        mail,
        delivery: { recipients: ['FIRST@example.net', 'first@example.net'] },
      }),
    ).toHaveLength(1);
  });
});
describe('transport refusal versus unknown acceptance', () => {
  it.each([
    [421, 'transient'],
    [450, 'transient'],
    [550, 'permanent'],
  ])('classifies explicit SMTP %i refusal', (responseCode, kind) => {
    expect(transportError({ responseCode, code: 'EENVELOPE' })).toMatchObject({
      kind,
      diagnostics: { smtp_status: responseCode },
    });
  });
  it.each([
    [429, 'transient'],
    [403, 'permanent'],
    [408, 'ambiguous'],
    [409, 'ambiguous'],
    [500, 'ambiguous'],
    [503, 'ambiguous'],
  ])('classifies HTTP %i without guessing acceptance', (httpStatusCode, kind) => {
    expect(transportError({ $metadata: { httpStatusCode } })).toMatchObject({
      kind,
      diagnostics: { http_status: httpStatusCode },
    });
  });
  it('uses only known pre-connection refusals as network retry evidence', () => {
    expect(transportError({ cause: { code: 'ECONNREFUSED' } }).kind).toBe('transient');
    expect(transportError({ code: 'ECONNRESET' }).kind).toBe('ambiguous');
    expect(transportError({ name: 'TimeoutError' }).kind).toBe('ambiguous');
    expect(transportError(null).kind).toBe('ambiguous');
  });
  it('bounds Retry-After and carries it only for a definitive throttle refusal', async () => {
    expect(retryAfterSeconds('30')).toBe(30);
    expect(retryAfterSeconds('999999999')).toBe(86400);
    expect(retryAfterSeconds('invalid')).toBe(0);
    expect(
      retryAfterSeconds('Thu, 15 Oct 2026 12:01:00 GMT', Date.parse('2026-10-15T12:00:00Z')),
    ).toBe(60);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } })),
    );
    await expect(
      new PostalAdapter('https://postal.example.test', 'fixture-key').send({
        raw: Buffer.from('test'),
        from: 'from@example.test',
        to: ['to@example.test'],
        requireTls: false,
      }),
    ).rejects.toMatchObject({ kind: 'transient', diagnostics: { retry_after_seconds: 60 } });
  });
  it('quarantines malformed success and uncertain server responses', async () => {
    for (const response of [
      new Response('{}', { status: 503 }),
      new Response(JSON.stringify({ status: 'success', data: { messages: {} } })),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response),
      );
      await expect(
        new PostalAdapter('https://postal.example.test', 'fixture-key').send({
          raw: Buffer.from('test'),
          from: 'from@example.test',
          to: ['to@example.test'],
          requireTls: false,
        }),
      ).rejects.toMatchObject({ kind: 'ambiguous' });
    }
  });
});
