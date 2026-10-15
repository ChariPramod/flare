import { SendingPolicyError } from '@flare/mail';

/** Operator-remediable policy blocks must not consume content-validation retries. */
export function sendingPause(error: unknown) {
  if (!(error instanceof SendingPolicyError) || ![403, 429].includes(error.status)) return null;
  const suggested = error.retryAfter ?? (error.status === 429 ? 60 : 300);
  return {
    seconds: Number.isFinite(suggested) ? Math.max(60, Math.min(3600, Math.ceil(suggested))) : 300,
    reason: `${error.code}: ${error.message}`.slice(0, 500),
  };
}
