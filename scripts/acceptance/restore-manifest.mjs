// Executed as a one-shot verifier, never as an API/worker, on either isolated stack.
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connectDatabase, withTenant } from '../../packages/db/dist/index.js';
import { decrypt } from '../../packages/shared/dist/index.js';
import { recordRestoreFailure } from './restore-diagnostics.mjs';
const require = createRequire(new URL('../../packages/mail/package.json', import.meta.url));
const {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
assert.equal(process.env.FLARE_ACCEPTANCE, 'true');
const mode = process.argv[2];
assert.ok(['capture', 'verify'].includes(mode));
const { client: sql } = connectDatabase(process.env.DATABASE_URL);
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const hash = (input) => createHash('sha256').update(input).digest('hex');
let phase = 'postgres-fingerprints';
try {
  const tables =
    await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  const data = {};
  for (const { tablename } of tables) {
    const rows =
      await sql`select to_jsonb(t)::text as value from public.${sql(tablename)} t order by 1`;
    data[tablename] = { count: rows.length, hash: hash(rows.map((r) => r.value).join('\n')) };
  }
  phase = 'postgres-fixtures';
  for (const required of [
    'flare_migrations',
    'organizations',
    'environments',
    'domains',
    'messages',
    'inbound_messages',
    'workflows',
    'workflow_runs',
    'layouts',
    'layout_versions',
    'translations',
    'translation_versions',
    'publication_operations',
    'publication_items',
  ])
    assert.ok(data[required]?.count > 0, `Restore fixture needs nonempty ${required}`);
  phase = 'postgres-schema';
  const policies =
    await sql`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`;
  const constraints =
    await sql`select c.relname,k.conname,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.conname`;
  const permissions =
    await sql`select grantee,table_name,privilege_type from information_schema.table_privileges where table_schema='public' and grantee in ('flare','flare_tenant') order by grantee,table_name,privilege_type`;
  const rls =
    await sql`select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by relname`;
  phase = 'tenant-role';
  const [role] =
    await sql`select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='flare_tenant'`;
  assert.deepEqual(role, { rolcanlogin: false, rolsuper: false, rolbypassrls: false });
  const [domain] = await sql`select id,org_id,environment_id from domains limit 1`;
  await withTenant(
    sql,
    { orgId: domain.org_id, environmentId: domain.environment_id },
    async (tx) => {
      phase = 'tenant-visible';
      assert.ok((await tx`select id from domains`).length > 0);
      phase = 'tenant-isolation';
      await tx`select set_config('flare.org_id',${randomUUID()},true)`;
      assert.equal((await tx`select id from domains`).length, 0, 'Restored tenant isolation');
    },
  );
  phase = 'tenant-write-rollback';
  const probeIdentifier = `restore-probe-${randomUUID()}`;
  const rollback = new Error('rollback-only restore probe');
  await assert.rejects(
    withTenant(sql, { orgId: domain.org_id, environmentId: domain.environment_id }, async (tx) => {
      const [written] =
        await tx`insert into workflows(org_id,environment_id,identifier,definition) values(${domain.org_id},${domain.environment_id},${probeIdentifier},'{}') returning id`;
      assert.ok(written.id, 'Restored default UUID and tenant insert permission');
      assert.equal(
        (await tx`select id from workflows where identifier=${probeIdentifier}`).length,
        1,
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
  assert.equal(
    (await sql`select id from workflows where identifier=${probeIdentifier}`).length,
    0,
    'Restore probe transaction rolled back',
  );
  phase = 'tenant-composite-foreign-key';
  // A real but differently scoped parent must never be accepted, even by the privileged connection.
  const [foreignEnvironment] =
    await sql`select org_id,id from environments where id<>${domain.environment_id} limit 1`;
  assert.ok(foreignEnvironment, 'Composite key probe needs another environment');
  await assert.rejects(
    sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(gen_random_uuid(),${foreignEnvironment.org_id},${foreignEnvironment.id},${domain.id},'{}','restore-probe@example.invalid','queued')`,
    (error) => error.code === '23503',
  );
  phase = 'tenant-restored-resources';
  for (const table of [
    'messages',
    'inbound_messages',
    'workflows',
    'workflow_runs',
    'layout_versions',
    'translation_versions',
  ]) {
    const [scope] = await sql`select org_id,environment_id from ${sql(table)} limit 1`;
    assert.ok(scope, `Restore isolation fixture: ${table}`);
    await withTenant(
      sql,
      { orgId: scope.org_id, environmentId: scope.environment_id },
      async (tx) => {
        const visible = await tx`select org_id,environment_id from ${tx(table)}`;
        assert.ok(
          visible.length > 0 &&
            visible.every(
              (row) => row.org_id === scope.org_id && row.environment_id === scope.environment_id,
            ),
          `Restored tenant scope: ${table}`,
        );
        await tx`select set_config('flare.org_id',${randomUUID()},true)`;
        assert.equal(
          (await tx`select org_id from ${tx(table)}`).length,
          0,
          `Restored foreign tenant isolation: ${table}`,
        );
      },
    );
  }
  phase = 'dkim-decryption';
  for (const row of await sql`select * from domains`) {
    createPrivateKey(
      decrypt(
        row.dkim_private_cipher,
        process.env.FLARE_ENCRYPTION_KEY,
        `${row.org_id}/${row.environment_id}`,
      ),
    );
  }
  phase = 'novu-manifest';
  const native = JSON.parse(readFileSync(`/restore/mongo-${mode}.json`, 'utf8'));
  let mappedWorkflows = 0;
  for (const row of await sql`select * from environments where novu_key_cipher is not null`) {
    phase = 'novu-decryption';
    assert.ok(
      decrypt(row.novu_key_cipher, process.env.FLARE_ENCRYPTION_KEY, `${row.org_id}/${row.id}`)
        .length > 0,
    );
    phase = 'novu-environment-map';
    const environment = native.environments?.documents.find(
      (e) => e.identifier === row.novu_application_id,
    );
    assert.ok(environment, 'Flare environment must resolve to restored Novu environment');
    phase = 'novu-workflow-map';
    for (const workflow of await sql`select identifier from workflows where org_id=${row.org_id} and environment_id=${row.id}`) {
      assert.ok(
        native.notificationtemplates?.documents.some(
          (w) =>
            w._environmentId.$oid === environment._id.$oid &&
            w.triggers?.some((t) => t.identifier === workflow.identifier),
        ),
        'Flare workflow must resolve to restored Novu workflow in the same environment',
      );
      mappedWorkflows++;
    }
  }
  phase = 'novu-workflow-fixture';
  assert.ok(mappedWorkflows > 0, 'Restore must exercise workflow mappings');
  phase = 'object-buckets';
  const buckets = (await s3.send(new ListBucketsCommand({}))).Buckets.map((b) => b.Name).sort();
  assert.ok(buckets.includes('flare') && buckets.includes('novu'));
  const objects = [];
  for (const Bucket of buckets) {
    phase = 'object-upload';
    if (mode === 'capture')
      await s3.send(
        new PutObjectCommand({
          Bucket,
          Key: 'acceptance-restore/canary.bin',
          Body: Buffer.from([0, 255, 1, 128, 13, 10]),
          ContentType: 'application/octet-stream',
          Metadata: { purpose: 'isolated-restore-drill' },
        }),
      );
    let ContinuationToken;
    do {
      phase = 'object-list';
      const page = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken }));
      for (const { Key } of page.Contents ?? []) {
        phase = 'object-download';
        const response = await s3.send(new GetObjectCommand({ Bucket, Key }));
        phase = 'object-size';
        assert.ok(response.ContentLength <= 30 * 1024 * 1024, 'Acceptance object size bound');
        phase = 'object-download';
        const body = await response.Body.transformToByteArray();
        objects.push({
          Bucket,
          Key,
          hash: hash(body),
          type: response.ContentType,
          metadata: response.Metadata,
          etag: response.ETag,
          size: response.ContentLength,
        });
      }
      ContinuationToken = page.NextContinuationToken;
    } while (ContinuationToken);
  }
  objects.sort((a, b) => `${a.Bucket}/${a.Key}`.localeCompare(`${b.Bucket}/${b.Key}`));
  phase = 'object-fixture';
  assert.ok(objects.some((o) => o.Bucket === 'flare' && o.Key !== 'acceptance-restore/canary.bin'));
  const manifest = {
    data,
    policies: [...policies],
    constraints: [...constraints],
    permissions: [...permissions],
    rls: [...rls],
    role,
    objects,
  };
  phase = 'manifest-write';
  if (mode === 'capture')
    writeFileSync('/restore/manifest.json', JSON.stringify(manifest), { mode: 0o600 });
  else {
    // Do not print assertion diffs containing object paths, raw database rows, or credentials.
    const expected = JSON.parse(readFileSync('/restore/manifest.json', 'utf8'));
    for (const key of [
      'data',
      'policies',
      'constraints',
      'permissions',
      'rls',
      'role',
      'objects',
    ]) {
      phase = `compare-${key}`;
      assert.ok(
        JSON.stringify(manifest[key]) === JSON.stringify(expected[key]),
        'Restored manifest section must match',
      );
    }
    console.log(
      `Restore verified: ${tables.length} PostgreSQL tables and ${objects.length} objects, tenant isolation and decryptable DKIM/Novu secrets.`,
    );
  }
} catch (error) {
  recordRestoreFailure('/diagnostics/failure.json', mode, phase, error);
  throw error;
} finally {
  await sql.end();
  s3.destroy();
}
