import { ConflictException } from '@nestjs/common';
import { withTenant } from '@flare/db';
import type { Transaction } from '@flare/db';
import { fingerprint } from '@flare/shared';
import type { Tenant } from '@flare/shared';
import { z } from 'zod';
import { parse, sql } from './context.js';
export async function idempotent<T extends Record<string, unknown>>(
  tenant: Tenant,
  operation: string,
  key: unknown,
  body: unknown,
  execute: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const validKey = key === undefined ? undefined : parse(z.string().min(1).max(256), key);
  return withTenant(sql, tenant, async (tx) => {
    if (validKey) {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${tenant.environmentId}/${operation}/${validKey}`},0))`;
      await tx`delete from idempotency where operation = ${operation} and key = ${validKey} and expires_at <= now()`;
      const [previous] =
        await tx`select body_hash, response from idempotency where operation = ${operation} and key = ${validKey}`;
      if (previous) {
        if (previous.body_hash !== fingerprint(body))
          throw new ConflictException('Idempotency key was used with a different request');
        return previous.response as T;
      }
    }
    const result = await execute(tx);
    if (validKey)
      await tx`insert into idempotency (org_id,environment_id,operation,key,body_hash,response) values (${tenant.orgId},${tenant.environmentId},${operation},${validKey},${fingerprint(body)},${tx.json(JSON.parse(JSON.stringify(result)))})`;
    return result;
  });
}
