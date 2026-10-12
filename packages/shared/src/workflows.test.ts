import { describe, expect, it } from 'vitest';
import {
  canonical,
  contextMatches,
  digestGroup,
  resolvePreferences,
  stepFailureEffect,
} from './workflows.js';
describe('workflow semantics', () => {
  it('resolves preferences by layer and explains critical behavior', () => {
    const input = {
      defaults: { email: false },
      workflow: { email: true },
      global: { email: false },
      subscriberWorkflow: { email: true },
    };
    expect(resolvePreferences(input).email.source).toBe('subscriber workflow');
    expect(resolvePreferences({ ...input, critical: true }).email).toMatchObject({
      enabled: true,
      source: 'workflow preference',
    });
  });
  it('groups digests only within subscriber, tenant and exact context', () => {
    const base = { orgId: 'a', environmentId: 'd', subscriberId: 's', digestKey: 'oil' };
    expect(digestGroup(base)).not.toBe(digestGroup({ ...base, subscriberId: 't' }));
    expect(digestGroup(base)).not.toBe(digestGroup({ ...base, orgId: 'b' }));
    expect(contextMatches({}, { site: 'west' })).toBe(false);
    expect(contextMatches({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
  });
  it('canonicalizes key order for idempotency while preserving array order', () => {
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });
  it('distinguishes channel and action failure', () => {
    expect(stepFailureEffect('email')).toBe('continue');
    expect(stepFailureEffect('digest')).toBe('cancel_remaining');
  });
});
