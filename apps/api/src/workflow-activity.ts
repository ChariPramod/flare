import { NotFoundException } from '@nestjs/common';
import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import type { Tenant } from '@flare/shared';

export interface EngineObservation {
  status: 'available' | 'unavailable' | 'not_requested';
  checked_at: string | null;
}

export async function workflowActivity(
  sql: Sql,
  tenant: Tenant,
  id: string,
  lookup: (transactionId: string) => Promise<unknown>,
) {
  // Authorize and read local evidence before attempting optional engine access.
  // Database/tenant errors must not be misreported as an engine outage.
  const [run] = await withTenant(
    sql,
    tenant,
    (tx) => tx`select * from workflow_runs where id=${id}`,
  );
  if (!run) throw new NotFoundException();
  let engine: unknown = null;
  let observation: EngineObservation = { status: 'not_requested', checked_at: null };
  if (run.status === 'accepted') {
    try {
      engine = await lookup(String(run.transaction_id));
      observation = { status: 'available', checked_at: new Date().toISOString() };
    } catch {
      // Lookup uses the existing bounded Novu client. Never expose provider
      // response bodies, credentials, or exception details in this observation.
      observation = { status: 'unavailable', checked_at: new Date().toISOString() };
    }
  }
  return { ...run, engine, engine_observation: observation };
}
