import postgres from 'postgres';
export * from './schema.js';
export type Sql = postgres.Sql;
export type Transaction = postgres.TransactionSql;
export function toJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}
export function connectDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, idle_timeout: 20, connect_timeout: 10 });
  // The service transaction API uses postgres.js codecs. Initializing Drizzle on
  // this client replaces JSON/date serializers and breaks raw tagged queries.
  // Drizzle owns the schema definitions; a future ORM session needs its own client.
  return { client };
}
export async function withTenant<T>(
  client: postgres.Sql,
  tenant: { orgId: string; environmentId: string },
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(tenant.orgId) || !/^[0-9a-f-]{36}$/i.test(tenant.environmentId))
    throw new Error('Valid tenant context is required');
  return (await client.begin(async (tx) => {
    await tx`set local role flare_tenant`;
    await tx`select set_config('flare.org_id', ${tenant.orgId}, true), set_config('flare.environment_id', ${tenant.environmentId}, true)`;
    return fn(tx);
  })) as T;
}
