import { describe, expect, it } from 'vitest';
import {
  createApiKey,
  decrypt,
  encrypt,
  hashPassword,
  hashToken,
  totp,
  verifyPassword,
  verifyTotp,
} from './security.js';
import { can, canEditWorkflow, canSend, type Principal } from './authorization.js';
describe('security boundaries', () => {
  it('authenticates ciphertext and binds it to a tenant', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const value = encrypt('provider-secret', key, 'org-a/env-a');
    expect(decrypt(value, key, 'org-a/env-a')).toBe('provider-secret');
    expect(() => decrypt(value, key, 'org-b/env-b')).toThrow();
    expect(() => decrypt(value.replace(/.$/, 'x'), key, 'org-a/env-a')).toThrow();
  });
  it('salts passwords and rejects wrong passwords', async () => {
    const hash = await hashPassword('long-test-password');
    expect(await verifyPassword('long-test-password', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await hashPassword('long-test-password')).not.toBe(hash);
  });
  it('uses RFC 6238 SHA1 vectors and prevents TOTP replay', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // gitleaks:allow RFC 6238 public test vector
    expect(totp(secret, 1)).toBe('287082');
    expect(verifyTotp(secret, '287082', -1, 59000)).toBe(1);
    expect(verifyTotp(secret, '287082', 1, 59000)).toBeNull();
  });
  it('stores a one-way token digest', () => {
    const key = createApiKey();
    expect(hashToken(key.token)).toBe(key.hash);
    expect(key.hash).not.toContain(key.token);
  });
  it('enforces role, key and production permissions independently', () => {
    const principal: Principal = {
      orgId: 'a',
      environmentId: 'd',
      role: 'developer',
      kind: 'session',
      actorId: 'u',
      production: false,
    };
    expect(can(principal, 'publish')).toBe(false);
    expect(can(principal, 'manage_team')).toBe(false);
    expect(canEditWorkflow(principal)).toBe(true);
    expect(canEditWorkflow({ ...principal, production: true })).toBe(false);
    expect(can({ ...principal, role: 'viewer' }, 'write')).toBe(false);
    expect(can({ ...principal, permission: 'sending_access', kind: 'api_key' }, 'read')).toBe(
      false,
    );
    expect(canSend({ ...principal, domainId: 'domain-a' }, 'domain-b')).toBe(false);
  });
});
