import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const devA = '20000000-0000-4000-8000-000000000001';
const prodA = '20000000-0000-4000-8000-000000000002';
const devB = '20000000-0000-4000-8000-000000000003';
async function scoped<T>(
  orgId: string,
  environmentId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await db.exec('BEGIN; SET LOCAL ROLE flare_tenant;');
  try {
    await db.query(
      "select set_config('flare.org_id',$1,true), set_config('flare.environment_id',$2,true)",
      [orgId, environmentId],
    );
    return await operation();
  } finally {
    await db.exec('ROLLBACK');
  }
}
beforeAll(async () => {
  await db.exec(readFileSync('packages/db/migrations/0001_identity.sql', 'utf8'));
  await db.exec(readFileSync('packages/db/migrations/0002_workflows.sql', 'utf8'));
  await db.exec(
    readFileSync('packages/db/migrations/0014_integration_engine_identity.sql', 'utf8'),
  );
  await db.query('insert into organizations (id,name,slug) values ($1,$2,$3),($4,$5,$6)', [
    orgA,
    'A',
    'a',
    orgB,
    'B',
    'b',
  ]);
  await db.query(
    'insert into environments (id,org_id,name) values ($1,$2,$3),($4,$2,$5),($6,$7,$3)',
    [devA, orgA, 'Development', prodA, 'Production', devB, orgB],
  );
  for (const [org, env, name] of [
    [orgA, devA, 'a-dev'],
    [orgA, prodA, 'a-prod'],
    [orgB, devB, 'b-dev'],
  ])
    await db.query(
      "insert into api_keys (org_id,environment_id,name,token_hash,prefix,permission) values ($1,$2,$3,$3,$3,'full_access')",
      [org, env, name],
    );
}, 30_000);
afterAll(() => db.close());
describe('PostgreSQL tenant policies', () => {
  it('isolates keys across organizations AND environments', async () => {
    const rows = await scoped(orgA, devA, () =>
      db.query<{ name: string }>('select name from api_keys'),
    );
    expect(rows.rows.map((row) => row.name)).toEqual(['a-dev']);
  });
  it('prevents cross-tenant writes even when a query omits a predicate', async () => {
    const result = await scoped(orgA, devA, () =>
      db.query("update api_keys set name='stolen' where environment_id=$1 returning id", [devB]),
    );
    expect(result.rows).toEqual([]);
    await expect(
      scoped(orgA, devA, () =>
        db.query(
          "insert into api_keys (org_id,environment_id,name,token_hash,prefix,permission) values ($1,$2,'bad','bad','bad','full_access')",
          [orgB, devB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it('rejects foreign environment references at the database boundary', async () => {
    await expect(
      db.query(
        "insert into api_keys (org_id,environment_id,name,token_hash,prefix,permission) values ($1,$2,'bad','bad','bad','full_access')",
        [orgA, devB],
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it('defaults to no access without a tenant context', async () => {
    await db.exec('BEGIN; SET LOCAL ROLE flare_tenant;');
    try {
      expect((await db.query('select * from api_keys')).rows).toEqual([]);
    } finally {
      await db.exec('ROLLBACK');
    }
  });
});

it('prevents duplicate native integration mappings within an environment', async () => {
  const insert = (env: string, identifier: string) =>
    db.query(
      "insert into integrations(org_id,environment_id,identifier,provider,channel,name,credential_cipher,novu_id) values($1,$2,$3,'novu','in_app','Inbox','encrypted','engine-inbox')",
      [orgA, env, identifier],
    );
  await insert(devA, 'inbox');
  await insert(prodA, 'inbox');
  await expect(insert(devA, 'duplicate')).rejects.toThrow(/integrations_engine_identity/);
});
