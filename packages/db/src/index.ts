import postgres from 'postgres';
export * from './schema.js';
export type Sql = postgres.Sql;
export type Transaction = postgres.TransactionSql;
export function toJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}
const independentPools = new WeakMap<Sql, () => Sql>();
/** A separately bounded pool for durable intents; never borrow the owning transaction pool. */
export function independentDatabase(client: Sql): Sql {
  const pool = independentPools.get(client);
  if (!pool) throw new Error('Durable uploads require a connectDatabase client');
  return pool();
}
export function connectDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, idle_timeout: 20, connect_timeout: 10 });
  let independent: Sql | undefined;
  let closing = false;
  independentPools.set(client, () => {
    if (closing) throw new Error('Database is closing');
    independent ??= postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 10 });
    return independent;
  });
  const end = client.end.bind(client);
  client.end = async (options) => {
    // Let existing owning transactions finish before closing their intent pool.
    await end(options);
    closing = true;
    await independent?.end(options);
  };
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
