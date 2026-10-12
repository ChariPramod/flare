import { createHash } from 'node:crypto';
import jsonLogic from 'json-logic-js';
import { z } from 'zod';
export const channelSchema = z.enum(['in_app', 'email', 'sms', 'push', 'chat']);
export type Channel = z.infer<typeof channelSchema>;
export const channels = channelSchema.options;
export const preferencesSchema = z
  .object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    push: z.boolean().optional(),
    chat: z.boolean().optional(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export function resolvePreferences(layers: {
  defaults?: Preferences;
  workflow?: Preferences;
  global?: Preferences;
  subscriberWorkflow?: Preferences;
  critical?: boolean;
}) {
  return Object.fromEntries(
    channels.map((channel) => {
      let enabled = true,
        source = 'system default';
      for (const [name, layer] of [
        ['code default', layers.defaults],
        ['workflow preference', layers.workflow],
        ...(!layers.critical
          ? [
              ['subscriber global', layers.global],
              ['subscriber workflow', layers.subscriberWorkflow],
            ]
          : []),
      ] as Array<[string, Preferences | undefined]>) {
        if (layer?.[channel] !== undefined) {
          enabled = layer[channel]!;
          source = name;
        }
      }
      return [
        channel,
        {
          enabled,
          source,
          why: `${source}${layers.critical ? '; critical workflow ignores subscriber preferences' : ''}`,
        },
      ];
    }),
  ) as Record<Channel, { enabled: boolean; source: string; why: string }>;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const fingerprint = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export function digestGroup(input: {
  orgId: string;
  environmentId: string;
  subscriberId: string;
  digestKey?: string;
  context?: Record<string, string>;
}) {
  return fingerprint([
    input.orgId,
    input.environmentId,
    input.subscriberId,
    input.digestKey ?? null,
    input.context ?? {},
  ]);
}
export const contextSchema = z
  .record(z.string().max(128), z.string().max(256))
  .refine((value) => Object.keys(value).length <= 5, 'At most five context keys');
export function contextMatches(a: Record<string, string> = {}, b: Record<string, string> = {}) {
  return canonical(a) === canonical(b);
}
export function conditionMatches(condition: unknown, data: Record<string, unknown>) {
  if (condition === null || condition === undefined) return true;
  return Boolean(jsonLogic.apply(condition as jsonLogic.RulesLogic, data));
}
export const subscriberSchema = z
  .object({
    subscriberId: z.string().min(1).max(128),
    firstName: z.string().max(120).optional(),
    lastName: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    avatar: z.string().url().optional(),
    locale: z
      .string()
      .regex(/^[a-z]{2}_[A-Z]{2}$/)
      .default('en_US'),
    timezone: z
      .string()
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .default('UTC'),
    data: z.record(z.unknown()).default({}),
  })
  .strict();
export const workflowSchema = z
  .object({
    workflowId: z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(''),
    tags: z.array(z.string().max(64)).max(20).default([]),
    severity: z.enum(['high', 'medium', 'low', 'none']).default('none'),
    active: z.boolean().default(true),
    critical: z.boolean().default(false),
    payloadSchema: z.record(z.unknown()).default({ type: 'object' }),
    defaults: preferencesSchema.default({}),
    preferences: preferencesSchema.default({}),
    steps: z
      .array(
        z
          .object({
            stepId: z.string().regex(/^[a-z][a-z0-9_-]{0,99}$/),
            name: z.string().min(1).max(120),
            type: z.enum([
              'in_app',
              'email',
              'sms',
              'push',
              'chat',
              'delay',
              'digest',
              'throttle',
              'http_request',
            ]),
            controlValues: z.record(z.unknown()).default({}),
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .refine(
    (value) => new Set(value.steps.map((step) => step.stepId)).size === value.steps.length,
    'Step identifiers must be unique',
  );
export type Workflow = z.infer<typeof workflowSchema>;
export function stepFailureEffect(type: string) {
  return ['delay', 'digest', 'throttle', 'http_request'].includes(type)
    ? 'cancel_remaining'
    : 'continue';
}
