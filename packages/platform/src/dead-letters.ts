import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import { MailError } from '@flare/mail';
import { can } from '@flare/shared';
import type { Principal } from '@flare/shared';
import { z } from 'zod';
export const deadLetterKind = z.enum([
  'workflow',
  'email',
  'webhook',
  'inbound',
  'forward',
  'automation',
  'publication',
]);
export type DeadLetterKind = z.infer<typeof deadLetterKind>;
export async function listDeadLetters(sql: Sql, p: Principal, limit = 25, offset = 0) {
  return withTenant(
    sql,
    p,
    (tx) => tx`
    select * from (
      select 'workflow' as kind,id,status,error,attempts,created_at,status='failed' and claim_id is null as redrivable from workflow_runs where status in ('failed','ambiguous') or cancellation_status='failed'
      union all select 'email',m.id,m.status,m.error,(select count(*)::int from transport_attempts a where a.message_id=m.id),m.created_at,claim_id is null and not exists(select 1 from transport_attempts a where a.message_id=m.id and a.status in ('started','ambiguous')) from messages m where status='failed'
      union all select 'webhook',id,status,error,attempts,created_at,true from webhook_deliveries where status='failed'
      union all select 'inbound',id,status,error,attempts,created_at,true from inbound_messages where status='failed'
      union all select 'forward',id,status,error,attempts,created_at,true from inbound_forwards where status='failed'
      union all select 'automation',id,status,error,attempts,created_at,true from automation_runs where status='failed'
      union all select 'publication',id,status,error,0,created_at,false from publication_operations where status='failed'
    ) failures order by created_at desc,id limit ${limit} offset ${offset}`,
  );
}
export async function redriveDeadLetter(sql: Sql, p: Principal, kind: DeadLetterKind, id: string) {
  if (!can(p, 'write')) throw new MailError(403, 'Write access required');
  if (p.domainId) throw new MailError(403, 'Use an unscoped operational credential');
  return withTenant(sql, p, async (tx) => {
    let rows;
    if (kind === 'workflow')
      rows =
        await tx`update workflow_runs set status='queued',cycle_attempts=0,redrives=redrives+1,next_attempt_at=now(),error=null,updated_at=now() where id=${id} and status='failed' and claim_id is null and cancellation_status='none' returning id`;
    else if (kind === 'email') {
      const [message] = await tx`select * from messages where id=${id} for update`;
      if (!message) throw new MailError(404, 'Dead letter not found');
      if (message.status !== 'failed' || message.claim_id)
        throw new MailError(409, 'Only failed inactive messages can be redriven');
      const uncertain =
        await tx`select id from transport_attempts where message_id=${id} and status in ('started','ambiguous') limit 1`;
      if (uncertain.length)
        throw new MailError(409, 'Ambiguous provider acceptance cannot be redriven');
      const recipients =
        await tx`update message_recipients set status='queued' where message_id=${id} and status='failed' returning address`;
      if (!recipients.length) throw new MailError(409, 'No failed recipients to redrive');
      rows =
        await tx`update messages set status='queued',delivery_finished_at=null,delivery_started_at=null,lease_until=null,scheduled_at=now(),redrives=redrives+1,error=null,updated_at=now() where id=${id} returning id`;
    } else if (kind === 'webhook')
      rows =
        await tx`update webhook_deliveries d set status='pending',cycle_attempts=0,replays=replays+1,next_attempt_at=now(),error=null where id=${id} and status='failed' and claim_id is null and exists(select 1 from webhook_endpoints e where e.id=d.endpoint_id and e.enabled) returning id`;
    else if (kind === 'inbound')
      rows =
        await tx`update inbound_messages set status='pending',next_attempt_at=now(),error=null where id=${id} and status='failed' returning id`;
    else if (kind === 'forward')
      rows =
        await tx`update inbound_forwards set status='pending',next_attempt_at=now(),error=null where id=${id} and status='failed' and message_id is null returning id`;
    else if (kind === 'automation')
      rows =
        await tx`update automation_runs set status='queued',attempts=0,error=null,finished_at=null,next_step_at=now() where id=${id} and status='failed' returning id`;
    else throw new MailError(409, 'Use the publication retry or corrected replacement operation');
    if (!rows.length)
      throw new MailError(
        409,
        'Failed inactive operation not found, or recovery prerequisites are unmet',
      );
    await tx`insert into audit_logs(org_id,actor_id,action,resource_id) values(${p.orgId},${p.actorId},${`dead_letter.${kind}.redriven`},${id})`;
    return { id, kind, status: 'pending' };
  });
}
