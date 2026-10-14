import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import { workflowSchema } from '../../packages/shared/src/workflows.js';
import {
  compileWorkflowContent,
  resolveDictionary,
  dictionarySchema,
  layoutSchema,
} from '../../packages/platform/src/content.js';
import examples from './cases/content.json';
import { cases } from './helpers.js';

type ContentCase = {
  id: string;
  criterion: string;
  controls: Record<string, unknown>;
  layout?: { html: string; translations: boolean; version: number };
  base: Record<string, unknown>;
  locale: Record<string, unknown>;
  error?: string;
  expected?: {
    controls: Record<string, unknown>;
    resolved: Record<string, unknown>;
    layoutVersion?: number;
  };
};
const tenant = { orgId: randomUUID(), environmentId: randomUUID() };
let db: PGlite, server: PGLiteSocketServer, sql: Sql;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  // PGlite already has gen_random_uuid; the production pgcrypto extension is not needed here.
  for (const name of readdirSync('packages/db/migrations').sort()) {
    if (name.endsWith('.sql') && !name.startsWith('0000')) {
      await db.exec(readFileSync(`packages/db/migrations/${name}`, 'utf8'));
    }
  }
  await db.query("insert into organizations(id,name,slug) values($1,'Eval','eval')", [
    tenant.orgId,
  ]);
  await db.query("insert into environments(id,org_id,name) values($1,$2,'Development')", [
    tenant.environmentId,
    tenant.orgId,
  ]);
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
});
beforeEach(async () => {
  await sql`truncate layouts cascade`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Content behavior evals', () => {
  for (const example of cases(examples as ContentCase[])) {
    it(`${example.id}: ${example.criterion}`, async () => {
      const evaluate = async () => {
        const base = dictionarySchema.parse(example.base);
        const locale = dictionarySchema.parse(example.locale);
        if (example.layout) {
          const layout = layoutSchema.parse({
            identifier: 'brand',
            name: 'Brand',
            html: example.layout.html,
            translations: example.layout.translations,
          });
          const [saved] =
            await sql`insert into layouts(org_id,environment_id,identifier,name,current_version)
            values(${tenant.orgId},${tenant.environmentId},'brand','Brand',${example.layout.version}) returning id`;
          await sql`insert into layout_versions(org_id,environment_id,layout_id,version,html,translations)
            values(${tenant.orgId},${tenant.environmentId},${saved!.id},${example.layout.version},${layout.html},${layout.translations})`;
        }
        const source = workflowSchema.parse({
          workflowId: 'eval-content',
          name: 'Content eval',
          steps: [
            { stepId: 'email', name: 'Email', type: 'email', controlValues: example.controls },
          ],
        });
        const original = structuredClone(source);
        const compiled = await withTenant(sql, tenant, (tx) =>
          compileWorkflowContent(tx, tenant, source),
        );
        expect(source, `${example.id}: compilation must not mutate editable input`).toEqual(
          original,
        );
        return { compiled, resolved: resolveDictionary(compiled.dependencies, base, locale) };
      };

      if (example.error !== undefined) {
        await expect(evaluate(), example.id).rejects.toThrow(example.error);
        return;
      }
      const result = await evaluate();
      expect(result.compiled.definition.steps[0]!.controlValues, example.id).toEqual(
        example.expected!.controls,
      );
      expect(result.resolved, example.id).toEqual(example.expected!.resolved);
      if (example.expected!.layoutVersion !== undefined) {
        expect(result.compiled.source.steps[0]!.controlValues.layoutVersion, example.id).toBe(
          example.expected!.layoutVersion,
        );
        expect(
          result.compiled.dependencies.layouts.map(({ identifier, version }) => ({
            identifier,
            version,
          })),
          example.id,
        ).toEqual([{ identifier: 'brand', version: example.expected!.layoutVersion }]);
      }
    });
  }
});
