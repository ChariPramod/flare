import type { Transaction, Sql } from '@flare/db';
import type { Tenant } from '@flare/shared';
import type { TransportAdapter } from './transports.js';
import { evaluateSendingReadiness } from './readiness.js';
export async function sendingReadiness(
  db: Sql | Transaction,
  tenant: Tenant,
  domain: Record<string, unknown>,
  transport: TransportAdapter,
) {
  const [environment] =
    await db`select name from environments where id=${tenant.environmentId} and org_id=${tenant.orgId}`;
  const [proof] =
    await db`select * from domain_transport_readiness where org_id=${tenant.orgId} and environment_id=${tenant.environmentId} and domain_id=${String(domain.id)} and transport_instance=${transport.instance?.id ?? transport.name}`;
  const production = environment?.name === 'Production';
  const result = evaluateSendingReadiness(
    {
      name: String(domain.name),
      status: String(domain.status),
      sending: Boolean(domain.sending),
      checked_at: domain.checked_at,
      records: domain.records,
      dmarc_evidence: domain.dmarc_evidence,
    },
    {
      production,
      transportInstance: transport.instance?.id ?? transport.name,
      provider: transport.name,
      evidence: proof?.evidence,
      revokedAt: proof?.revoked_at,
    },
  );
  if (!environment) result.blockers.push('environment_unavailable');
  if (
    production &&
    (!transport.instance || proof?.config_fingerprint !== transport.instance.config_fingerprint)
  )
    result.blockers.push('transport_evidence_configuration_changed');
  return { ...result, ready: result.blockers.length === 0 };
}
