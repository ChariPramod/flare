import { randomUUID } from 'node:crypto';
import type { Tenant } from '../../../packages/shared/src/index.js';
import type { PipelineOptions } from '../../../packages/mail/src/pipeline.js';
import { createMailRoute } from '../../../packages/mail/src/routes.js';
import { updateSendingPolicy } from '../../../packages/mail/src/sending-policy.js';

/** Development-only policy fixture: no claim of live provider authentication. */
export async function configureMarketingFixture(options: PipelineOptions, tenant: Tenant) {
  const { sql } = options;
  const actor = {
    actorId: randomUUID(),
    sessionId: randomUUID(),
    authorize: async () => undefined,
  };
  await sql`insert into users(id,email,name) values(${actor.actorId},${`${actor.actorId}@example.net`},'Fixture operator')`;
  await sql`insert into sessions(id,user_id,expires_at) values(${actor.sessionId},${actor.actorId},now()+interval '1 day')`;
  options.transports = options.transports.map((adapter) => ({
    ...adapter,
    name: 'smtp',
    sandbox: false,
    instance: {
      id: 'marketing-fixture',
      kind: 'smtp' as const,
      server_id: 'fixture-server',
      pool_id: 'customer-marketing',
      credential_version: 'v1',
      config_fingerprint: 'b'.repeat(64),
    },
  }));
  const route = await createMailRoute(
    sql,
    actor,
    {
      expected_revision: 0,
      name: 'Fixture marketing route',
      traffic_class: 'marketing',
      trust_tier: 'customer',
      critical: false,
      transport_instances: ['marketing-fixture'],
      physical_ips: ['8.8.4.4'],
      verified: true,
      proof_reference: 'fixture-only/operator-reviewed-pool',
      reason: 'Fixture operator reviewed marketing purpose and pool',
    },
    options.transports,
  );
  const change = async (changes: Record<string, unknown>) => {
    const [policy] = await sql`select revision from sending_policies where org_id=${tenant.orgId}`;
    return updateSendingPolicy(sql, actor, tenant.orgId, {
      expected_revision: Number(policy!.revision),
      reason: 'Fixture operator reviewed sending policy change',
      ...changes,
    });
  };
  await change({
    state: 'approved',
    daily_limit: 1,
    marketing_enabled: true,
    default_traffic_class: 'marketing',
    route_bindings: { marketing: { id: route.id, revision: 1 } },
  });
  return { change };
}
