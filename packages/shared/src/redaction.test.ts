import { describe, expect, it } from 'vitest';
import { redact, redactText, redactRequestLogBodies } from './redaction.js';

it.each(['/v1/contacts/import', '/V1/CONTACTS/IMPORT/PREVIEW'])(
  'omits contact files and validation previews from %s logs',
  (path) => {
    const result = redactRequestLogBodies(
      path,
      { body: { csv: 'email\nperson@example.test', source: { data: 'private workbook' } } },
      JSON.stringify({ sample: [['person@example.test']], message: 'private column' }),
    );
    expect(result).toEqual({
      request_body: {
        body: '[CONTACT IMPORT CONTENT REDACTED]',
        query: '[CONTACT IMPORT CONTENT REDACTED]',
      },
      response_body: '[CONTACT IMPORT CONTENT REDACTED]',
    });
  },
);

it.each([
  '/v1/broadcasts',
  '/V1/BROADCASTS/fixture/audience-preview',
  '/v1/broadcasts/fixture/preflight',
  '/v1/broadcasts/fixture/test',
])('omits campaign composition and recipient samples from %s logs', (path) => {
  expect(
    JSON.stringify(
      redactRequestLogBodies(
        path,
        {
          body: {
            content: { html: 'Private campaign content' },
            recipients: ['person@example.test'],
          },
        },
        { sample: [{ email: 'person@example.test' }] },
      ),
    ),
  ).not.toMatch(/Private campaign content|person@example/);
});

describe('browser transfer credential text redaction', () => {
  const jwt = [{ alg: 'HS256' }, { sub: 'fixture' }, 'synthetic signature']
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  const grant = `fbt_${jwt}`;

  it('hides prefixed grants in plain and serialized text while preserving legacy JWT redaction', () => {
    expect(redactText(`Transfer Bearer ${grant}; ordinary Bearer ${jwt}.`)).toBe(
      'Transfer Bearer [REDACTED]; ordinary Bearer [REDACTED].',
    );
    expect(redact({ diagnostic: JSON.stringify({ note: grant, status: 'pending' }) })).toEqual({
      diagnostic: '{"note":"[REDACTED]","status":"pending"}',
    });
  });

  it('hides grants in generic route queries and historical payloads without dropping metadata', () => {
    expect(
      redactRequestLogBodies(
        '/v1/contacts',
        {
          query: { note: grant, page: 2 },
          body: { diagnostic: `https://example.test/inspect?note=${grant}&page=2` },
        },
        JSON.stringify({ diagnostic: grant, count: 3 }),
      ),
    ).toEqual({
      request_body: {
        query: { note: '[REDACTED]', page: 2 },
        body: { diagnostic: 'https://example.test/inspect?note=[REDACTED]&page=2' },
      },
      response_body: '{"diagnostic":"[REDACTED]","count":3}',
    });
  });
});

it.each([
  '/v1/browser-transfers',
  '/V1/BROWSER-TRANSFERS/',
  '/v1/dashboard/inbox/session',
  '/V1/DASHBOARD/INBOX/notifications',
  '/v1/dashboard/inbox/notifications/:id/read',
  '/socket.io',
  '/socket.io/',
  '/SOCKET.IO/unsupported',
])('omits dashboard credentials and native content from current and historical %s logs', (path) => {
  const payload = JSON.stringify({ token: 'private-grant', body: 'private notification' });
  expect(redactRequestLogBodies(path, { query: { token: 'private-grant' } }, payload)).toEqual({
    request_body: {
      body: '[DASHBOARD CREDENTIALS AND CONTENT REDACTED]',
      query: '[DASHBOARD CREDENTIALS AND CONTENT REDACTED]',
    },
    response_body: '[DASHBOARD CREDENTIALS AND CONTENT REDACTED]',
  });
});

describe('Inbox credential redaction', () => {
  it.each(['ws', 'wss'])('redacts native query credentials from %s URLs', (scheme) => {
    const source = `${scheme}://inbox.example.test/socket.io/?EIO=4&transport=websocket&token=opaque-fixture&token=another-fixture`;
    const cleaned = new URL(redactText(source));
    expect(cleaned.protocol).toBe(`${scheme}:`);
    expect(cleaned.searchParams.getAll('token')).toEqual(['[REDACTED]']);
    expect(cleaned.searchParams.get('transport')).toBe('websocket');
    expect(JSON.stringify(redact({ note: source }))).not.toContain('opaque-fixture');
  });
  const names = [
    'subscriberHash',
    'subscriber_hash',
    'subscriber-hash',
    'SUBSCRIBERHASH',
    'SuBsCrIbEr_HaSh',
  ];
  const hash = 'a3'.repeat(32);

  it.each(names)('redacts %s at every nested level without hiding ordinary identifiers', (name) => {
    expect(
      redact({
        subscriberId: 'customer-17',
        [name]: hash,
        nested: [{ [name]: hash, contentHash: 'public-checksum', status: 'active' }],
      }),
    ).toEqual({
      subscriberId: 'customer-17',
      [name]: '[REDACTED]',
      nested: [{ [name]: '[REDACTED]', contentHash: 'public-checksum', status: 'active' }],
    });
  });

  it.each(names)(
    'removes duplicate %s query credentials while preserving ordinary URL parameters',
    (name) => {
      const input = new URL('https://inbox.example.test/session');
      input.searchParams.append(name, hash);
      input.searchParams.append(name, 'b4'.repeat(32));
      input.searchParams.set('subscriberId', 'customer-17');
      input.searchParams.set('page', '2');
      const clean = new URL(redactText(input.toString()));
      expect(clean.searchParams.getAll(name)).toEqual(['[REDACTED]']);
      expect(clean.searchParams.get('subscriberId')).toBe('customer-17');
      expect(clean.searchParams.get('page')).toBe('2');
      expect(redact({ diagnostic: input.toString() })).toEqual({ diagnostic: clean.toString() });
    },
  );
});
