import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { sql, session, until } from './common.mjs';

// Actual HTTP, signature verification, MinIO storage and asynchronous parsing;
// public DNS/Postal delivery are deliberately outside this disposable fixture.
const nodemailer = createRequire(new URL('../../packages/mail/package.json', import.meta.url))(
  'nodemailer',
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const origin = process.env.WEB_ORIGIN;
try {
  const { api, headers } = await session();
  const [domain] = (await api('/domains')).filter((item) => item.name === 'acceptance.test');
  assert.ok(domain);
  const attachment = Buffer.alloc(5 * 1024 * 1024, 0x71);
  const html = `<p>Large transfer fixture</p><p>${'漢'.repeat(1_600_000)}</p><script>alert(1)</script><img src="https://remote.invalid/large-tracker">`;
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  const composed = await transport.sendMail({
    from: 'incoming@example.net',
    to: 'visible@acceptance.test',
    subject: 'Acceptance large inbound transfer',
    html,
    textEncoding: 'base64',
    attachments: [
      {
        filename: 'large-fixture.bin',
        content: attachment,
        contentType: 'application/octet-stream',
      },
    ],
  });
  const raw = Buffer.from(composed.message);
  assert.ok(raw.length > 4.5 * 1024 * 1024 && raw.length < 25 * 1024 * 1024);
  const body = JSON.stringify({
    id: `acceptance-large-${randomUUID()}`,
    mail_from: 'incoming@example.net',
    rcpt_to: 'hidden@acceptance.test',
    message: raw.toString('base64'),
    base64: true,
    size: raw.length,
  });
  const response = await fetch(`http://localhost:4000/v1/inbound/postal/${domain.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-postal-signature-256': sign(
        'RSA-SHA256',
        Buffer.from(body),
        readFileSync('/acceptance-postal.key'),
      ).toString('base64'),
    },
    body,
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 201);
  const receipt = await response.json();
  const id = receipt.id ?? receipt.data?.id;
  assert.equal(typeof id, 'string');
  let detail;
  await until(async () => {
    detail = await api(`/inbound/${id}`);
    assert.notEqual(detail.status, 'failed', 'Large inbound fixture parsing failed');
    return detail.status === 'parsed';
  }, 'large inbound parsing');
  assert.equal(detail.rcpt_to, 'hidden@acceptance.test');
  assert.equal(detail.attachments.length, 1);
  const attachmentId = detail.attachments[0].id;
  async function grant(operation, extra = {}) {
    const result = await fetch('http://localhost:4000/v1/browser-transfers', {
      method: 'POST',
      headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, message_id: id, ...extra }),
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(15000),
    });
    assert.equal(result.status, 201, `Grant issuance for ${operation}`);
    const value = await result.json();
    return value.data ?? value;
  }
  async function redeem(granted, overrides = {}) {
    // PUBLIC_API_URL is the host browser address; requests inside Compose use
    // the same exact signed target on the local API listener.
    const url = new URL(granted.url);
    return fetch(`http://localhost:4000${url.pathname}${url.search}`, {
      method: granted.method,
      headers: { Authorization: `Bearer ${granted.token}`, Origin: origin, ...overrides },
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(60000),
    });
  }
  const bodyGrant = await grant('inbound.body');
  const bodyResponse = await redeem(bodyGrant);
  assert.equal(bodyResponse.status, 200);
  assert.equal(bodyResponse.headers.get('cache-control'), 'no-store');
  const bodyText = await bodyResponse.text();
  assert.ok(Buffer.byteLength(bodyText) > 4.5 * 1024 * 1024);
  const parsedBody = JSON.parse(bodyText);
  assert.equal(hash((parsedBody.data ?? parsedBody).html), hash(html));
  assert.equal((await redeem(bodyGrant, { Origin: 'https://untrusted.invalid' })).status, 403);
  const rawGrant = await grant('inbound.raw');
  const rawResponse = await redeem(rawGrant);
  assert.equal(rawResponse.status, 200);
  assert.match(rawResponse.headers.get('content-disposition'), /^attachment;/);
  assert.equal(hash(Buffer.from(await rawResponse.arrayBuffer())), hash(raw));
  const fileGrant = await grant('inbound.attachment', { attachment_id: attachmentId });
  const fileResponse = await redeem(fileGrant);
  assert.equal(fileResponse.status, 200);
  assert.equal(hash(Buffer.from(await fileResponse.arrayBuffer())), hash(attachment));
  // Existing API clients retain their JSON/base64 response without opting in.
  const legacy = await api(`/inbound/${id}/attachments/${attachmentId}`);
  assert.equal(hash(Buffer.from(legacy.content, 'base64')), hash(attachment));
  const fixtures = JSON.parse(readFileSync('/acceptance/fixtures.json', 'utf8'));
  writeFileSync(
    '/acceptance/fixtures.json',
    JSON.stringify({
      ...fixtures,
      largeInbound: id,
      largeAttachment: attachmentId,
      largeRawSha256: hash(raw),
      largeRawBytes: raw.length,
    }),
    { mode: 0o600 },
  );
  console.log(
    'Large signed inbound parsing, session grants, exact binary downloads, origin enforcement and JSON compatibility passed.',
  );
} finally {
  await sql.end();
}
