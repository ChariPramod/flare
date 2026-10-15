import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { dkimVerify } from 'mailauth';
import { expect, it } from 'vitest';
import { buildMime } from './mime.js';
import { emailSchema } from './validation.js';

it('cryptographically verifies received MIME and detects changed body, From and signed unsubscribe headers', async () => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const key = pair.publicKey.replace(/-----[^-]+-----|\s/g, '');
  const input = emailSchema.parse({
    from: 'sender@example.com',
    to: ['reader@example.net'],
    bcc: ['hidden@example.net'],
    subject: 'Authentication proof',
    text: 'Original receipt body',
    headers: {
      'List-Unsubscribe': '<https://example.com/unsubscribe>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  const { raw } = await buildMime(
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
    'test-tracking',
  );
  // Receiving MTAs may prepend unsigned transit headers; original signed bytes must remain valid.
  const received = `Received: from postal.example.net by receiver.example.net; Thu, 15 Oct 2026 12:00:00 +0000\r\nReturn-Path: <bounce@psrp.example.com>\r\n${raw.toString()}`;
  const verify = (mime: string) =>
    dkimVerify(mime, {
      strict: true,
      minBitLength: 2048,
      resolver: async (name, type) => {
        expect(name).toBe('flare._domainkey.example.com');
        expect(type).toBe('TXT');
        return [[`v=DKIM1; k=rsa; p=${key}`]];
      },
    });
  const valid = await verify(received);
  expect(valid.results).toHaveLength(1);
  expect(valid.results[0]?.status.result).toBe('pass');
  expect(valid.results[0]?.signingDomain).toBe('example.com');
  expect(received).not.toContain('hidden@example.net');
  for (const changed of [
    received.replace('Original receipt body', 'Modified receipt body'),
    received.replace('sender@example.com', 'forged@example.org'),
    received.replace('https://example.com/unsubscribe', 'https://evil.example/unsubscribe'),
  ]) {
    expect((await verify(changed)).results[0]?.status.result).not.toBe('pass');
  }
});
