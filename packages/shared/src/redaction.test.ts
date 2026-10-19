import { describe, expect, it } from 'vitest';
import { redact, redactText } from './redaction.js';

describe('Inbox credential redaction', () => {
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
