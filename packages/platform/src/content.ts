import { z } from 'zod';
import type { Transaction } from '@flare/db';
import type { Tenant, Workflow } from '@flare/shared';
import { MailError } from '@flare/mail';
const identifier = z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/);
export const localeSchema = z.string().regex(/^[a-z]{2}_[A-Z]{2}$/);
export const dictionarySchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
    z
      .string()
      .max(10000)
      .refine(
        (v) => !/[\r\n\0]/.test(v) && !v.includes('{{') && !v.includes('{%'),
        'Translations must be single-line plain text',
      ),
  )
  .refine(
    (v) => Object.keys(v).length <= 1000 && JSON.stringify(v).length <= 262144,
    'Dictionary exceeds 256 KiB or 1,000 keys',
  );
const token = /{{\s*t\.([a-z][a-z0-9_]*)\s*}}/g;
export const layoutSchema = z
  .object({
    identifier,
    name: z.string().trim().min(1).max(120),
    html: z
      .string()
      .max(500000)
      .refine(
        (v) => v.split('{{{body}}}').length === 2,
        'Layout needs exactly one {{{body}}} marker',
      ),
    translations: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    const rest = v.html
      .replace('{{{body}}}', '')
      .replace(token, v.translations ? '' : '{{invalid}}');
    if (rest.includes('{{') || rest.includes('{%'))
      ctx.addIssue({
        code: 'custom',
        message:
          'Layouts allow only the body marker and enabled {{t.key}} translations; payload variables are forbidden',
      });
  });
export function contentInput<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new MailError(422, result.error.message);
  return result.data;
}
export type ContentDependencies = {
  layouts: {
    identifier: string;
    name: string;
    version: number;
    html: string;
    translations: boolean;
  }[];
  templates: {
    identifier: string;
    name: string;
    version: number;
    subject: string;
    html: string;
    text: string | null;
  }[];
  translations: { key: string; slot: string; html: boolean }[];
};
export const emptyDependencies = (): ContentDependencies => ({
  layouts: [],
  templates: [],
  translations: [],
});
export async function compileWorkflowContent(tx: Transaction, _tenant: Tenant, input: Workflow) {
  const source = structuredClone(input),
    definition = structuredClone(input),
    dependencies = emptyDependencies();
  if (JSON.stringify(input).includes('__flare_i18n'))
    throw new MailError(422, '__flare_i18n is reserved for Flare');
  for (const [index, step] of definition.steps.entries()) {
    const controls = { ...step.controlValues },
      original = source.steps[index]!.controlValues;
    if (step.type === 'email' && typeof controls.templateId === 'string') {
      const id = contentInput(z.string().uuid(), controls.templateId);
      const version =
        controls.templateVersion === undefined
          ? null
          : contentInput(z.number().int().positive(), controls.templateVersion);
      const [template] =
        await tx`select t.identifier,t.name,v.* from email_templates t join template_versions v on v.template_id=t.id and v.org_id=t.org_id and v.environment_id=t.environment_id and v.version=coalesce(${version},t.current_version) where t.id=${id} and not t.archived`;
      if (!template) throw new MailError(422, 'Workflow email template not found');
      controls.subject = template.subject;
      controls.body = template.html;
      original.templateVersion = Number(template.version);
      dependencies.templates.push({
        identifier: String(template.identifier),
        name: String(template.name),
        version: Number(template.version),
        subject: String(template.subject),
        html: String(template.html),
        text: template.text === null ? null : String(template.text),
      });
      delete controls.templateId;
      delete controls.templateVersion;
    }
    if (step.type === 'email' && typeof controls.layoutIdentifier === 'string') {
      const name = contentInput(identifier, controls.layoutIdentifier),
        version =
          controls.layoutVersion === undefined
            ? null
            : contentInput(z.number().int().positive(), controls.layoutVersion);
      const [layout] =
        await tx`select l.identifier,l.name,v.* from layouts l join layout_versions v on v.layout_id=l.id and v.org_id=l.org_id and v.environment_id=l.environment_id and v.version=coalesce(${version},l.current_version) where l.identifier=${name}`;
      if (!layout) throw new MailError(422, 'Workflow layout version not found');
      controls.body = String(layout.html).replace('{{{body}}}', () => String(controls.body ?? ''));
      original.layoutVersion = Number(layout.version);
      dependencies.layouts.push({
        identifier: name,
        name: String(layout.name),
        version: Number(layout.version),
        html: String(layout.html),
        translations: Boolean(layout.translations),
      });
      delete controls.layoutIdentifier;
      delete controls.layoutVersion;
    }
    // Only content fields are translated; operational URLs/conditions remain caller-authored.
    for (const field of ['subject', 'body', 'title', 'content']) {
      if (typeof controls[field] !== 'string') continue;
      const html = step.type === 'email' && field === 'body';
      controls[field] = controls[field].replace(token, (_match, key: string) => {
        const slot = `${html ? 'html' : 'text'}_${key}`;
        if (!dependencies.translations.some((v) => v.slot === slot))
          dependencies.translations.push({ key, slot, html });
        return `{{payload.__flare_i18n.${slot}}}`;
      });
    }
    step.controlValues = controls;
  }
  return { source, definition, dependencies };
}
export function resolveDictionary(
  deps: ContentDependencies,
  base: Record<string, string>,
  locale: Record<string, string>,
) {
  const result: Record<string, string> = {};
  for (const item of deps.translations) {
    const fallback = Object.hasOwn(base, item.key) ? base[item.key] : undefined;
    if (fallback === undefined) throw new MailError(422, `Missing en_US translation: ${item.key}`);
    const value = Object.hasOwn(locale, item.key) ? locale[item.key]! : fallback;
    result[item.slot] = item.html
      ? value.replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
        )
      : value;
  }
  return result;
}
export async function translationPayload(
  tx: Transaction,
  workflow: string,
  deps: ContentDependencies,
  locale: string,
) {
  if (!deps.translations.length) return undefined;
  const rows =
    await tx`select t.locale,v.entries from translations t join translation_versions v using(org_id,environment_id,workflow_identifier,locale) where t.workflow_identifier=${workflow} and v.version=t.current_version and t.locale in ('en_US',${locale})`;
  return resolveDictionary(
    deps,
    rows.find((v) => v.locale === 'en_US')?.entries ?? {},
    rows.find((v) => v.locale === locale)?.entries ?? {},
  );
}
export function enginePayloadSchema(schema: Record<string, unknown>, deps: ContentDependencies) {
  if (!deps.translations.length) return schema;
  // Flare validates the original full schema before adding internal resolved values.
  return {
    type: 'object',
    properties: {
      ...(typeof schema.properties === 'object' && schema.properties !== null
        ? schema.properties
        : {}),
      __flare_i18n: { type: 'object', additionalProperties: { type: 'string' } },
    },
    additionalProperties: true,
  };
}
