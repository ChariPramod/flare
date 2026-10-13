import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { tokenBucket } from '@flare/platform';
import { redis } from './context.js';
export async function enforceLimit(res: Response, key: string, rate: number, burst: number) {
  let result;
  try {
    result = await tokenBucket(redis, key, rate, burst);
  } catch {
    res.setHeader('Retry-After', '1');
    throw new ServiceUnavailableException('Rate limiter unavailable');
  }
  res.setHeader('RateLimit-Limit', String(result.limit));
  res.setHeader('RateLimit-Remaining', String(result.remaining));
  res.setHeader('RateLimit-Reset', String(result.reset));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter));
    throw new HttpException('Rate limit exceeded', 429);
  }
}
