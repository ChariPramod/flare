import { randomUUID } from 'node:crypto';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { decrypt, eventMatches, signWebhook, webhookRetrySeconds, redactText } from '@flare/shared';
import type { Tenant } from '@flare/shared';
import { postWebhook } from './http.js';
import type { WebhookHttpResult } from './http.js';
export type WebhookSender = (
  url: string,
  payload: string,
  headers: Record<string, string>,
) => Promise<WebhookHttpResult>;
export async function fanOutEvents(sql: Sql) {
  return sql.begin(async (tx) => {
    const events =
      await tx`select * from event_outbox where dispatched_at is null order by created_at for update skip locked limit 100`;
    let count = 0;
    for (const event of events) {
      // Keep eligibility in PostgreSQL: converting the event time through Date
      // drops microseconds and can exclude endpoints created just before it.
      const endpoints =
        await tx`select id,events from webhook_endpoints where org_id=${event.org_id} and environment_id=${event.environment_id} and enabled=true and created_at<=(select created_at from event_outbox where id=${event.id})`;
      const payload = JSON.stringify({
        id: event.id,
        type: event.type,
        created_at: new Date(event.created_at).toISOString(),
        data: event.data,
      });
      for (const endpoint of endpoints) {
        if (
          event.target_endpoint_id
            ? endpoint.id !== event.target_endpoint_id
            : !eventMatches(endpoint.events as string[], String(event.type))
        )
          continue;
        const inserted =
          await tx`insert into webhook_deliveries(org_id,environment_id,endpoint_id,event_id,payload) values(${event.org_id},${event.environment_id},${endpoint.id},${event.id},${payload}) on conflict(endpoint_id,event_id) do nothing returning id`;
        count += inserted.length;
      }
      await tx`update event_outbox set dispatched_at=now() where id=${event.id}`;
    }
    return count;
  });
}
async function disableEndpoint(tx: Transaction, tenant: Tenant, id: string) {
  const updated =
    await tx`update webhook_endpoints set enabled=false,disabled_reason='Eight delivery attempts failed',updated_at=now() where id=${id} and enabled=true returning id`;
  if (updated.length) {
    await tx`insert into operation_alerts(org_id,environment_id,kind,resource_id,message) values(${tenant.orgId},${tenant.environmentId},'webhook.disabled',${id},'Webhook disabled after eight unsuccessful delivery attempts. Inspect delivery logs, fix the endpoint, then re-enable and replay.')`;
    await tx`insert into event_outbox(org_id,environment_id,type,data) values(${tenant.orgId},${tenant.environmentId},'webhook.disabled',${tx.json({ endpoint_id: id })})`;
  }
}
export async function recoverWebhooks(sql: Sql) {
  const expired =
    await sql`select id,org_id,environment_id from webhook_deliveries where status='delivering' and lease_until<now() limit 100`;
  for (const row of expired) {
    const tenant = { orgId: String(row.org_id), environmentId: String(row.environment_id) };
    await withTenant(sql, tenant, async (tx) => {
      const [delivery] =
        await tx`select * from webhook_deliveries where id=${row.id} and status='delivering' and lease_until<now() for update`;
      if (!delivery) return;
      await tx`update webhook_attempts set error='Worker lease expired; response outcome unknown',finished_at=now() where delivery_id=${row.id} and finished_at is null`;
      const exhausted = Number(delivery.cycle_attempts) >= webhookRetrySeconds.length;
      await tx`update webhook_deliveries set status=${exhausted ? 'failed' : 'pending'},claim_id=null,lease_until=null,next_attempt_at=now(),error='Worker lease expired; replay may duplicate a prior delivery' where id=${row.id}`;
      if (exhausted) await disableEndpoint(tx, tenant, String(delivery.endpoint_id));
    });
  }
}
export async function deliverWebhook(
  sql: Sql,
  encryptionKey: string,
  id: string,
  sender: WebhookSender = postWebhook,
) {
  const [lookup] = await sql`select org_id,environment_id from webhook_deliveries where id=${id}`;
  if (!lookup) return;
  const tenant = { orgId: String(lookup.org_id), environmentId: String(lookup.environment_id) },
    claimId = randomUUID();
  const work = await withTenant(sql, tenant, async (tx) => {
    const [delivery] =
      await tx`select d.* from webhook_deliveries d join webhook_endpoints e on e.id=d.endpoint_id and e.org_id=d.org_id and e.environment_id=d.environment_id where d.id=${id} and d.status='pending' and d.next_attempt_at<=now() and e.enabled=true for update of d`;
    if (!delivery) return null;
    const [endpoint] = await tx`select * from webhook_endpoints where id=${delivery.endpoint_id}`;
    if (!endpoint) return null;
    const ordinal = Number(delivery.attempts) + 1,
      cycle = Number(delivery.cycle_attempts) + 1;
    await tx`update webhook_deliveries set status='delivering',claim_id=${claimId},lease_until=now()+interval '1 minute',attempts=${ordinal},cycle_attempts=${cycle} where id=${id}`;
    await tx`insert into webhook_attempts(org_id,environment_id,delivery_id,ordinal,url) values(${tenant.orgId},${tenant.environmentId},${id},${ordinal},${endpoint.url})`;
    return {
      payload: String(delivery.payload),
      eventId: String(delivery.event_id),
      endpointId: String(endpoint.id),
      url: String(endpoint.url),
      secret: String(endpoint.secret_cipher),
      previous:
        endpoint.previous_secret_cipher &&
        new Date(endpoint.previous_secret_until).getTime() > Date.now()
          ? String(endpoint.previous_secret_cipher)
          : null,
      ordinal,
      cycle,
    };
  });
  if (!work) return;
  let status: number | null = null,
    excerpt = '',
    error: string | null = null;
  const start = Date.now();
  try {
    const timestamp = Math.floor(Date.now() / 1000),
      aad = `${tenant.orgId}/${tenant.environmentId}/webhook/${work.endpointId}`;
    const secrets = [work.secret, ...(work.previous ? [work.previous] : [])].map((cipher) =>
      decrypt(cipher, encryptionKey, aad),
    );
    const response = await sender(work.url, work.payload, {
      'svix-id': work.eventId,
      'svix-timestamp': String(timestamp),
      'svix-signature': secrets
        .map((secret) => signWebhook(secret, work.eventId, timestamp, work.payload))
        .join(' '),
    });
    status = response.status;
    excerpt = redactText(response.excerpt).slice(0, 4096);
    if (status < 200 || status >= 300) error = `Endpoint returned HTTP ${status}`;
  } catch (reason) {
    error = redactText(reason instanceof Error ? reason.message : 'Webhook transport failed').slice(
      0,
      500,
    );
  }
  await withTenant(sql, tenant, async (tx) => {
    const [delivery] =
      await tx`select id from webhook_deliveries where id=${id} and claim_id=${claimId} and status='delivering' for update`;
    if (!delivery) return;
    await tx`update webhook_attempts set status_code=${status},error=${error},response_excerpt=${excerpt},latency_ms=${Math.min(Date.now() - start, 2147483647)},finished_at=now() where delivery_id=${id} and ordinal=${work.ordinal}`;
    const exhausted = work.cycle >= webhookRetrySeconds.length;
    await tx`update webhook_deliveries set status=${!error ? 'delivered' : exhausted ? 'failed' : 'pending'},delivered_at=${!error ? new Date() : null},claim_id=null,lease_until=null,error=${error},next_attempt_at=now()+${webhookRetrySeconds[work.cycle] ?? 0}*interval '1 second' where id=${id}`;
    if (error && exhausted) await disableEndpoint(tx, tenant, work.endpointId);
  });
}
export async function replayWebhook(sql: Sql, tenant: Tenant, id: string) {
  return withTenant(sql, tenant, async (tx) => {
    const [row] =
      await tx`select d.id,d.status,e.enabled from webhook_deliveries d join webhook_endpoints e on e.id=d.endpoint_id and e.org_id=d.org_id and e.environment_id=d.environment_id where d.id=${id} for update of d`;
    if (!row) throw new Error('Delivery not found');
    if (row.status === 'delivering') throw new Error('Wait for the active attempt to finish');
    if (!row.enabled) throw new Error('Re-enable the endpoint before replaying');
    await tx`update webhook_deliveries set status='pending',cycle_attempts=0,replays=replays+1,next_attempt_at=now(),error=null,delivered_at=null where id=${id}`;
    return { id, replayed: true };
  });
}
export async function mirrorEngineEvent(
  sql: Sql,
  tenant: Tenant,
  sourceId: string,
  type: string,
  data: unknown,
) {
  return withTenant(sql, tenant, async (tx) => {
    const inserted =
      await tx`insert into engine_events(org_id,environment_id,source_id,type,data) values(${tenant.orgId},${tenant.environmentId},${sourceId},${type},${tx.json(toJson(data))}) on conflict(environment_id,source_id) do nothing returning source_id`;
    if (inserted.length)
      await tx`insert into event_outbox(org_id,environment_id,type,data) values(${tenant.orgId},${tenant.environmentId},${type},${tx.json(toJson(data))})`;
    return { duplicate: inserted.length === 0 };
  });
}
