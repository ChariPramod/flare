import { correlation } from './telemetry.js';
import { z } from 'zod';
import pino from 'pino';
export * from './security.js';
export * from './authorization.js';
export * from './workflows.js';

export const serviceName = z.enum(['api', 'worker', 'smtp-relay', 'web']);
export const createLogger = (name: string) =>
  pino({
    name,
    mixin: () => correlation() ?? {},
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.secret',
        '*.apiKey',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  });

export const infrastructureConfig = z.object({
  FLARE_OPERATOR_USER_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid())),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  FLARE_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'Must encode 32 bytes'),
});
export * from './webhooks.js';
export * from './redaction.js';
export * from './audience.js';

export * from './automations.js';

export * from './telemetry.js';

export { reconciliationQuery } from './reconciliation.js';
