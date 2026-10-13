import { it, expect, vi } from 'vitest';
const { evalMock } = vi.hoisted(() => ({ evalMock: vi.fn() }));
vi.mock('./context.js', () => ({ redis: { eval: evalMock } }));
import { enforceLimit } from './rate-limit.js';
import type { Response } from 'express';
it('returns consistent rate headers, 429 retry timing and fail-closed 503 responses', async () => {
  const headers = new Map<string, string>();
  const response = {
    setHeader: (key: string, value: string) => headers.set(key, value),
  } as unknown as Response;
  evalMock.mockResolvedValueOnce([1, 9, 0, 100]);
  await enforceLimit(response, 'key:example', 10, 10);
  expect(headers.get('RateLimit-Remaining')).toBe('9');
  evalMock.mockResolvedValueOnce([0, 0, 100, 1000]);
  await expect(enforceLimit(response, 'key:example', 10, 10)).rejects.toMatchObject({
    status: 429,
  });
  expect(headers.get('Retry-After')).toBe('1');
  evalMock.mockRejectedValueOnce(new Error('Redis disconnected'));
  await expect(enforceLimit(response, 'key:example', 10, 10)).rejects.toMatchObject({
    status: 503,
  });
});
