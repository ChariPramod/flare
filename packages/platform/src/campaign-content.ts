import { z } from 'zod';
import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import { renderText, templateSchema, validateTemplate } from '@flare/shared';
import type { Tenant } from '@flare/shared';
import { MailError } from '@flare/mail';

export const templatePreviewSchema = z
  .object({
    content: templateSchema,
    variables: z.record(z.unknown()).default({}),
    contact_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((input) => !input.contact_id || !Object.keys(input.variables).length, {
    message: 'Choose a contact or sample variables, not both',
  });

// Preview and dispatch must resolve the same defaults, including false and zero.
export function campaignRecipientValues(
  defaults: Record<string, unknown>,
  fallbacks: Record<string, unknown>,
  contact: {
    email: unknown;
    first_name: unknown;
    last_name: unknown;
    properties: Record<string, unknown>;
  },
  preferenceUrl: string,
) {
  return {
    ...defaults,
    ...fallbacks,
    ...Object.fromEntries(Object.entries(contact.properties).filter(([, value]) => value !== null)),
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    FLARE_UNSUBSCRIBE_URL: preferenceUrl,
  };
}

export function renderContentPreview(
  content: z.infer<typeof templateSchema>,
  values: Record<string, unknown>,
) {
  validateTemplate(content);
  const subject = renderText(content.subject, values);
  const html = renderText(content.html, values, true);
  const text = content.text === undefined ? null : renderText(content.text, values);
  const missing = new Set<string>();
  for (const source of [content.subject, content.html, content.text ?? '']) {
    for (const match of source.matchAll(/\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const name = (match[1] ?? match[2])!.trim();
      let value: unknown = values;
      for (const part of name.split('.'))
        value =
          value && typeof value === 'object' && Object.hasOwn(value, part)
            ? (value as Record<string, unknown>)[part]
            : undefined;
      if (value == null || (typeof value === 'string' && !value.trim())) missing.add(name);
    }
  }
  return {
    subject,
    html,
    text,
    missing_variables: [...missing].slice(0, 50),
    missing_variable_count: missing.size,
  };
}

export async function previewTemplateContent(
  sql: Sql,
  tenant: Tenant,
  source: z.input<typeof templatePreviewSchema>,
) {
  const input = templatePreviewSchema.parse(source);
  let values: Record<string, unknown> = { ...input.content.variables, ...input.variables };
  if (input.contact_id) {
    values = await withTenant(sql, tenant, async (tx) => {
      const [contact] =
        await tx`select email,first_name,last_name,properties from contacts where id=${input.contact_id!} and deleted_at is null`;
      if (!contact) throw new MailError(404, 'Preview contact not found in this environment');
      const definitions = await tx`select name,fallback from contact_properties`;
      return campaignRecipientValues(
        input.content.variables,
        Object.fromEntries(definitions.map((row) => [String(row.name), row.fallback])),
        {
          email: contact.email,
          first_name: contact.first_name,
          last_name: contact.last_name,
          properties: contact.properties as Record<string, unknown>,
        },
        // A preview must never mint a contact's live unsubscribe capability.
        'https://example.test/preferences/preview',
      );
    });
  }
  try {
    return renderContentPreview(input.content, values);
  } catch (error) {
    throw new MailError(422, (error as Error).message);
  }
}
