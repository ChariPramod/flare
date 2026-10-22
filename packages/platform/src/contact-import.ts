import ExcelJS from 'exceljs';
import { crc32 } from 'node:zlib';
import { fromBufferPromise } from 'yauzl';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { contactSchema, propertyName, propertyValid } from '@flare/shared';
import type { Tenant } from '@flare/shared';
import { MailError, outbox } from '@flare/mail';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const MAX_CELL = 4000;
const MAX_ERRORS = 50;
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const mappingSchema = z.record(z.string().min(1).max(120), z.string().min(1).max(100));
export const contactImportSourceSchema = z
  .object({
    format: z.enum(['csv', 'tsv', 'json', 'xlsx']),
    data: z
      .string()
      .min(1)
      .max(4 * Math.ceil(MAX_BYTES / 3)),
    sheet: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => v.format === 'xlsx' || v.sheet === undefined, 'Only Excel files have sheets');
export const contactImportPreviewSchema = z
  .object({ source: contactImportSourceSchema, mapping: mappingSchema.optional() })
  .strict();
export const contactImportSchema = z
  .object({
    source: contactImportSourceSchema,
    mapping: mappingSchema,
    list_id: z.string().uuid().optional(),
    list_name: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => !(v.list_id && v.list_name), 'Choose an existing list or a new list name');
export type ContactImportSource = z.infer<typeof contactImportSourceSchema>;
export type ContactImportInput = z.infer<typeof contactImportSchema>;
export type ContactImportPreviewInput = z.infer<typeof contactImportPreviewSchema>;
type Contact = z.infer<typeof contactSchema>;
type Definition = { name: string; type: string };
export type ParsedContactFile = {
  headers: string[];
  rows: string[][];
  rowNumbers: number[];
  sheets?: string[];
  sheet?: string;
};
export type ContactImportValidation = {
  valid: number;
  duplicates: number;
  errors: { row: number; message: string }[];
  error_count: number;
  existing: number;
  skipped_deleted: number;
};
const invalid = (message: string): never => {
  throw new MailError(422, message);
};

function headers(values: string[]) {
  const result = values.map((v, i) => (i ? v : v.replace(/^\uFEFF/, '')).trim());
  if (
    !result.length ||
    result.length > MAX_COLUMNS ||
    result.some(
      (v) => !v || v.length > 120 || [...v].some((c) => c.charCodeAt(0) < 32) || reserved.has(v),
    ) ||
    new Set(result).size !== result.length
  )
    invalid('Use 1–100 distinct, nonempty column headers of at most 120 characters');
  return result;
}
function cell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (!['string', 'number', 'boolean'].includes(typeof value))
    invalid('Contact cells must contain text, numbers, booleans or null');
  if (typeof value === 'number' && !Number.isFinite(value)) invalid('Numbers must be finite');
  const text = String(value);
  if (text.length > MAX_CELL || text.includes('\0'))
    invalid('Contact cells must be at most 4,000 characters and contain no null bytes');
  return text;
}
function table(all: string[][], numbers?: number[]): ParsedContactFile {
  const header = headers(all.shift() ?? []);
  const rowNumbers = numbers ? numbers.slice(1) : all.map((_r, i) => i + 2);
  if (!all.length) invalid('The file must contain at least one contact row');
  if (all.length > MAX_ROWS) invalid('At most 5,000 contacts per import');
  if (all.some((row) => row.length !== header.length))
    invalid('Every row must have the same number of columns as the header');
  return { headers: header, rows: all, rowNumbers };
}
function delimited(source: string, delimiter: ',' | '\t') {
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false,
    line = 1,
    recordLine = 1;
  const endField = () => {
    row.push(cell(field));
    if (row.length > MAX_COLUMNS) invalid('At most 100 columns per import');
    field = '';
    closed = false;
  };
  const endRow = () => {
    if (row.some((value) => value !== '')) {
      rows.push(row);
      rowNumbers.push(recordLine);
    }
    if (rows.length > MAX_ROWS + 1) invalid('At most 5,000 contacts per import');
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += c;
        if (c === '\n' || (c === '\r' && source[i + 1] !== '\n')) line++;
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === delimiter || c === '\n' || c === '\r') {
      endField();
      if (c !== delimiter) {
        if (c === '\r' && source[i + 1] === '\n') i++;
        endRow();
        line++;
        recordLine = line;
      }
    } else {
      if (closed || c === '"') invalid('Malformed quoted contact field');
      field += c;
    }
    if (field.length > MAX_CELL) invalid('Contact cells must be at most 4,000 characters');
  }
  if (quoted) invalid('Unterminated quoted contact field');
  endField();
  endRow();
  return table(rows, rowNumbers);
}
function jsonTable(source: string): ParsedContactFile {
  let input: unknown;
  try {
    input = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    invalid('Invalid JSON; provide an array of contact objects');
  }
  if (!Array.isArray(input) || !input.length || input.length > MAX_ROWS)
    invalid('JSON must be an array containing 1–5,000 contact objects');
  const names = new Set<string>();
  const records = (input as unknown[]).map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      invalid(`Row ${i + 1}: JSON contacts must be objects`);
    const result: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(item!)) {
      if (reserved.has(key)) invalid(`Row ${i + 1}: reserved field name`);
      if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [name, property] of Object.entries(value)) {
          if (!propertyName.safeParse(name).success) invalid(`Row ${i + 1}: invalid property name`);
          const target = `properties.${name}`;
          if (Object.hasOwn(result, target) || Object.hasOwn(item!, target))
            invalid(`Row ${i + 1}: duplicate flattened property ${target}`);
          result[target] = cell(property);
        }
      } else result[key] = cell(value);
    }
    for (const key of Object.keys(result)) names.add(key);
    return result;
  });
  const rawHeaders = [...names];
  const header = headers(rawHeaders);
  return {
    headers: header,
    rows: records.map((row) => rawHeaders.map((name) => row[name] ?? '')),
    rowNumbers: records.map((_r, i) => i + 1),
  };
}
function columnNumber(name: string) {
  return [...name].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}
/** Bound compressed input, actual inflated bytes and sparse coordinates before ExcelJS allocates a workbook. */
async function checkWorkbookArchive(buffer: Buffer) {
  const zip = await fromBufferPromise(buffer, { validateEntrySizes: true, strictFileNames: true });
  let bytes = 0,
    count = 0,
    cells = 0,
    nodes = 0;
  const names = new Set<string>();
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (++count > 200 || names.has(name.toLowerCase()))
        invalid('Excel archive has too many or duplicate parts');
      names.add(name.toLowerCase());
      // ExcelJS uses unanchored filename matchers for worksheet and drawing
      // parts. Do not let an extra suffix bypass the XML preflight below.
      if (/\.(?:xml|rels|vml)/i.test(name) && !/\.(?:xml|rels|vml)$/i.test(name))
        invalid('Excel archive contains an ambiguous XML part name');
      if (
        entry.isEncrypted() ||
        /(?:vbaProject|externalLinks|embeddings)\//i.test(name) ||
        /vbaProject\.bin$/i.test(name)
      )
        invalid('Use a plain .xlsx workbook without macros, embedded files or linked workbooks');
      if (entry.uncompressedSize > 16 * 1024 * 1024 - bytes)
        invalid('Expanded Excel workbook exceeds 16 MiB');
      if (name.endsWith('/')) continue;
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let checksum = 0;
      for await (const chunk of stream) {
        const data = Buffer.from(chunk);
        checksum = crc32(data, checksum);
        bytes += data.length;
        if (bytes > 16 * 1024 * 1024) {
          stream.destroy();
          invalid('Expanded Excel workbook exceeds 16 MiB');
        }
        if (/\.(?:xml|rels|vml)$/i.test(name)) chunks.push(data);
      }
      if (checksum !== entry.crc32) invalid('Excel archive checksum does not match its contents');
      if (!chunks.length) continue;
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      if (/<!DOCTYPE|<!ENTITY|\0/i.test(xml))
        invalid('Unsupported XML declarations in Excel workbook');
      if (/macroEnabled/i.test(xml)) invalid('Macro-enabled workbooks are not supported');
      // Named ranges can expand into a cell matrix when ExcelJS hydrates its
      // model. Contact imports need plain values, not workbook-level ranges.
      if (/<(?:[A-Za-z_][\w.-]*:)?definedName(?:\s|\/?>)/.test(xml))
        invalid('Excel named ranges are not supported; copy contact values to a plain sheet');
      nodes += (xml.match(/<[A-Za-z_][\w:.-]*(?:\s|\/?>)/g) ?? []).length;
      if (nodes > 300000) invalid('Excel workbook XML contains too many elements');
      if (name.toLowerCase() === 'xl/workbook.xml') {
        if ((xml.match(/<(?:[A-Za-z_][\w.-]*:)?sheet(?:\s|\/?>)/g) ?? []).length > 20)
          invalid('Excel workbook supports at most 20 sheets');
        for (const id of xml.matchAll(/\bsheetId\s*=\s*["']([^"']+)["']/g))
          if (!/^\d+$/.test(id[1]!) || Number(id[1]) < 1 || Number(id[1]) > 10000)
            invalid('Excel worksheet IDs must be integers between 1 and 10,000');
      }
      if (
        name.toLowerCase() === 'xl/styles.xml' &&
        (xml.match(/<(?:[A-Za-z_][\w.-]*:)?(?:xf|font|fill|border|numFmt)(?:\s|\/?>)/g) ?? [])
          .length > 10000
      )
        invalid('Excel workbook contains too many style records');
      if (
        name.toLowerCase() === 'xl/sharedstrings.xml' &&
        (xml.match(/<(?:[A-Za-z_][\w.-]*:)?si(?:\s|\/?>)/g) ?? []).length > 100000
      )
        invalid('Excel workbook supports at most 100,000 shared strings');
      if (
        !/xl\/worksheets\/sheet\d+\.xml/i.test(name) &&
        !/<(?:[A-Za-z_][\w.-]*:)?worksheet(?:\s|>)/.test(xml)
      )
        continue;
      if (/<(?:[A-Za-z_][\w.-]*:)?(?:f|mergeCell)(?:\s|\/?>)/.test(xml))
        invalid('Excel contact sheets must use plain values without formulas or merged cells');
      const rowTags = xml.match(/<(?:[A-Za-z_][\w.-]*:)?row(?:\s|\/?>)/g) ?? [];
      cells += (xml.match(/<(?:[A-Za-z_][\w.-]*:)?c(?:\s|\/?>)/g) ?? []).length;
      if (rowTags.length > MAX_ROWS + 1 || cells > 100000)
        invalid(
          'Excel workbooks support up to 5,000 contact rows per sheet and 100,000 cells total',
        );
      for (const match of xml.matchAll(/\b(?:r|ref|sqref)\s*=\s*["']([^"']+)["']/g)) {
        // ExcelJS decodes entities in attributes. Reject them before checking
        // coordinates so encoded digits cannot bypass sparse-allocation limits.
        if (match[1]!.includes('&')) invalid('Encoded Excel coordinates are not supported');
        for (const ref of match[1]!.replaceAll('$', '').matchAll(/([A-Z]+)?(\d+)/gi)) {
          if (
            Number(ref[2]) > MAX_ROWS + 1 ||
            (ref[1] && columnNumber(ref[1].toUpperCase()) > MAX_COLUMNS)
          )
            invalid(
              'Excel contact sheets must fit within 5,001 rows including headers and 100 columns',
            );
        }
      }
      for (const col of xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?col\s+[^>]*>/g))
        for (const bound of col[0].matchAll(/\b(?:min|max)\s*=\s*["']([^"']+)["']/g))
          if (!/^\d+$/.test(bound[1]!) || Number(bound[1]) < 1 || Number(bound[1]) > MAX_COLUMNS)
            invalid('Excel contact sheets support at most 100 columns');
    }
    if (!names.has('xl/workbook.xml') || !names.has('[content_types].xml'))
      invalid('The file is not an Excel .xlsx workbook');
  } finally {
    zip.close();
  }
}
async function excelTable(source: ContactImportSource): Promise<ParsedContactFile> {
  if (source.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(source.data))
    invalid('Excel data must be valid base64');
  const buffer = Buffer.from(source.data, 'base64');
  if (buffer.toString('base64') !== source.data) invalid('Excel data must be valid base64');
  if (!buffer.length || buffer.length > MAX_BYTES) invalid('Contact files must be at most 2 MiB');
  await checkWorkbookArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer, {
    ignoreNodes: ['drawing', 'picture', 'dataValidations', 'conditionalFormatting', 'extLst'],
  });
  const sheets = workbook.worksheets.filter((sheet) => sheet.state === 'visible' || !sheet.state);
  if (!sheets.length || sheets.length > 20) invalid('Excel workbook must have 1–20 visible sheets');
  const selected = source.sheet ? sheets.find((sheet) => sheet.name === source.sheet) : sheets[0];
  if (!selected) invalid('Selected Excel sheet was not found or is hidden');
  const all: string[][] = [],
    rowNumbers: number[] = [];
  selected!.eachRow((row, number) => {
    if (row.cellCount > MAX_COLUMNS || number > MAX_ROWS + 1)
      invalid('Excel contact sheets support 5,000 contacts and 100 columns');
    const values: string[] = [];
    for (let column = 1; column <= row.cellCount; column++) {
      const value = row.getCell(column).value;
      if (value instanceof Date) values.push(cell(value.toISOString()));
      else if (value && typeof value === 'object') {
        if ('formula' in value || 'sharedFormula' in value)
          invalid('Excel formulas are not supported; paste values first');
        if ('error' in value) invalid(`Excel row ${number} contains a spreadsheet error`);
        if ('richText' in value)
          values.push(cell(value.richText.map((part) => part.text).join('')));
        else if ('hyperlink' in value) values.push(cell(value.text));
        else invalid(`Excel row ${number} contains an unsupported cell value`);
      } else values.push(cell(value));
    }
    if (values.some((value) => value !== '')) {
      all.push(values);
      rowNumbers.push(number);
    }
  });
  const width = all[0]?.length ?? 0;
  for (const row of all) {
    while (row.length < width) row.push('');
    while (row.length > width && row.at(-1) === '') row.pop();
  }
  return {
    ...table(all, rowNumbers),
    sheets: sheets.map((sheet) => sheet.name),
    sheet: selected!.name,
  };
}
export async function parseContactFile(source: ContactImportSource): Promise<ParsedContactFile> {
  const checked = contactImportSourceSchema.safeParse(source);
  if (!checked.success) invalid('Invalid contact import source');
  try {
    if (source.format === 'xlsx') return await excelTable(source);
    if (Buffer.byteLength(source.data) > MAX_BYTES) invalid('Contact files must be at most 2 MiB');
    if (source.format === 'json') return jsonTable(source.data);
    return delimited(source.data.replace(/^\uFEFF/, ''), source.format === 'tsv' ? '\t' : ',');
  } catch (error) {
    if (error instanceof MailError) throw error;
    throw new MailError(
      422,
      'The contact file could not be parsed. Check its format and contents.',
    );
  }
}
function mapContacts(
  parsed: ParsedContactFile,
  mapping: Record<string, string>,
  definitions: Definition[],
) {
  const entries = Object.entries(mapping),
    targets = Object.values(mapping);
  if (
    !targets.includes('email') ||
    new Set(targets).size !== targets.length ||
    entries.some(([source]) => !parsed.headers.includes(source))
  )
    invalid('Map one email column and distinct contact fields');
  for (const target of targets) {
    if (['email', 'first_name', 'last_name', 'unsubscribed'].includes(target)) continue;
    if (!target.startsWith('properties.') || !propertyName.safeParse(target.slice(11)).success)
      invalid(`Unknown mapped field ${target}`);
    if (!definitions.some((definition) => definition.name === target.slice(11)))
      invalid(`Define contact property ${target.slice(11)} first`);
  }
  const contacts = new Map<string, Contact>();
  const validation: ContactImportValidation = {
    valid: 0,
    duplicates: 0,
    errors: [],
    error_count: 0,
    existing: 0,
    skipped_deleted: 0,
  };
  for (const [index, row] of parsed.rows.entries()) {
    try {
      const value: Record<string, unknown> = { properties: Object.create(null) };
      for (const [source, target] of entries) {
        const text = row[parsed.headers.indexOf(source)]!.trim();
        if (['email', 'first_name', 'last_name'].includes(target)) value[target] = text;
        else if (target === 'unsubscribed') {
          if (text && !['true', 'false'].includes(text.toLowerCase()))
            invalid('Unsubscribed must be true or false');
          if (text.toLowerCase() === 'true') value.unsubscribed = true;
        } else {
          const name = target.slice(11),
            definition = definitions.find((d) => d.name === name)!;
          let converted: unknown = text || null;
          if (text && definition.type === 'number') converted = Number(text);
          if (text && definition.type === 'boolean') {
            if (!['true', 'false'].includes(text.toLowerCase()))
              invalid(`${name} must be true or false`);
            converted = text.toLowerCase() === 'true';
          }
          if (!propertyValid(definition.type, converted)) invalid(`Invalid value for ${name}`);
          (value.properties as Record<string, unknown>)[name] = converted;
        }
      }
      const result = contactSchema.safeParse(value);
      if (!result.success)
        invalid(
          result.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        );
      const contact = result.data!;
      const previous = contacts.get(contact.email);
      validation.valid++;
      if (previous) {
        validation.duplicates++;
        if (previous.unsubscribed) contact.unsubscribed = true;
      }
      contacts.set(contact.email, contact);
    } catch (error) {
      validation.error_count++;
      if (validation.errors.length < MAX_ERRORS)
        validation.errors.push({
          row: parsed.rowNumbers[index]!,
          message: (error instanceof Error ? error.message : 'Invalid contact').slice(0, 500),
        });
    }
  }
  return { contacts, validation };
}
async function validateInTenant(
  tx: Transaction,
  parsed: ParsedContactFile,
  mapping: Record<string, string>,
) {
  const definitions = await tx`select name,type from contact_properties`;
  const mapped = mapContacts(
    parsed,
    mapping,
    definitions.map((d) => ({ name: String(d.name), type: String(d.type) })),
  );
  if (mapped.contacts.size) {
    const existing =
      await tx`select email,deleted_at from contacts where email=any(${[...mapped.contacts.keys()]})`;
    mapped.validation.existing = existing.filter((contact) => contact.deleted_at === null).length;
    mapped.validation.skipped_deleted = existing.filter(
      (contact) => contact.deleted_at !== null,
    ).length;
  }
  return mapped;
}
export async function previewContactFile(
  sql: Sql,
  tenant: Tenant,
  input: ContactImportPreviewInput,
) {
  const checked = contactImportPreviewSchema.safeParse(input);
  if (!checked.success) invalid('Invalid contact import preview request');
  input = checked.data!;
  const parsed = await parseContactFile(input.source);
  const validation = input.mapping
    ? await withTenant(
        sql,
        tenant,
        async (tx) => (await validateInTenant(tx, parsed, input.mapping!)).validation,
      )
    : undefined;
  return {
    headers: parsed.headers,
    sample: parsed.rows.slice(0, 5),
    rows: parsed.rows.length,
    ...(parsed.sheets ? { sheets: parsed.sheets, sheet: parsed.sheet } : {}),
    ...(validation ? { validation } : {}),
  };
}
export async function importContactFile(sql: Sql, tenant: Tenant, input: ContactImportInput) {
  const checked = contactImportSchema.safeParse(input);
  if (!checked.success) invalid('Invalid contact import request');
  input = checked.data!;
  const parsed = await parseContactFile(input.source);
  return withTenant(sql, tenant, async (tx) => {
    const { contacts, validation } = await validateInTenant(tx, parsed, input.mapping);
    if (validation.error_count) {
      const first = validation.errors[0]!;
      invalid(
        `Row ${first.row}: ${first.message}${validation.error_count > 1 ? ` (${validation.error_count} invalid rows; no contacts imported)` : ''}`,
      );
    }
    let list: { id: string; name: string } | null = null;
    if (input.list_id) {
      const [found] =
        await tx`select id,name from contact_lists where id=${input.list_id} for update`;
      if (!found) throw new MailError(404, 'Contact list not found');
      list = { id: String(found.id), name: String(found.name) };
    } else if (input.list_name) {
      const [found] =
        await tx`insert into contact_lists(org_id,environment_id,name) values(${tenant.orgId},${tenant.environmentId},${input.list_name}) on conflict(org_id,environment_id,name) do update set updated_at=now() returning id,name`;
      list = { id: String(found!.id), name: String(found!.name) };
    }
    let created = 0,
      updated = 0,
      skippedDeleted = 0;
    const targets = Object.values(input.mapping);
    // Stable order avoids deadlocks between concurrent imports of the same emails.
    for (const contact of [...contacts.values()].sort((a, b) => (a.email < b.email ? -1 : 1))) {
      const [inserted] =
        await tx`insert into contacts(org_id,environment_id,email,first_name,last_name,properties,unsubscribed) values(${tenant.orgId},${tenant.environmentId},${contact.email},${contact.first_name},${contact.last_name},${tx.json(toJson(contact.properties))},${contact.unsubscribed ?? false}) on conflict(org_id,environment_id,email) do nothing returning id`;
      const [changed] = inserted
        ? []
        : await tx`update contacts set first_name=case when ${targets.includes('first_name')} then ${contact.first_name} else first_name end,last_name=case when ${targets.includes('last_name')} then ${contact.last_name} else last_name end,properties=properties||${tx.json(toJson(contact.properties))}::jsonb,unsubscribed=unsubscribed or ${contact.unsubscribed ?? false},updated_at=now() where email=${contact.email} and deleted_at is null returning id`;
      const row = inserted ?? changed;
      if (!row) {
        skippedDeleted++;
        continue;
      }
      if (inserted) created++;
      else updated++;
      if (list)
        await tx`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${tenant.orgId},${tenant.environmentId},${list.id},${row.id}) on conflict do nothing`;
      await outbox(tx, tenant, inserted ? 'contact.created' : 'contact.updated', {
        id: row.id,
        email: contact.email,
      });
    }
    if (list) await tx`update contact_lists set updated_at=now() where id=${list.id}`;
    return {
      imported: created + updated,
      duplicates: validation.duplicates,
      created,
      updated,
      skipped_deleted: skippedDeleted,
      list_id: list?.id ?? null,
      list_name: list?.name ?? null,
    };
  });
}
