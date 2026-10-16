import { z } from 'zod';
export const reconciliationQuery = z
  .object({
    before: z.string().datetime({ offset: true }),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();
