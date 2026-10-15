import { expect, it } from 'vitest';
import { MailError, SendingPolicyError } from '@flare/mail';
import { sendingPause } from './sending-pause.js';

it.each([
  'sending_not_approved',
  'sending_suspended',
  'classification_required',
  'marketing_not_approved',
  'route_required',
  'route_configuration_changed',
  'sender_not_ready',
])('keeps operator-remediable %s blocks pending', (code) => {
  expect(sendingPause(new SendingPolicyError(403, code, 'Operator action required'))).toEqual({
    seconds: 300,
    reason: `${code}: Operator action required`,
  });
});
it('bounds capacity retry intervals and preserves a concise visible reason', () => {
  expect(
    sendingPause(new SendingPolicyError(429, 'recipient_quota_exhausted', 'No daily capacity', 60)),
  ).toEqual({ seconds: 60, reason: 'recipient_quota_exhausted: No daily capacity' });
  expect(sendingPause(new SendingPolicyError(429, 'capacity', 'Wait', 0))?.seconds).toBe(60);
  expect(sendingPause(new SendingPolicyError(429, 'capacity', 'Wait', 999999))?.seconds).toBe(3600);
  expect(
    sendingPause(new SendingPolicyError(429, 'capacity', 'x'.repeat(1000), Number.NaN))?.reason,
  ).toHaveLength(500);
});
it('does not reclassify permanent mail validation or infrastructure errors as policy pauses', () => {
  for (const error of [
    new MailError(422, 'Invalid content'),
    new MailError(403, 'Invalid sender'),
    new MailError(429, 'Other limit'),
    new SendingPolicyError(422, 'invalid_purpose', 'Invalid request'),
    new Error('Database unavailable'),
  ])
    expect(sendingPause(error)).toBeNull();
});
