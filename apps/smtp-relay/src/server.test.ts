import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createRelay } from './server.js';
import type { SMTPServer } from 'smtp-server';
import type { Principal } from '@flare/shared';
import { MailError, SendingPolicyError } from '@flare/mail';
const principal: Principal = {
  orgId: randomUUID(),
  environmentId: randomUUID(),
  actorId: randomUUID(),
  role: 'developer',
  kind: 'api_key',
  production: false,
  permission: 'sending_access',
};
const token = `fl_${randomUUID()}`;
let server: SMTPServer;
let port: number;
let ca: Buffer;
let directory: string;
let submissionError: MailError | undefined;
const received: { input: unknown; headers: { to: string[]; cc: string[] } }[] = [];
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'flare-smtp-test-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' },
  );
  ca = readFileSync(join(directory, 'cert.pem'));
  server = createRelay({
    cert: ca,
    key: readFileSync(join(directory, 'key.pem')),
    authenticate: async (value) => {
      if (value !== token) throw new MailError(401, 'Invalid API key');
      return principal;
    },
    submit: async (_p, input, headers) => {
      if (submissionError) throw submissionError;
      received.push({ input, headers });
      return randomUUID();
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing listener');
  port = address.port;
}, 10000);
beforeEach(() => {
  submissionError = undefined;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function transport(password = token, tls = true) {
  return nodemailer.createTransport({
    host: '127.0.0.1',
    port,
    secure: false,
    requireTLS: tls,
    ignoreTLS: !tls,
    auth: { user: 'flare', pass: password },
    tls: { ca, servername: 'localhost' },
  });
}
describe('authenticated SMTP submission', () => {
  it.each([
    [
      new SendingPolicyError(403, 'required_tls_unavailable', 'Temporary TLS capability outage'),
      451,
    ],
    [
      new SendingPolicyError(429, 'recipient_quota_exhausted', 'Recipient allowance exhausted'),
      452,
    ],
    [new MailError(403, 'API key is scoped to another domain'), 550],
    [new SendingPolicyError(403, 'sending_not_approved', 'Sending requires approval'), 550],
    [new SendingPolicyError(403, 'sender_not_ready', 'Sender proof missing'), 550],
  ] as const)('maps submission error %s to SMTP %i', async (error, responseCode) => {
    submissionError = error;
    const before = received.length;
    await expect(
      transport().sendMail({
        from: 'sender@example.com',
        to: 'reader@example.net',
        text: 'Response classification',
      }),
    ).rejects.toMatchObject({ responseCode });
    expect(received).toHaveLength(before);
  });
  it('requires STARTTLS and rejects invalid API keys', async () => {
    await expect(transport(token, false).verify()).rejects.toThrow(/STARTTLS/i);
    await expect(transport('invalid').verify()).rejects.toThrow(/Invalid API key/i);
  });
  it('preserves envelope-only Bcc and parses attachments through the shared submission contract', async () => {
    await transport().sendMail({
      from: 'sender@example.com',
      to: 'visible@example.net',
      subject: 'SMTP test',
      text: 'hello',
      envelope: { from: 'sender@example.com', to: ['visible@example.net', 'hidden@example.net'] },
      attachments: [{ filename: 'a.txt', content: 'hello' }],
    });
    expect(received.at(-1)?.input).toMatchObject({
      to: ['visible@example.net', 'hidden@example.net'],
      attachments: [{ filename: 'a.txt', content: Buffer.from('hello').toString('base64') }],
    });
    expect(received.at(-1)?.headers).toEqual({ to: ['visible@example.net'], cc: [] });
  });
  it('rejects mismatched envelope senders', async () => {
    await expect(
      transport().sendMail({
        from: 'sender@example.com',
        to: 'reader@example.net',
        text: 'hello',
        envelope: { from: 'other@example.com', to: ['reader@example.net'] },
      }),
    ).rejects.toThrow(/Envelope sender must match/);
  });
});
