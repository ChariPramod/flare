import { z } from 'zod';
const stepId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const automationEventName = z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/);
const next = stepId.nullable();
const base = { id: stepId, name: z.string().min(1).max(120) };
// Bounded scalar JSON Logic avoids custom operations, loops and unbounded recursion.
export function validateCondition(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value))
    return typeof value !== 'string' || value.length <= 4000;
  if (Array.isArray(value))
    return value.length <= 20 && value.every((v) => validateCondition(v, depth + 1));
  if (typeof value !== 'object') return false;
  const entries = Object.entries(value);
  return (
    entries.length === 1 &&
    entries.every(
      ([op, args]) =>
        [
          'var',
          '==',
          '===',
          '!=',
          '!==',
          '>',
          '>=',
          '<',
          '<=',
          '!',
          '!!',
          'and',
          'or',
          'in',
        ].includes(op) && validateCondition(args, depth + 1),
    )
  );
}
export const automationSchema = z
  .object({
    trigger: automationEventName,
    entry: stepId,
    steps: z
      .array(
        z.discriminatedUnion('type', [
          z
            .object({
              ...base,
              type: z.literal('send_email'),
              from: z.string().min(3).max(998),
              template_id: z.string().uuid(),
              template_version: z.number().int().positive(),
              next,
            })
            .strict(),
          z
            .object({
              ...base,
              type: z.literal('wait'),
              seconds: z
                .number()
                .int()
                .min(1)
                .max(365 * 86400),
              next,
            })
            .strict(),
          z
            .object({
              ...base,
              type: z.literal('wait_for_event'),
              event: automationEventName,
              timeout_seconds: z
                .number()
                .int()
                .min(1)
                .max(365 * 86400),
              next,
              on_timeout: next,
            })
            .strict(),
          z
            .object({
              ...base,
              type: z.literal('condition'),
              condition: z
                .unknown()
                .refine((v) => validateCondition(v), 'Unsupported or oversized condition'),
              then: next,
              else: next,
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((definition, context) => {
    const nodes = new Map(definition.steps.map((s) => [s.id, s]));
    const fail = (message: string) => context.addIssue({ code: 'custom', message });
    if (nodes.size !== definition.steps.length) fail('Step IDs must be unique');
    if (!nodes.has(definition.entry)) fail('Entry step is missing');
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string | null) => {
      if (id === null || visited.has(id)) return;
      const step = nodes.get(id);
      if (!step) {
        fail(`Step ${id} is missing`);
        return;
      }
      if (visiting.has(id)) {
        fail('Automation cycles are not supported');
        return;
      }
      visiting.add(id);
      if (step.type === 'condition') {
        visit(step.then);
        visit(step.else);
      } else {
        visit(step.next);
        if (step.type === 'wait_for_event') visit(step.on_timeout);
      }
      visiting.delete(id);
      visited.add(id);
    };
    visit(definition.entry);
    if (visited.size !== nodes.size) fail('Every step must be reachable from the entry');
  });
export type Automation = z.infer<typeof automationSchema>;
export const automationEventSchema = z
  .object({
    contact_id: z.string().uuid(),
    name: automationEventName,
    external_id: z.string().min(1).max(200),
    data: z
      .record(z.unknown())
      .default({})
      .refine((v) => JSON.stringify(v).length <= 32768, 'Event data exceeds 32 KiB'),
  })
  .strict();
