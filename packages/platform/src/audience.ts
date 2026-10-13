import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { contactSchema, propertyValid, parseCsv, segmentSchema } from '@flare/shared';
import type { Tenant, Segment } from '@flare/shared';
import { MailError, outbox } from '@flare/mail';
import type { z } from 'zod';
export async function upsertContact(
  tx: Transaction,
  tenant: Tenant,
  input: z.infer<typeof contactSchema>,
  updateNames = { first: true, last: true },
) {
  const definitions = await tx`select name,type from contact_properties`;
  for (const [name, value] of Object.entries(input.properties)) {
    const definition = definitions.find((d) => d.name === name);
    if (!definition) throw new MailError(422, `Define contact property ${name} first`);
    if (!propertyValid(String(definition.type), value))
      throw new MailError(422, `Invalid value for ${name}`);
  }
  const [old] = await tx`select id from contacts where email=${input.email}`;
  const [row] =
    await tx`insert into contacts(org_id,environment_id,email,first_name,last_name,properties,unsubscribed) values(${tenant.orgId},${tenant.environmentId},${input.email},${input.first_name},${input.last_name},${tx.json(toJson(input.properties))},${input.unsubscribed ?? false}) on conflict(org_id,environment_id,email) do update set first_name=case when ${updateNames.first} then excluded.first_name else contacts.first_name end,last_name=case when ${updateNames.last} then excluded.last_name else contacts.last_name end,properties=contacts.properties||excluded.properties,unsubscribed=coalesce(${input.unsubscribed ?? null},contacts.unsubscribed),deleted_at=null,updated_at=now() returning *`;
  await outbox(tx, tenant, old ? 'contact.updated' : 'contact.created', {
    id: row!.id,
    email: row!.email,
  });
  return row!;
}
export async function importContacts(
  sql: Sql,
  tenant: Tenant,
  csv: string,
  mapping: Record<string, string>,
) {
  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(csv);
  } catch (e) {
    throw new MailError(422, (e as Error).message);
  }
  const { headers, rows } = parsed;
  if (
    !Object.values(mapping).includes('email') ||
    new Set(Object.values(mapping)).size !== Object.values(mapping).length ||
    Object.keys(mapping).some((k) => !headers.includes(k))
  )
    throw new MailError(422, 'Map one email column and distinct contact fields');
  return withTenant(sql, tenant, async (tx) => {
    const definitions = await tx`select name,type from contact_properties`;
    const deduped = new Map<string, z.infer<typeof contactSchema>>();
    for (const [index, row] of rows.entries()) {
      const value: Record<string, unknown> = { properties: {} };
      for (const [source, target] of Object.entries(mapping)) {
        const cell = row[headers.indexOf(source)]!;
        if (['email', 'first_name', 'last_name'].includes(target)) value[target] = cell.trim();
        else if (target === 'unsubscribed') {
          if (cell !== '' && !['true', 'false'].includes(cell.toLowerCase()))
            throw new MailError(422, `Row ${index + 2}: unsubscribed must be true or false`);
          // Imports may opt out but never silently re-subscribe an existing contact.
          if (cell.toLowerCase() === 'true') value.unsubscribed = true;
        } else if (target.startsWith('properties.')) {
          const name = target.slice(11),
            definition = definitions.find((d) => d.name === name);
          if (!definition) throw new MailError(422, `Unknown property ${name}`);
          let converted: unknown = cell || null;
          if (cell && definition.type === 'number') converted = Number(cell);
          if (cell && definition.type === 'boolean') {
            if (!['true', 'false'].includes(cell.toLowerCase()))
              throw new MailError(422, `Row ${index + 2}: ${name} must be true or false`);
            converted = cell.toLowerCase() === 'true';
          }
          (value.properties as Record<string, unknown>)[name] = converted;
        } else throw new MailError(422, `Unknown mapped field ${target}`);
      }
      const contact = contactSchema.safeParse(value);
      if (!contact.success) throw new MailError(422, `Row ${index + 2}: ${contact.error.message}`);
      const previous = deduped.get(contact.data.email);
      if (previous?.unsubscribed) contact.data.unsubscribed = true;
      deduped.set(contact.data.email, contact.data);
    }
    for (const input of deduped.values())
      await upsertContact(tx, tenant, input, {
        first: Object.values(mapping).includes('first_name'),
        last: Object.values(mapping).includes('last_name'),
      });
    return { imported: deduped.size, duplicates: rows.length - deduped.size };
  });
}
export function segmentWhere(tx: Transaction, source: Segment) {
  const definition = segmentSchema.parse(source);
  let expression = definition.mode === 'all' ? tx`true` : tx`false`;
  for (const rule of definition.rules) {
    const field =
      rule.field === 'email'
        ? tx`to_jsonb(c.email)`
        : rule.field === 'first_name'
          ? tx`to_jsonb(c.first_name)`
          : rule.field === 'last_name'
            ? tx`to_jsonb(c.last_name)`
            : rule.field === 'unsubscribed'
              ? tx`to_jsonb(c.unsubscribed)`
              : tx`coalesce(nullif(c.properties->${rule.field.slice(11)},'null'::jsonb),(select p.fallback from contact_properties p where p.name=${rule.field.slice(11)}))`;
    const value = tx.json(rule.value ?? null);
    const condition =
      rule.op === 'exists'
        ? tx`(${field} is not null and ${field}!='null'::jsonb)`
        : rule.op === 'eq'
          ? tx`(${field}=${value}::jsonb)`
          : rule.op === 'neq'
            ? tx`(${field} is distinct from ${value}::jsonb)`
            : rule.op === 'contains'
              ? tx`(strpos(${field}#>>'{}',${String(rule.value ?? '')})>0)`
              : rule.op === 'gt'
                ? tx`(jsonb_typeof(${field})='number' and ${field}>${value}::jsonb)`
                : tx`(jsonb_typeof(${field})='number' and ${field}<${value}::jsonb)`;
    expression =
      definition.mode === 'all'
        ? tx`(${expression} and ${condition})`
        : tx`(${expression} or ${condition})`;
  }
  return expression;
}
export async function updatePreferences(
  sql: Sql,
  tenant: Tenant,
  contactId: string,
  input: { unsubscribed?: boolean; topics?: Record<string, boolean> },
) {
  return withTenant(sql, tenant, async (tx) => {
    const [contact] =
      await tx`select id,unsubscribed from contacts where id=${contactId} and deleted_at is null for update`;
    if (!contact) throw new MailError(404, 'Contact not found');
    if (input.unsubscribed !== undefined)
      await tx`update contacts set unsubscribed=${input.unsubscribed},updated_at=now() where id=${contactId}`;
    for (const [topic, enabled] of Object.entries(input.topics ?? {})) {
      const exists = await tx`select id from audience_topics where id=${topic}`;
      if (!exists.length) throw new MailError(422, 'Audience topic not found');
      await tx`insert into contact_topic_preferences(org_id,environment_id,contact_id,topic_id,enabled) values(${tenant.orgId},${tenant.environmentId},${contactId},${topic},${enabled}) on conflict(org_id,environment_id,contact_id,topic_id) do update set enabled=excluded.enabled`;
    }
    await outbox(tx, tenant, 'contact.preferences_updated', { id: contactId, ...input });
    return { success: true };
  });
}
