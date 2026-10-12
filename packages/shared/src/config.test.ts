import { describe, expect, it } from 'vitest';
import { infrastructureConfig } from './index.js';
describe('service configuration', () => {
  it('refuses insecure or incomplete startup configuration', () => {
    expect(infrastructureConfig.safeParse({}).success).toBe(false);
    expect(infrastructureConfig.safeParse({ DATABASE_URL: 'postgres://localhost/flare', REDIS_URL: 'redis://localhost', JWT_SECRET: 'short', FLARE_ENCRYPTION_KEY: 'short' }).success).toBe(false);
  });
});
