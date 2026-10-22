import ExcelJS from 'exceljs';
import { crc32, deflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { connectDatabase, withTenant } from '../../db/src/index.js';
import type { Sql } from '../../db/src/index.js';
import {
  parseContactFile,
  previewContactFile,
  importContactFile,
  contactImportSchema,
} from './contact-import.js';
import { importContacts } from './audience.js';

async function xlsx(sheets: Record<string, unknown[][]>) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) book.addWorksheet(name).addRows(rows);
  return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
}
// Enough ZIP structure to exercise the bounded pre-parser; invalid fixtures are
// rejected before the workbook library can inspect the intentionally minimal XML.
function archive(parts: Record<string, string>, falseSize?: number) {
  const files: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(parts)) {
    const key = Buffer.from(name),
      raw = Buffer.from(content),
      data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(falseSize ?? raw.length, 22);
    local.writeUInt16LE(key.length, 26);
    files.push(local, key, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(falseSize ?? raw.length, 24);
    central.writeUInt16LE(key.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, key);
    offset += local.length + key.length + data.length;
  }
  const end = Buffer.alloc(22),
    records = Object.keys(parts).length;
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records, 8);
  end.writeUInt16LE(records, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]).toString('base64');
}

describe('contact file parsing', () => {
  it('reads BOM, quotes, escaped quotes and CRLF from CSV and TSV', async () => {
    const csv = await parseContactFile({
      format: 'csv',
      data: '\uFEFFEmail,Name\r\na@example.com,"A, ""Great"" Person"\r\n',
    });
    expect(csv.headers).toEqual(['Email', 'Name']);
    expect(csv.rows).toEqual([['a@example.com', 'A, "Great" Person']]);
    expect(
      (await parseContactFile({ format: 'tsv', data: 'Email\tName\na@example.com\t"A\tPerson"' }))
        .rows,
    ).toEqual([['a@example.com', 'A\tPerson']]);
    expect(
      (
        await parseContactFile({
          format: 'csv',
          data: 'Email,Name\r\n\r\na@example.com,"A\r\nPerson"\r\nb@example.com,Bee',
        })
      ).rowNumbers,
    ).toEqual([3, 5]);
  });
  it('rejects ambiguous headers, malformed quotes and inconsistent widths', async () => {
    for (const data of [
      'email,email\na@x.com,b@x.com',
      'email, email\na@x.com,b@x.com',
      'email,\na@x.com,A',
      'email\n"a@x.com',
      'email\na@x.com,A',
      'constructor\nvalue',
    ])
      await expect(parseContactFile({ format: 'csv', data })).rejects.toThrow();
  });
  it('enforces the final field, column, row and UTF-8 byte limits', async () => {
    await expect(
      parseContactFile({ format: 'csv', data: `email\n${'a'.repeat(4001)}` }),
    ).rejects.toThrow('4,000');
    await expect(
      parseContactFile({
        format: 'csv',
        data: Array.from({ length: 101 }, (_, i) => `c${i}`).join(','),
      }),
    ).rejects.toThrow('100');
    await expect(
      parseContactFile({ format: 'csv', data: 'email\n' + 'a@x.com\n'.repeat(5001) }),
    ).rejects.toThrow('5,000');
    await expect(parseContactFile({ format: 'csv', data: 'é'.repeat(1048577) })).rejects.toThrow(
      '2 MiB',
    );
  });
  it('flattens JSON properties and retains scalar values from heterogeneous rows', async () => {
    const parsed = await parseContactFile({
      format: 'json',
      data: JSON.stringify([
        { email: 'a@example.com', properties: { seats: 2 }, unsubscribed: false },
        { email: 'b@example.com', first_name: 'Bee', properties: { active: true } },
      ]),
    });
    expect(parsed.headers).toEqual([
      'email',
      'properties.seats',
      'unsubscribed',
      'first_name',
      'properties.active',
    ]);
    expect(parsed.rows).toEqual([
      ['a@example.com', '2', 'false', '', ''],
      ['b@example.com', '', '', 'Bee', 'true'],
    ]);
    expect(parsed.rowNumbers).toEqual([1, 2]);
    expect(
      await parseContactFile({ format: 'json', data: '[{" email ":"a@example.com"}]' }),
    ).toMatchObject({ headers: ['email'], rows: [['a@example.com']] });
  });
  it('rejects nested JSON, prototype keys, collisions and non-finite numbers', async () => {
    for (const data of [
      '{}',
      '[]',
      '[null]',
      '[{"email":"a@x.com","__proto__":{"x":true}}]',
      '[{"email":"a@x.com","properties":{"constructor":"x"}}]',
      '[{"email":"a@x.com","name":{"first":"A"}}]',
      '[{"email":"a@x.com","properties":{"x":1},"properties.x":2}]',
      '[{"email":"a@x.com","value":1e999}]',
    ])
      await expect(parseContactFile({ format: 'json', data })).rejects.toThrow();
  });
  it('reads Excel sheets, booleans, rich text, dates and trailing blanks', async () => {
    const data = await xlsx({
      First: [
        ['Email', 'Name', 'Birthday'],
        [
          'first@example.com',
          { richText: [{ text: 'First' }, { text: ' Person' }] },
          new Date('2026-01-01T00:00:00Z'),
        ],
      ],
      Second: [['Email', 'Optout'], ['second@example.com', true], ['third@example.com']],
    });
    const first = await parseContactFile({ format: 'xlsx', data });
    expect(first.sheets).toEqual(['First', 'Second']);
    expect(first.rows[0]).toEqual([
      'first@example.com',
      'First Person',
      '2026-01-01T00:00:00.000Z',
    ]);
    const second = await parseContactFile({ format: 'xlsx', data, sheet: 'Second' });
    expect(second.sheet).toBe('Second');
    expect(second.rows).toEqual([
      ['second@example.com', 'true'],
      ['third@example.com', ''],
    ]);
    await expect(parseContactFile({ format: 'xlsx', data, sheet: 'Missing' })).rejects.toThrow(
      'Selected Excel sheet',
    );
  });
  it('rejects formulas, merged cells and invalid base64', async () => {
    const formula = await xlsx({
      Contacts: [['email'], [{ formula: '"a@example.com"', result: 'a@example.com' }]],
    });
    await expect(parseContactFile({ format: 'xlsx', data: formula })).rejects.toThrow('formulas');
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Contacts');
    sheet.addRows([
      ['email', 'name'],
      ['a@example.com', 'A'],
    ]);
    sheet.mergeCells('A1:B1');
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: Buffer.from(await book.xlsx.writeBuffer()).toString('base64'),
      }),
    ).rejects.toThrow('merged cells');
    await expect(parseContactFile({ format: 'xlsx', data: '%%%=' })).rejects.toThrow('base64');
  });
  it('bounds expanded ZIP bytes and verifies dishonest entry sizes', async () => {
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({ 'xl/sharedStrings.xml': 'x'.repeat(17 * 1024 * 1024) }),
      }),
    ).rejects.toThrow('16 MiB');
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({ 'xl/sharedStrings.xml': 'x'.repeat(1024 * 1024) }, 1),
      }),
    ).rejects.toThrow('could not be parsed');
  });
  it('rejects XML entities, macros and sparse spreadsheet coordinates before workbook allocation', async () => {
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({ 'xl/workbook.xml': '<!DOCTYPE x [<!ENTITY e "x">]><workbook/>' }),
      }),
    ).rejects.toThrow('XML');
    await expect(
      parseContactFile({ format: 'xlsx', data: archive({ 'xl/vbaProject.bin': 'macro' }) }),
    ).rejects.toThrow('macros');
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/worksheets/sheet1.xml':
            '<worksheet><row r="1000000000"><c r="A1000000000"/></row></worksheet>',
        }),
      }),
    ).rejects.toThrow('5,001');
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/worksheets/sheet1.xml':
            '<worksheet><cols><col min="1" max="1000000000"/></cols></worksheet>',
        }),
      }),
    ).rejects.toThrow('100 columns');
  });
  it('validates mutually exclusive list selection', () => {
    expect(
      contactImportSchema.safeParse({
        source: { format: 'csv', data: 'email\na@x.com' },
        mapping: { email: 'email' },
        list_id: randomUUID(),
        list_name: 'Both',
      }).success,
    ).toBe(false);
  });
  it('rejects entity-encoded allocation coordinates before XML decoding', async () => {
    for (const worksheet of [
      '<worksheet><row r="&#53;00000000"/></worksheet>',
      '<worksheet><row r="2"><c r="&#88;FD2"/></row></worksheet>',
      '<worksheet><cols><col min="1" max="&#49;00000000"/></cols></worksheet>',
      '<worksheet><cols><col min="+1000000000" max="1"/></cols></worksheet>',
    ])
      await expect(
        parseContactFile({
          format: 'xlsx',
          data: archive({ 'xl/worksheets/sheet1.xml': worksheet }),
        }),
      ).rejects.toThrow();
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/workbook.xml':
            '<workbook><sheets><sheet name="A" sheetId="&#49;000000000"/></sheets></workbook>',
        }),
      }),
    ).rejects.toThrow('worksheet IDs');
  });
  it('bounds worksheet and style fan-out and verifies ZIP content checksums', async () => {
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/workbook.xml': '<workbook>' + '<sheet name="A"/>'.repeat(21) + '</workbook>',
        }),
      }),
    ).rejects.toThrow('20 sheets');
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/styles.xml':
            '<styleSheet><cellXfs>' + '<xf/>'.repeat(10001) + '</cellXfs></styleSheet>',
        }),
      }),
    ).rejects.toThrow('style records');
    const broken = Buffer.from(archive({ 'xl/workbook.xml': '<workbook/>' }), 'base64');
    const offset = broken.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    broken.writeUInt32LE(0, offset + 16);
    await expect(
      parseContactFile({ format: 'xlsx', data: broken.toString('base64') }),
    ).rejects.toThrow('checksum');
  });
  it('rejects disguised XML parts and named ranges before workbook hydration', async () => {
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/worksheets/sheet1.xml.extra': '<worksheet><row r="999999999"/></worksheet>',
        }),
      }),
    ).rejects.toThrow('ambiguous XML part');
    await expect(
      parseContactFile({
        format: 'xlsx',
        data: archive({
          'xl/workbook.xml':
            '<workbook><definedNames><definedName name="Audience">Sheet1!$A$1:$XFD$1048576</definedName></definedNames></workbook>',
        }),
      }),
    ).rejects.toThrow('named ranges');
  });
});

describe('tenant-isolated contact imports', () => {
  let db: PGlite, server: PGLiteSocketServer, sql: Sql;
  const tenant = { orgId: randomUUID(), environmentId: randomUUID() };
  const foreign = { orgId: randomUUID(), environmentId: randomUUID() };
  const data = {
    source: {
      format: 'csv' as const,
      data: 'Email,Name,Optout\nA@example.com,A,false\na@example.com,A new,true\nb@example.com,B,false',
    },
    mapping: { Email: 'email', Name: 'first_name', Optout: 'unsubscribed' },
    list_name: 'Launch audience',
  };
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec('SET client_min_messages = error');
    for (const file of readdirSync('packages/db/migrations')
      .sort()
      .filter((v) => v.endsWith('.sql') && !v.startsWith('0000')))
      await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
    await db.query('insert into organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)', [
      tenant.orgId,
      'A',
      'a',
      foreign.orgId,
      'B',
      'b',
    ]);
    await db.query(
      "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$4,'Development')",
      [tenant.environmentId, tenant.orgId, foreign.environmentId, foreign.orgId],
    );
    server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
    await server.start();
    sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
      max: 1,
    }).client;
    sql.options.onnotice = () => undefined;
  }, 30000);
  beforeEach(async () => {
    await sql`truncate contacts,contact_properties,contact_lists,event_outbox cascade`;
  });
  afterAll(async () => {
    await sql.end();
    await server.stop();
    await db.close();
  });
  it('previews without writing, reports errors and bounds the error sample', async () => {
    const input = {
      source: { format: 'csv' as const, data: 'email\na@example.com\n' + 'invalid\n'.repeat(75) },
      mapping: { email: 'email' },
    };
    const preview = await previewContactFile(sql, tenant, input);
    expect(preview.validation).toMatchObject({
      valid: 1,
      error_count: 75,
      duplicates: 0,
      existing: 0,
    });
    expect(preview.validation!.errors).toHaveLength(50);
    expect(preview.validation!.errors[0]!.row).toBe(3);
    expect(await sql`select id from contacts`).toHaveLength(0);
    await expect(
      importContactFile(sql, tenant, { ...input, list_name: 'Never created' }),
    ).rejects.toThrow('75 invalid rows');
    expect(await sql`select id from contacts`).toHaveLength(0);
    expect(await sql`select id from contact_lists`).toHaveLength(0);
  });
  it('imports case-deduplicated contacts, creates/reuses one list and preserves opt-outs', async () => {
    const first = await importContactFile(sql, tenant, data);
    expect(first).toMatchObject({
      imported: 2,
      duplicates: 1,
      created: 2,
      updated: 0,
      skipped_deleted: 0,
      list_name: 'Launch audience',
    });
    expect(await sql`select * from contact_list_members`).toHaveLength(2);
    const next = await importContactFile(sql, tenant, {
      ...data,
      source: { format: 'tsv', data: 'Email\tName\tOptout\na@example.com\tLater\tfalse' },
    });
    expect(next).toMatchObject({ imported: 1, created: 0, updated: 1, list_id: first.list_id });
    expect(await sql`select * from contact_lists`).toHaveLength(1);
    expect(await sql`select * from contact_list_members`).toHaveLength(2);
    expect(
      (await sql`select first_name,unsubscribed from contacts where email='a@example.com'`)[0],
    ).toMatchObject({ first_name: 'Later', unsubscribed: true });
  });
  it('preserves existing names when only email is mapped and skips deleted contacts', async () => {
    const first = await importContactFile(sql, tenant, data);
    await sql`update contacts set deleted_at=now(),unsubscribed=true where email='b@example.com'`;
    const input = {
      source: {
        format: 'json' as const,
        data: JSON.stringify([{ email: 'a@example.com' }, { email: 'b@example.com' }]),
      },
      mapping: { email: 'email' },
      list_name: 'Another list',
    };
    expect(
      (await previewContactFile(sql, tenant, { source: input.source, mapping: input.mapping }))
        .validation,
    ).toMatchObject({
      existing: 1,
      skipped_deleted: 1,
    });
    const result = await importContactFile(sql, tenant, input);
    expect(result).toMatchObject({ imported: 1, updated: 1, skipped_deleted: 1 });
    expect(
      (await sql`select first_name from contacts where email='a@example.com'`)[0]!.first_name,
    ).toBe('A new');
    expect(
      await sql`select * from contact_list_members where list_id=${result.list_id!}`,
    ).toHaveLength(1);
    expect(result.list_id).not.toBe(first.list_id);
  });
  it('validates typed properties before any writes and does not invent property definitions', async () => {
    await withTenant(
      sql,
      tenant,
      (tx) =>
        tx`insert into contact_properties(org_id,environment_id,name,type) values(${tenant.orgId},${tenant.environmentId},'seats','number')`,
    );
    const input = {
      source: {
        format: 'json' as const,
        data: '[{"email":"a@example.com","properties":{"seats":2}},{"email":"b@example.com","properties":{"seats":"not a number"}}]',
      },
      mapping: { email: 'email', 'properties.seats': 'properties.seats' },
    };
    expect((await previewContactFile(sql, tenant, input)).validation).toMatchObject({
      valid: 1,
      error_count: 1,
    });
    await expect(importContactFile(sql, tenant, input)).rejects.toThrow('Invalid value for seats');
    expect(await sql`select * from contacts`).toHaveLength(0);
    await expect(importContactFile(sql, foreign, input)).rejects.toThrow('Define contact property');
  });
  it('rejects cross-tenant lists and membership writes, retaining atomicity', async () => {
    const list = await importContactFile(sql, tenant, data);
    await expect(
      importContactFile(sql, foreign, {
        source: data.source,
        mapping: data.mapping,
        list_id: list.list_id!,
      }),
    ).rejects.toThrow('Contact list not found');
    expect(await withTenant(sql, foreign, (tx) => tx`select * from contacts`)).toHaveLength(0);
    expect(await withTenant(sql, foreign, (tx) => tx`select * from contact_lists`)).toHaveLength(0);
    const contact = (await sql`select id from contacts limit 1`)[0]!;
    await expect(
      withTenant(
        sql,
        foreign,
        (tx) =>
          tx`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${foreign.orgId},${foreign.environmentId},${list.list_id!},${contact.id})`,
      ),
    ).rejects.toThrow();
  });
  it('keeps the legacy CSV function and return shape compatible', async () => {
    expect(
      await importContacts(sql, tenant, 'Email\na@example.com\nA@example.com', { Email: 'email' }),
    ).toEqual({ imported: 1, duplicates: 1 });
    expect(
      await importContacts(sql, tenant, ' Email \nb@example.com', { ' Email ': 'email' }),
    ).toEqual({ imported: 1, duplicates: 0 });
    await expect(
      importContacts(sql, tenant, 'Email\nc@example.com', {
        Email: 'email',
        ' Email ': 'first_name',
      }),
    ).rejects.toThrow('distinct after trimming');
    expect(await sql`select id from contacts where email='c@example.com'`).toHaveLength(0);
  });
});
