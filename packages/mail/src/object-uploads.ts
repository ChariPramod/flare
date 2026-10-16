import { randomUUID } from 'node:crypto';
import { independentDatabase } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import type { Tenant } from '@flare/shared';
import type { ObjectStore } from './storage.js';

/** Commit intent independently, hold its lock through PUT and reference adoption.
 * Memory stores intentionally have no lifecycle; they cannot establish crash safety. */
export async function putManagedObject(
  sql: Sql,
  tx: Transaction,
  store: ObjectStore,
  tenant: Tenant,
  key: string,
  body: Buffer,
  contentType: string,
) {
  if (
    !key.startsWith(`${tenant.orgId}/${tenant.environmentId}/`) ||
    key.length > 1024 ||
    !/^[A-Za-z0-9._/-]+$/.test(key) ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Upload key must belong to its tenant');
  const identity = store.identity;
  if (!identity) {
    await store.put(key, body, contentType);
    return;
  }
  const id = randomUUID();
  const journal = independentDatabase(sql);
  await journal.begin(async (intent) => {
    // A missing/uncommitted tenant or outage must fail without attempting PUT.
    await intent`set local lock_timeout='3s'`;
    await intent`set local statement_timeout='5s'`;
    await intent`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key) values(${id},${tenant.orgId},${tenant.environmentId},${identity},${key})`;
  });
  const [row] =
    await tx`select state from object_uploads where id=${id} and storage_identity=${identity} and object_key=${key} for update`;
  if (!row || row.state !== 'prepared') throw new Error('Upload intent is no longer available');
  if (store.identity !== identity) throw new Error('Object storage identity changed');
  await store.put(key, body, contentType);
  await tx`update object_uploads set state='adopted',adopted_at=now() where id=${id}`;
  // The caller writes the resource reference in this same owning transaction.
}

async function referenced(tx: Transaction, key: string) {
  const [row] =
    await tx`select exists(select 1 from messages where mime_key=${key} or (request->'attachments') @> jsonb_build_array(jsonb_build_object('key',${key}::text))) or exists(select 1 from inbound_messages where raw_key=${key} or body_key=${key}) or exists(select 1 from inbound_attachments where object_key=${key}) as present`;
  return Boolean(row?.present);
}

/** Bounded collection of known journal entries only; never list/discover a bucket.
 * Tombstones are never retired: a pre-crash PUT can complete after a DELETE. */
export async function sweepObjectUploads(sql: Sql, store: ObjectStore, limit = 10) {
  if (!store.identity || !store.assertUnversioned)
    throw new Error('Managed object storage is required for cleanup');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Cleanup batch must be between 1 and 100');
  const identity = store.identity;
  await store.assertUnversioned();
  const candidates = await sql.begin(async (tx) => {
    await tx`set local lock_timeout='3s'`;
    await tx`set local statement_timeout='5s'`;
    return tx`select id from object_uploads where storage_identity=${identity} and next_check_at<=now() order by next_check_at,id for update skip locked limit ${limit}`;
  });
  const result = { examined: 0, referenced: 0, deleted: 0, skipped: 0 };
  const started = Date.now();
  for (const candidate of candidates) {
    if (Date.now() - started > 10_000) break;
    const tombstone = await sql.begin(async (tx) => {
      await tx`set local lock_timeout='3s'`;
      await tx`set local statement_timeout='5s'`;
      const [row] =
        await tx`select id,object_key from object_uploads where id=${candidate.id} and storage_identity=${identity} and next_check_at<=now() for update skip locked`;
      if (!row) {
        result.skipped++;
        return undefined;
      }
      result.examined++;
      if (await referenced(tx, String(row.object_key))) {
        result.referenced++;
        await tx`update object_uploads set next_check_at=now()+interval '1 day' where id=${row.id}`;
        return undefined;
      }
      await tx`update object_uploads set state='tombstoned',tombstoned_at=coalesce(tombstoned_at,now()),next_check_at=now()+interval '1 hour' where id=${row.id}`;
      return { id: String(row.id), key: String(row.object_key) };
    });
    if (!tombstone) continue;
    // Tombstone commit precedes DELETE. A lost acknowledgement leaves retryable
    // work, and subsequent adoption is forbidden even if PUT finishes late.
    await sql.begin(async (tx) => {
      await tx`set local lock_timeout='3s'`;
      await tx`set local statement_timeout='5s'`;
      const [row] =
        await tx`select id from object_uploads where id=${tombstone.id} and state='tombstoned' and storage_identity=${identity} for update skip locked`;
      if (!row) {
        result.skipped++;
        return;
      }
      if (await referenced(tx, tombstone.key)) {
        result.referenced++;
        return;
      }
      // Fail closed for enabled/suspended versioning and configuration changes.
      if (store.identity !== identity) throw new Error('Object storage identity changed');
      await store.assertUnversioned!();
      await store.remove(tombstone.key);
      await tx`update object_uploads set delete_attempts=delete_attempts+1,last_deleted_at=now() where id=${tombstone.id}`;
      result.deleted++;
    });
  }
  return result;
}
