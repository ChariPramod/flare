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
const principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'session' as const,
  role: 'owner' as const,
  production: false,
};
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
  await sql`truncate publication_operations,workflows,layouts,email_templates cascade`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
import { workflowSchema } from '../../packages/shared/src/index.js';
import { MailError } from '../../packages/mail/dist/index.js';
import {
  compileWorkflowContent,
  translationPayload,
  emptyDependencies,
} from '../../packages/platform/src/content.js';
import {
  publicationDiff,
  createPublication,
  advancePublication,
  syncPublicationWorkflow,
} from '../../packages/platform/src/publication.js';
async function setup() {
  const [template] =
    await sql`insert into email_templates(org_id,environment_id,identifier,name) values(${org},${env},'welcome-email','Welcome email') returning id`;
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${org},${env},${template!.id},1,'{{t.subject}}','<h1>{{t.greeting}}</h1>')`;
  const [layout] =
    await sql`insert into layouts(org_id,environment_id,identifier,name) values(${org},${env},'brand','Brand') returning id`;
  await sql`insert into layout_versions(org_id,environment_id,layout_id,version,html) values(${org},${env},${layout!.id},1,'<main>{{{body}}}</main>')`;
  const input = workflowSchema.parse({
    workflowId: 'welcome',
    name: 'Welcome',
    steps: [
      {
        stepId: 'mail',
        name: 'Mail',
        type: 'email',
        controlValues: { templateId: String(template!.id), layoutIdentifier: 'brand' },
      },
    ],
  });
  const compiled = await withTenant(sql, principal, (tx) =>
    compileWorkflowContent(tx, principal, input),
  );
  await sql`insert into workflows(org_id,environment_id,identifier,definition,source_definition,content_dependencies) values(${org},${env},'welcome',${sql.json(compiled.definition)},${sql.json(compiled.source)},${sql.json(compiled.dependencies)})`;
  await sql`insert into translations(org_id,environment_id,workflow_identifier,locale) values(${org},${env},'welcome','en_US')`;
  await sql`insert into translation_versions(org_id,environment_id,workflow_identifier,locale,version,entries) values(${org},${env},'welcome','en_US',1,${sql.json({ subject: 'Welcome', greeting: 'Hello' })})`;
  return { compiled, templateId: String(template!.id) };
}
it('publishes pinned dependencies, remaps template IDs, resolves dictionaries and leaves unrelated data isolated', async () => {
  const { compiled, templateId } = await setup(),
    diff = await publicationDiff(sql, principal);
  const operation = await createPublication(sql, principal, {
    workflows: ['welcome'],
    diff_token: diff.diff_token,
  });
  const publish = vi.fn(async () => undefined);
  await advancePublication(sql, operation.id, publish);
  expect(publish).toHaveBeenCalledTimes(1);
  const [target] = await withTenant(
    sql,
    { ...principal, environmentId: otherEnv },
    (tx) => tx`select * from workflows where identifier='welcome'`,
  );
  expect(target!.definition).toEqual(compiled.definition);
  expect(target!.publication_blocked).toBe(false);
  const targetId = target!.source_definition.steps[0].controlValues.templateId;
  expect(targetId).not.toBe(templateId);
  expect(
    await withTenant(
      sql,
      { ...principal, environmentId: otherEnv },
      (tx) => tx`select id from email_templates where id=${targetId}`,
    ),
  ).toHaveLength(1);
  expect(
    await withTenant(sql, { ...principal, environmentId: otherEnv }, (tx) =>
      translationPayload(tx, 'welcome', compiled.dependencies, 'fr_FR'),
    ),
  ).toMatchObject({ html_greeting: 'Hello' });
  expect(
    (await sql`select status from publication_operations where id=${operation.id}`)[0]!.status,
  ).toBe('completed');
  await advancePublication(sql, operation.id, publish);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(
    await withTenant(
      sql,
      { orgId: otherOrg, environmentId: foreignEnv },
      (tx) => tx`select * from publication_operations`,
    ),
  ).toHaveLength(0);
  expect(
    await withTenant(
      sql,
      { ...principal, environmentId: otherEnv },
      (tx) => tx`select * from subscribers`,
    ),
  ).toHaveLength(0);
});
it('rejects stale diffs, forbidden roles and overlapping publications', async () => {
  await setup();
  const diff = await publicationDiff(sql, principal);
  await sql`update workflows set revision=revision+1 where org_id=${org} and environment_id=${env}`;
  await expect(
    createPublication(sql, principal, { workflows: ['welcome'], diff_token: diff.diff_token }),
  ).rejects.toThrow('stale');
  await expect(
    createPublication(sql, { ...principal, role: 'developer' }, { workflows: ['welcome'] }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    createPublication(
      sql,
      { ...principal, kind: 'api_key', permission: 'full_access' },
      { workflows: ['welcome'] },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    createPublication(
      sql,
      { ...principal, production: true, environmentId: otherEnv },
      { workflows: ['welcome'] },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await createPublication(sql, principal, { workflows: ['welcome'] });
  await expect(createPublication(sql, principal, { layouts: ['brand'] })).rejects.toThrow(
    'Finish or retry',
  );
});
it('recovers a remote-success/local-failure window and clears the production trigger guard only after reconciliation', async () => {
  const { compiled } = await setup();
  await sql`insert into workflows(org_id,environment_id,identifier,definition,source_definition) values(${org},${otherEnv},'welcome',${sql.json({ ...compiled.definition, name: 'Old' })},${sql.json({ ...compiled.source, name: 'Old' })})`;
  const operation = await createPublication(sql, principal, { workflows: ['welcome'] });
  let remote = false;
  await expect(
    advancePublication(sql, operation.id, async () => {
      remote = true;
      throw new Error('lost response');
    }),
  ).rejects.toThrow('lost response');
  expect(remote).toBe(true);
  const [pending] =
    await sql`select definition,publication_blocked from workflows where environment_id=${otherEnv}`;
  expect(pending!.definition.name).toBe('Old');
  expect(pending!.publication_blocked).toBe(true);
  await sql`update publication_items set next_attempt_at=now() where operation_id=${operation.id}`;
  await advancePublication(sql, operation.id, async () => {
    expect(remote).toBe(true);
  });
  expect(
    (
      await sql`select definition,publication_blocked from workflows where environment_id=${otherEnv}`
    )[0],
  ).toMatchObject({ definition: { name: 'Welcome' }, publication_blocked: false });
  expect(
    (
      await sql`select status,attempts from publication_items where operation_id=${operation.id}`
    )[0],
  ).toMatchObject({ status: 'completed', attempts: 2 });
  await advancePublication(sql, operation.id, async () => {
    throw new Error('should not run');
  });
  expect(
    (await sql`select publication_blocked from workflows where environment_id=${otherEnv}`)[0]!
      .publication_blocked,
  ).toBe(false);
});
it('records permanent publication failures and prevents silent immutable-version replacement', async () => {
  await setup();
  const [layout] =
    await sql`insert into layouts(org_id,environment_id,identifier,name) values(${org},${otherEnv},'brand','Other') returning id`;
  await sql`insert into layout_versions(org_id,environment_id,layout_id,version,html) values(${org},${otherEnv},${layout!.id},1,'<aside>{{{body}}}</aside>')`;
  const operation = await createPublication(sql, principal, { layouts: ['brand'] });
  await expect(advancePublication(sql, operation.id, async () => undefined)).rejects.toThrow(
    'version conflict',
  );
  expect(
    (await sql`select status from publication_operations where id=${operation.id}`)[0]!.status,
  ).toBe('failed');
});
it('reconciles native engine state after an ambiguous update response without recreating a workflow', async () => {
  const workflow = workflowSchema.parse({ workflowId: 'hello', name: 'Hello', steps: [] });
  let remote: unknown = null,
    writes = 0,
    failVerification = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST' || init.method === 'PUT') {
        writes++;
        remote = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ data: remote }), { status: 201 });
      }
      if (remote && failVerification) {
        failVerification = false;
        throw new MailError(503, 'Connection lost');
      }
      return new Response(JSON.stringify({ data: remote }), { status: remote ? 200 : 404 });
    }),
  );
  try {
    await expect(
      syncPublicationWorkflow(
        'https://novu.example.test',
        'test-key',
        workflow,
        emptyDependencies(),
      ),
    ).rejects.toThrow('Connection lost');
    await syncPublicationWorkflow(
      'https://novu.example.test',
      'test-key',
      workflow,
      emptyDependencies(),
    );
    expect(writes).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('allows a corrected replacement to supersede an irreparable failed snapshot without losing unfinished resources', async () => {
  await setup();
  const operation = await createPublication(sql, principal, {
    layouts: ['brand'],
    workflows: ['welcome'],
  });
  await expect(
    advancePublication(sql, operation.id, async () => undefined),
  ).resolves.toBeUndefined();
  await expect(
    advancePublication(sql, operation.id, async () => {
      throw new MailError(422, 'Invalid engine configuration');
    }),
  ).rejects.toThrow('configuration');
  await expect(createPublication(sql, principal, { layouts: ['brand'] })).rejects.toThrow(
    'every unfinished',
  );
  const replacement = await createPublication(sql, principal, { workflows: ['welcome'] });
  expect(
    (await sql`select status from publication_operations where id=${operation.id}`)[0]!.status,
  ).toBe('superseded');
  await advancePublication(sql, replacement.id, async () => undefined);
  expect(
    (await sql`select status from publication_operations where id=${replacement.id}`)[0]!.status,
  ).toBe('completed');
});
