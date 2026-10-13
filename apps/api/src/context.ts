import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import { createLogger, infrastructureConfig } from '@flare/shared';
import type { Principal } from '@flare/shared';
import type { Request } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';
import { BadRequestException } from '@nestjs/common';
export const config = infrastructureConfig.parse(process.env);
export const logger = createLogger('api');
export const { client: sql } = connectDatabase(config.DATABASE_URL);
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  commandTimeout: 2000,
  connectTimeout: 2000,
});
redis.on('error', (err: Error) => logger.error({ err }, 'Redis connection failed'));
export interface AuthRequest extends Request {
  principal: Principal;
}
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException({ message: 'Validation failed', errors: result.error.flatten() });
  return result.data;
}
