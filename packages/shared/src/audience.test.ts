import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  parseCsv,
  renderText,
  validateTemplate,
  templateSchema,
  propertyValid,
  preferenceToken,
  verifyPreferenceToken,
  segmentSchema,
} from './audience.js';
it('parses quoted commas, escaped quotes, CRLF, multiline fields and a BOM', () => {
  expect(parseCsv('\uFEFFemail,name\r\na@example.test,"A, ""B""\nC"\r\n')).toEqual({
    headers: ['email', 'name'],
    rows: [['a@example.test', 'A, "B"\nC']],
  });
  for (const source of [
    'email,email\na,b',
    'email,name\na',
    'email\n"unfinished',
    'email\n"done"bad',
  ])
    expect(() => parseCsv(source)).toThrow();
  expect(() => parseCsv('email\n' + 'a'.repeat(4001))).toThrow('limit');
});
it('escapes variable markup, leaves data uninterpreted, and rejects code-like or raw templates', () => {
  expect(renderText('<p>{{name}}</p>', { name: '<img src=x>' }, true)).toBe(
    '<p>&lt;img src=x&gt;</p>',
  );
  expect(renderText('{{name}}', { name: '{{danger}}' })).toBe('{{danger}}');
  expect(() => renderText('{{{name}}}', { name: '<b>x</b>' }, true)).toThrow('triple');
  expect(() => renderText('{{constructor.name}}', {})).toThrow('Invalid');
  expect(() =>
    validateTemplate(templateSchema.parse({ subject: 'Hello', html: '{{#each items}}' })),
  ).toThrow();
  expect(renderText('{{payload.user}}', { payload: { user: 'A' } })).toBe('A');
});
it('validates property dates and typed comparisons', () => {
  expect(propertyValid('date', '2026-02-30')).toBe(false);
  expect(propertyValid('date', '2024-02-29')).toBe(true);
  expect(propertyValid('number', '12')).toBe(false);
  expect(
    segmentSchema.safeParse({ rules: [{ field: 'properties.seats', op: 'gt', value: 'ten' }] })
      .success,
  ).toBe(false);
});
it('binds preference links to their signed contact and tenant, with expiry', () => {
  const data = {
    orgId: randomUUID(),
    environmentId: randomUUID(),
    contactId: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const token = preferenceToken(data, 'test-key');
  expect(verifyPreferenceToken(token, 'test-key')).toEqual(data);
  expect(() => verifyPreferenceToken(token.replace(/^./, 'z'), 'test-key')).toThrow();
  expect(() => verifyPreferenceToken(token, 'other')).toThrow();
  expect(() => verifyPreferenceToken(token, 'test-key', Date.now() + 120000)).toThrow('expired');
});
