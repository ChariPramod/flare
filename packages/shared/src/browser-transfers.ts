import { z } from 'zod';
const uuid = z.string().uuid();
const resource = { message_id: uuid };
export const browserTransferSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('email.send'),
      body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      body_bytes: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER),
      idempotency_key: z
        .string()
        .min(1)
        .max(256)
        .regex(/^[\x21-\x7e]+$/),
    })
    .strict(),
  z.object({ operation: z.literal('email.detail'), ...resource }).strict(),
  z.object({ operation: z.literal('email.source'), ...resource }).strict(),
  z.object({ operation: z.literal('inbound.body'), ...resource }).strict(),
  z.object({ operation: z.literal('inbound.raw'), ...resource }).strict(),
  z
    .object({ operation: z.literal('inbound.attachment'), ...resource, attachment_id: uuid })
    .strict(),
]);
export type BrowserTransferInput = z.infer<typeof browserTransferSchema>;
export type BrowserTransferOperation = BrowserTransferInput['operation'];
