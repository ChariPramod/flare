import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID(),
  foreignEnv = randomUUID();
const principal = { orgId: org, environmentId: env };
let sql: Sql, db: PGlite, server: PGLiteSocketServer;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((v) => v.endsWith('.sql') && !v.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')", [
    org,
    otherOrg,
  ]);
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$2,'Production'),($4,$5,'Development')",
    [env, org, otherEnv, foreignEnv, otherOrg],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate workflows,layouts cascade`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
import { workflowSchema } from '../../packages/shared/src/index.js';
import {
  compileWorkflowContent,
  translationPayload,
  layoutSchema,
  dictionarySchema,
  enginePayloadSchema,
  resolveDictionary,
} from '../../packages/platform/src/content.js';
import { Ajv } from '../../apps/api/node_modules/ajv/dist/ajv.js';
const source = () =>
  workflowSchema.parse({
    workflowId: 'welcome',
    name: 'Welcome',
    payloadSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    },
    steps: [
      {
        stepId: 'mail',
        name: 'Mail',
        type: 'email',
        controlValues: {
          subject: '{{t.subject}}',
          body: '<h1>{{t.greeting}}</h1><p>{{payload.name}}</p>',
          layoutIdentifier: 'brand',
        },
      },
    ],
  });
async function setup() {
  await sql`insert into workflows(org_id,environment_id,identifier,definition) values(${org},${env},'welcome',${sql.json(source())})`;
  const [layout] =
    await sql`insert into layouts(org_id,environment_id,identifier,name) values(${org},${env},'brand','Brand') returning id`;
  await sql`insert into layout_versions(org_id,environment_id,layout_id,version,html,translations) values(${org},${env},${layout!.id},1,'<main>{{{body}}}<footer>{{t.footer}}</footer></main>',true)`;
  await dictionary('en_US', { subject: 'Welcome', greeting: 'Hello', footer: 'Company' });
  return String(layout!.id);
}
async function dictionary(locale: string, entries: Record<string, string>) {
  const [row] =
    await sql`insert into translations(org_id,environment_id,workflow_identifier,locale) values(${org},${env},'welcome',${locale}) on conflict(org_id,environment_id,workflow_identifier,locale) do update set current_version=translations.current_version+1 returning current_version`;
  await sql`insert into translation_versions(org_id,environment_id,workflow_identifier,locale,version,entries) values(${org},${env},'welcome',${locale},${row!.current_version},${sql.json(entries)})`;
}
it('pins source layout versions while preserving payload variables and snapshotting dependencies', async () => {
  const layout = await setup();
  const first = await withTenant(sql, principal, (tx) =>
    compileWorkflowContent(tx, principal, source()),
  );
  expect(first.source.steps[0]!.controlValues.layoutVersion).toBe(1);
  expect(first.definition.steps[0]!.controlValues.body).toBe(
    '<main><h1>{{payload.__flare_i18n.html_greeting}}</h1><p>{{payload.name}}</p><footer>{{payload.__flare_i18n.html_footer}}</footer></main>',
  );
  expect(first.definition.steps[0]!.controlValues).not.toHaveProperty('layoutIdentifier');
  expect(first.definition.steps[0]!.controlValues).toMatchObject({
    editorType: 'html',
    layoutId: null,
  });
  expect(first.source.steps[0]!.controlValues).not.toHaveProperty('editorType');
  await sql`insert into layout_versions(org_id,environment_id,layout_id,version,html,translations) values(${org},${env},${layout},2,'<article>{{{body}}}</article>',false)`;
  await sql`update layouts set current_version=2 where id=${layout}`;
  const repeated = await withTenant(sql, principal, (tx) =>
    compileWorkflowContent(tx, principal, first.source),
  );
  expect(repeated).toEqual(first);
  expect(
    (await withTenant(sql, principal, (tx) => compileWorkflowContent(tx, principal, source())))
      .source.steps[0]!.controlValues.layoutVersion,
  ).toBe(2);
});
it('uses HTML for Flare email while preserving explicitly requested native block content', async () => {
  const workflow = workflowSchema.parse({
    workflowId: 'formats',
    name: 'Formats',
    steps: [
      {
        stepId: 'html',
        name: 'HTML',
        type: 'email',
        controlValues: { subject: 'HTML', body: '<p>Hello</p>' },
      },
      {
        stepId: 'block',
        name: 'Block',
        type: 'email',
        controlValues: {
          subject: 'Block',
          body: '{"type":"doc","content":[]}',
          editorType: 'block',
        },
      },
    ],
  });
  const result = await withTenant(sql, principal, (tx) =>
    compileWorkflowContent(tx, principal, workflow),
  );
  expect(result.definition.steps.map((step) => step.controlValues.editorType)).toEqual([
    'html',
    'block',
  ]);
  expect(result.source).toEqual(workflow);
});
it('resolves missing locales and keys, escapes HTML and keeps previously resolved values unchanged', async () => {
  await setup();
  await dictionary('fr_FR', { greeting: 'Bonjour <ami>' });
  const compiled = await withTenant(sql, principal, (tx) =>
    compileWorkflowContent(tx, principal, source()),
  );
  const values = await withTenant(sql, principal, (tx) =>
    translationPayload(tx, 'welcome', compiled.dependencies, 'fr_FR'),
  );
  expect(values).toEqual({
    text_subject: 'Welcome',
    html_greeting: 'Bonjour &lt;ami&gt;',
    html_footer: 'Company',
  });
  const missing = await withTenant(sql, principal, (tx) =>
    translationPayload(tx, 'welcome', compiled.dependencies, 'de_DE'),
  );
  expect(missing!.html_greeting).toBe('Hello');
  await dictionary('fr_FR', { greeting: 'Salut' });
  expect(values!.html_greeting).toBe('Bonjour &lt;ami&gt;');
  expect(
    (await withTenant(sql, principal, (tx) =>
      translationPayload(tx, 'welcome', compiled.dependencies, 'fr_FR'),
    ))!.html_greeting,
  ).toBe('Salut');
  expect(() => resolveDictionary(compiled.dependencies, {}, { greeting: 'Only French' })).toThrow(
    'Missing en_US',
  );
  const ajv = new Ajv();
  expect(ajv.validate(source().payloadSchema, { name: 'Ada', __flare_i18n: values })).toBe(false);
  expect(
    ajv.validate(enginePayloadSchema(source().payloadSchema, compiled.dependencies), {
      name: 'Ada',
      __flare_i18n: values,
    }),
  ).toBe(true);
});
it('rejects unsafe layout variables, missing body markers, dictionary directives and reserved source fields', async () => {
  for (const html of [
    '<main/>',
    '{{{body}}}{{{body}}}',
    '{{{body}}}{{payload.secret}}',
    '{{{body}}}{% include "x" %}',
    '{{{body}}}{{t.footer}}',
  ])
    expect(layoutSchema.safeParse({ identifier: 'brand', name: 'Brand', html }).success).toBe(
      false,
    );
  expect(
    layoutSchema.safeParse({
      identifier: 'brand',
      name: 'Brand',
      html: '{{{body}}}{{t.footer}}',
      translations: true,
    }).success,
  ).toBe(true);
  expect(dictionarySchema.safeParse({ greeting: '{{payload.secret}}' }).success).toBe(false);
  const workflow = source();
  workflow.steps[0]!.controlValues.body = '{{payload.__flare_i18n.html_secret}}';
  await expect(
    withTenant(sql, principal, (tx) => compileWorkflowContent(tx, principal, workflow)),
  ).rejects.toThrow('reserved');
});
it('isolates content by organization and environment, and rejects foreign layout references', async () => {
  await setup();
  await expect(
    withTenant(sql, principal, (tx) => tx`update layout_versions set html='changed'`),
  ).rejects.toThrow();
  await expect(
    withTenant(sql, principal, (tx) => tx`delete from translation_versions`),
  ).rejects.toThrow();
  expect(
    await withTenant(
      sql,
      { orgId: org, environmentId: otherEnv },
      (tx) => tx`select * from layouts`,
    ),
  ).toHaveLength(0);
  expect(
    await withTenant(
      sql,
      { orgId: otherOrg, environmentId: foreignEnv },
      (tx) => tx`select * from translation_versions`,
    ),
  ).toHaveLength(0);
  await expect(
    withTenant(sql, { orgId: org, environmentId: otherEnv }, (tx) =>
      compileWorkflowContent(tx, { orgId: org, environmentId: otherEnv }, source()),
    ),
  ).rejects.toThrow('not found');
});

it('accepts locale-specific durable trigger snapshots and replays idempotency after dictionaries change', async () => {
  await setup();
  await dictionary('fr_FR', { greeting: 'Bonjour' });
  const compiled = await withTenant(sql, principal, (tx) =>
    compileWorkflowContent(tx, principal, source()),
  );
  await sql`update workflows set definition=${sql.json(compiled.definition)},source_definition=${sql.json(compiled.source)},content_dependencies=${sql.json(compiled.dependencies)} where identifier='welcome'`;
  vi.doMock('../../apps/api/src/context.js', () => ({
    sql,
    config: {},
    parse: (schema: { parse: (v: unknown) => unknown }, value: unknown) => schema.parse(value),
  }));
  vi.doMock('../../apps/api/src/auth.js', () => ({ Access: () => () => undefined }));
  vi.doMock('../../apps/api/src/identity.js', () => ({ audit: async () => undefined }));
  vi.doMock('../../apps/api/src/novu.js', () => ({
    novuKey: async () => 'configured',
    novu: async () => ({}),
  }));
  const { WorkflowController } = await import('../../apps/api/src/workflows.js');
  const controller = new WorkflowController();
  const request = {
    principal: {
      ...principal,
      actorId: randomUUID(),
      role: 'developer' as const,
      kind: 'api_key' as const,
      permission: 'full_access' as const,
      production: false,
    },
    headers: { 'idempotency-key': 'localized-trigger' },
  };
  const input = {
    name: 'welcome',
    to: [
      { subscriberId: 'english', locale: 'en_US' },
      { subscriberId: 'french', locale: 'fr_FR' },
    ],
    payload: { name: 'Ada' },
  };
  const result = await controller.trigger(request, input);
  expect(result.ids).toHaveLength(2);
  const runs = await sql`select payload from workflow_runs where id in ${sql(result.ids)}`;
  expect(runs.map((r) => r.payload.payload.__flare_i18n.html_greeting).sort()).toEqual([
    'Bonjour',
    'Hello',
  ]);
  await dictionary('fr_FR', { greeting: 'Changed' });
  expect(await controller.trigger(request, input)).toEqual(result);
  expect(
    (await sql`select payload from workflow_runs where id in ${sql(result.ids)}`)
      .map((r) => r.payload.payload.__flare_i18n.html_greeting)
      .sort(),
  ).toEqual(['Bonjour', 'Hello']);
  await expect(
    controller.trigger(
      { ...request, headers: {} },
      { ...input, payload: { name: 'Ada', __flare_i18n: { text_subject: 'injected' } } },
    ),
  ).rejects.toThrow('reserved');
  await expect(
    controller.trigger({ ...request, headers: {} }, { ...input, payload: { unknown: true } }),
  ).rejects.toThrow('Payload');
});
