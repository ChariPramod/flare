import { expect, it } from 'vitest';
import { isBase64 } from './base64.js';

it('preserves standard padded base64 syntax without accepting permissive decoder inputs', () => {
  for (const value of ['', 'YQ==', 'YWI=', 'YWJj', 'AAAA', 'AB==', 'ABC=', '+/+/', '////'])
    expect(isBase64(value), value).toBe(true);
  for (const value of [
    'A',
    'AA',
    'AAA',
    '====',
    'A===',
    'AA=A',
    '=AAA',
    'AAAA=',
    'Y Q=',
    'YQ==\n',
    'YQ==\r\n',
    '____',
    '----',
    '漢漢漢漢',
  ])
    expect(isBase64(value), value).toBe(false);
});

it('validates a full default-limit MIME buffer and rejects corruption near either end without stack growth', () => {
  const encoded = Buffer.alloc(25 * 1024 * 1024, 0x71).toString('base64');
  expect(isBase64(encoded)).toBe(true);
  expect(isBase64(`!${encoded.slice(1)}`)).toBe(false);
  expect(isBase64(`${encoded.slice(0, -4)}!===`)).toBe(false);
});
