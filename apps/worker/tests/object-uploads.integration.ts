import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { connectDatabase, withTenant } from '@flare/db';
import type { Transaction } from '@flare/db';
import { objectStore, putManagedObject, sweepObjectUploads } from '@flare/mail';
import { integrationTargets } from './targets.mjs';

// Match the destructive integration runner's exact disposable target checks.
const { databaseUrl } = integrationTargets();
const sql = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 2 }).client;
const orgId = randomUUID(),
  environmentId = randomUUID(),
  domainId = randomUUID();
const tenant = { orgId, environmentId };
const prefix = `${orgId}/${environmentId}/`;
const fixtureObjects = new Set<string>();
const content = Buffer.from('Disposable upload lifecycle fixture.');
let store: ReturnType<typeof objectStore>;
const environment = {
  S3_ENDPOINT: 'http://127.0.0.1:19000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'flare-test',
  S3_ACCESS_KEY: 'flare-test',
  S3_SECRET_KEY: 'local-test-only',
};
function fixtureKey() {
  const key = `${prefix}${randomUUID()}/message.eml`;
  fixtureObjects.add(key);
  return key;
}
async function reference(tx: Transaction, key: string) {
  await tx`insert into messages(id,org_id,environment_id,domain_id,request,mime_key,envelope_from,status) values(${randomUUID()},${orgId},${environmentId},${domainId},'{}',${key},'sender@example.com','queued')`;
}
async function due(key: string) {
  await observer`update object_uploads set next_check_at=now()-interval '1 hour' where object_key=${key}`;
}
async function absent(key: string) {
  await expect(store.get(key, 1024)).rejects.toMatchObject({ name: 'NoSuchKey' });
}
function signal() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
beforeAll(async () => {
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  store = objectStore();
  sql.options.onnotice = () => undefined;
  observer.options.onnotice = () => undefined;
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await sql`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await sql.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await sql`insert into organizations(id,name,slug) values(${orgId},'Object journal',${`object-journal-${orgId}`})`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Development')`;
  await sql`insert into domains(id,org_id,environment_id,name,dkim_selector,dkim_public,dkim_private_cipher) values(${domainId},${orgId},${environmentId},'example.com','fixture','fixture','fixture')`;
  // Test-only clock shortcut: do not modify operation claims or production grace periods.
  await sql.unsafe(`CREATE FUNCTION fixture_due_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.next_check_at=now()-interval '1 hour'; RETURN NEW; END $$;
    CREATE TRIGGER fixture_due_upload BEFORE INSERT ON object_uploads FOR EACH ROW EXECUTE FUNCTION fixture_due_upload();`);
  await store.ready();
});
afterAll(async () => {
  try {
    for (const key of fixtureObjects) {
      if (!key.startsWith(prefix)) throw new Error('Refusing non-fixture object cleanup');
      await store.remove(key);
    }
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } finally {
      await observer.end({ timeout: 5 });
      vi.unstubAllEnvs();
    }
  }
});

it('independently commits intents with the only owning connection busy and skips live upload locks', async () => {
  const key = fixtureKey(),
    written = signal(),
    release = signal();
  const transaction = withTenant(sql, tenant, async (tx) => {
    await putManagedObject(
      sql,
      tx,
      {
        ...store,
        put: async (objectKey, body, contentType) => {
          await store.put(objectKey, body, contentType);
          written.release();
          await release.promise;
        },
      },
      tenant,
      key,
      content,
      'message/rfc822',
    );
    await reference(tx, key);
  });
  // Attach immediately so an early storage/SQL error cannot become an unhandled rejection.
  const settled = transaction.then(
    () => undefined,
    (error: unknown) => error,
  );
  try {
    await bounded(
      Promise.race([
        written.promise,
        settled.then((error) => {
          if (error) throw error;
        }),
      ]),
      'independent intent and PUT',
    );
    expect(await observer`select state from object_uploads where object_key=${key}`).toEqual([
      { state: 'prepared' },
    ]);
    expect((await sweepObjectUploads(observer, store)).deleted).toBe(0);
    expect(await store.get(key, 1024)).toEqual(content);
  } finally {
    release.release();
    await bounded(transaction, 'owning transaction completion');
  }
  await due(key);
  expect((await sweepObjectUploads(observer, store)).referenced).toBe(1);
  expect(await store.get(key, 1024)).toEqual(content);
});

it('preserves a committed object after a simulated lost acknowledgement and collects outer/savepoint rollbacks', async () => {
  const committed = fixtureKey(),
    outer = fixtureKey(),
    savepoint = fixtureKey();
  await expect(
    (async () => {
      await withTenant(sql, tenant, async (tx) => {
        await putManagedObject(sql, tx, store, tenant, committed, content, 'message/rfc822');
        await reference(tx, committed);
      });
      // The server committed; only its response is lost from the caller's perspective.
      throw new Error('Simulated lost COMMIT acknowledgement');
    })(),
  ).rejects.toThrow('lost COMMIT');
  await expect(
    withTenant(sql, tenant, async (tx) => {
      await putManagedObject(sql, tx, store, tenant, outer, content, 'message/rfc822');
      await reference(tx, outer);
      throw new Error('Outer rollback');
    }),
  ).rejects.toThrow('Outer rollback');
  await withTenant(sql, tenant, async (tx) => {
    await expect(
      tx.savepoint(async (save) => {
        await putManagedObject(sql, save, store, tenant, savepoint, content, 'message/rfc822');
        await reference(save, savepoint);
        throw new Error('Savepoint rollback');
      }),
    ).rejects.toThrow('Savepoint rollback');
    await tx`select 1`;
  });
  expect(await store.get(outer, 1024)).toEqual(content);
  expect(await store.get(savepoint, 1024)).toEqual(content);
  const result = await sweepObjectUploads(observer, store);
  expect(result.deleted).toBe(2);
  expect(result.referenced).toBe(1);
  expect(await store.get(committed, 1024)).toEqual(content);
  await absent(outer);
  await absent(savepoint);
  expect(
    await observer`select state from object_uploads where object_key in ${observer([outer, savepoint])}`,
  ).toEqual([{ state: 'tombstoned' }, { state: 'tombstoned' }]);
});

it('retains tombstones for late PUT completion, refuses reuse and leaves unknown or mismatched objects untouched', async () => {
  const key = fixtureKey(),
    legacy = fixtureKey(),
    mismatched = fixtureKey();
  await expect(
    withTenant(sql, tenant, async (tx) => {
      await putManagedObject(sql, tx, store, tenant, key, content, 'message/rfc822');
      throw new Error('Rollback');
    }),
  ).rejects.toThrow('Rollback');
  await store.put(legacy, content, 'message/rfc822');
  await store.put(mismatched, content, 'message/rfc822');
  await observer`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key) values(${randomUUID()},${orgId},${environmentId},${'f'.repeat(64)},${mismatched})`;
  expect((await sweepObjectUploads(observer, store)).deleted).toBe(1);
  await absent(key);
  // Actual storage write after DELETE models a pre-crash request finishing late.
  await store.put(key, content, 'message/rfc822');
  await due(key);
  expect((await sweepObjectUploads(observer, store)).deleted).toBe(1);
  await absent(key);
  expect(
    await observer`select state,delete_attempts from object_uploads where object_key=${key}`,
  ).toEqual([{ state: 'tombstoned', delete_attempts: 2 }]);
  let puts = 0;
  await expect(
    withTenant(sql, tenant, (tx) =>
      putManagedObject(
        sql,
        tx,
        {
          ...store,
          put: async () => {
            puts++;
          },
        },
        tenant,
        key,
        content,
        'message/rfc822',
      ),
    ),
  ).rejects.toThrow(/unique/);
  expect(puts).toBe(0);
  expect(await store.get(legacy, 1024)).toEqual(content);
  expect(await store.get(mismatched, 1024)).toEqual(content);
});

it('rejects PUT when collection wins between intent commit and the owning transaction lock', async () => {
  const key = fixtureKey();
  let puts = 0;
  await expect(
    withTenant(sql, tenant, async (tx) => {
      const delayedLock = new Proxy(tx, {
        apply(target, thisArg, argumentsList) {
          const [parts] = argumentsList;
          if (Array.isArray(parts) && parts.join('').startsWith('select state from object_uploads'))
            return (async () => {
              expect((await sweepObjectUploads(observer, store)).deleted).toBe(1);
              return Reflect.apply(target, thisArg, argumentsList);
            })();
          return Reflect.apply(target, thisArg, argumentsList);
        },
      });
      await putManagedObject(
        sql,
        delayedLock,
        {
          ...store,
          put: async () => {
            puts++;
          },
        },
        tenant,
        key,
        content,
        'message/rfc822',
      );
    }),
  ).rejects.toThrow('no longer available');
  expect(puts).toBe(0);
  await absent(key);
});

it('refuses cleanup in an isolated bucket with enabled or suspended versioning', async () => {
  const require = createRequire(import.meta.url);
  const mailRequire = createRequire(require.resolve('@flare/mail'));
  const sdk = mailRequire('@aws-sdk/client-s3') as {
    S3Client: new (options: unknown) => {
      send(command: unknown, options?: { abortSignal: AbortSignal }): Promise<unknown>;
      destroy(): void;
    };
    CreateBucketCommand: new (input: { Bucket: string }) => unknown;
    DeleteBucketCommand: new (input: { Bucket: string }) => unknown;
    PutBucketVersioningCommand: new (input: {
      Bucket: string;
      VersioningConfiguration: { Status: 'Enabled' | 'Suspended' };
    }) => unknown;
  };
  const client = new sdk.S3Client({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY,
      secretAccessKey: environment.S3_SECRET_KEY,
    },
  });
  const bucket = `flare-journal-version-${randomUUID()}`;
  let created = false;
  try {
    await client.send(new sdk.CreateBucketCommand({ Bucket: bucket }), {
      abortSignal: AbortSignal.timeout(5000),
    });
    created = true;
    vi.stubEnv('S3_BUCKET', bucket);
    const versioned = objectStore();
    vi.stubEnv('S3_BUCKET', environment.S3_BUCKET);
    for (const status of ['Enabled', 'Suspended'] as const) {
      await client.send(
        new sdk.PutBucketVersioningCommand({
          Bucket: bucket,
          VersioningConfiguration: { Status: status },
        }),
        { abortSignal: AbortSignal.timeout(5000) },
      );
      await expect(sweepObjectUploads(observer, versioned)).rejects.toThrow('unversioned bucket');
    }
  } finally {
    vi.stubEnv('S3_BUCKET', environment.S3_BUCKET);
    try {
      if (created)
        await client.send(new sdk.DeleteBucketCommand({ Bucket: bucket }), {
          abortSignal: AbortSignal.timeout(5000),
        });
    } finally {
      client.destroy();
    }
  }
});
