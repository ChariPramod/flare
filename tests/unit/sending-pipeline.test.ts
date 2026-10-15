import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import { generateDomain } from '../../packages/mail/src/domains.js';
import { submitEmails, changeSchedule } from '../../packages/mail/src/pipeline.js';
import type { PipelineOptions } from '../../packages/mail/src/pipeline.js';
import { deliverEmail, recoverDeliveries } from '../../packages/mail/src/delivery.js';
import { createMailRoute, disableMailRoute } from '../../packages/mail/src/routes.js';
import { updateSendingPolicy } from '../../packages/mail/src/sending-policy.js';
import type { OperatorActor } from '../../packages/mail/src/sending-policy.js';
import type { TransportAdapter } from '../../packages/mail/src/transports.js';

const org = randomUUID(),
  env = randomUUID(),
  domainId = randomUUID(),
  credential = randomUUID();
const encryptionKey = randomBytes(32).toString('base64');
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: credential,
  kind: 'api_key',
  role: 'developer',
  permission: 'sending_access',
  production: false,
};
const actor: OperatorActor = {
  actorId: randomUUID(),
  sessionId: randomUUID(),
  authorize: async () => undefined,
};
const body = {
  from: 'sender@example.com',
  to: ['reader@example.net'],
  subject: 'Policy pipeline',
  text: 'Policy pipeline',
};
const send = vi.fn<TransportAdapter['send']>();
const adapter: TransportAdapter = {
  name: 'smtp',
  sandbox: false,
  instance: {
    id: 'named-test-smtp',
    kind: 'smtp',
    server_id: 'fixture-server',
    pool_id: 'customer-transactional',
    credential_version: 'v1',
    config_fingerprint: 'a'.repeat(64),
  },
  supportsRequiredTls: async () => true,
  send,
};
const objects = new Map<string, Buffer>();
let db: PGlite, server: PGLiteSocketServer, sql: Sql, options: PipelineOptions;
let routeId: string;
function connection() {
  const client = connectDatabase(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    { max: 1 },
  ).client;
  client.options.onnotice = () => undefined;
  return client;
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query(
    "insert into organizations(id,name,slug) values($1,'Pipeline policy','pipeline-policy')",
    [org],
  );
  await db.query("insert into environments(id,org_id,name) values($1,$2,'Production')", [env, org]);
  await db.query(
    "insert into users(id,email,name) values($1,'pipeline-operator@example.net','Fixture operator')",
    [actor.actorId],
  );
  await db.query(
    "insert into sessions(id,user_id,expires_at) values($1,$2,now()+interval '1 day')",
    [actor.sessionId, actor.actorId],
  );
  await db.query(
    "insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission) values($1,$2,$3,'Pipeline key',$4,'fl_test','sending_access')",
    [credential, org, env, credential],
  );
  const keys = generateDomain('example.com', `${org}/${env}`, encryptionKey);
  await db.query(
    "insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,$3,'example.com','verified',$4,$5,$6)",
    [domainId, org, env, keys.selector, keys.publicKey, keys.cipher],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connection();
  options = {
    sql,
    encryptionKey,
    trackingKey: encryptionKey,
    transports: [adapter],
    store: {
      put: async (key, bytes) => {
        objects.set(key, bytes);
      },
      get: async (key) => objects.get(key)!,
      remove: async (key) => {
        objects.delete(key);
      },
    },
  };
}, 30000);
beforeEach(async () => {
  await sql`truncate messages,idempotency,event_outbox,suppressions,mail_routes cascade`;
  await sql`delete from sending_policies`;
  await sql`insert into sending_policies(org_id) values(${org})`;
  await sql`update api_keys set revoked_at=null,mail_traffic_class=null,critical_sending=false`;
  objects.clear();
  send.mockReset().mockImplementation(async (message) => ({
    accepted: message.to,
    rejected: [],
    ids: Object.fromEntries(message.to.map((recipient) => [recipient, randomUUID()])),
  }));
  options.transports = [adapter];
  const created = await createMailRoute(
    sql,
    actor,
    {
      expected_revision: 0,
      name: 'Fixture SMTP route',
      traffic_class: 'transactional',
      trust_tier: 'customer',
      critical: false,
      transport_instances: [adapter.instance!.id],
      physical_ips: ['8.8.8.8'],
      proof_reference: 'fixture-only/operator-reviewed-pool',
      verified: true,
      reason: 'Fixture operator reviewed intended transactional pool',
    },
    [adapter],
  );
  routeId = String(created.id);
  await policy({
    state: 'approved',
    default_traffic_class: 'transactional',
    route_bindings: { transactional: { id: routeId, revision: 1 } },
  });
  const checkedAt = new Date().toISOString();
  await sql`update domains set status='verified',sending=true,checked_at=now(),records=${sql.json([{ type: 'TXT', name: 'fixture._domainkey.example.com', value: 'fixture', purpose: 'dkim', required: true, status: 'verified' }])},dmarc_evidence=${sql.json({ status: 'verified', record_domain: 'example.com', checked_at: checkedAt, inherited: false, policy: 'none', adkim: 'r', aspf: 'r' })} where id=${domainId}`;
  // Deliberate fixture evidence, not proof of actual provider delivery or DNS verification.
  await sql`delete from domain_transport_readiness`;
  await sql`insert into domain_transport_readiness(org_id,environment_id,domain_id,transport_instance,actor_id,config_fingerprint,evidence) values(${org},${env},${domainId},${adapter.instance!.id},${actor.actorId},${adapter.instance!.config_fingerprint},${sql.json({ kind: 'received_headers', provenance: 'operator_attested_receiver_headers', transport_instance: adapter.instance!.id, proof_reference: 'fixture-only/received-header-attestation', checked_at: checkedAt, header_from_domain: 'example.com', dkim_domain: 'example.com', dkim_pass: true, mail_from_domain: 'example.com', spf_pass: true, dmarc_pass: true })})`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function policy(changes: Record<string, unknown>) {
  const [current] = await sql`select revision from sending_policies where org_id=${org}`;
  return updateSendingPolicy(sql, actor, org, {
    expected_revision: Number(current!.revision),
    reason: 'Fixture operator reviewed sending limits and purpose',
    ...changes,
  });
}
async function accept(extra: Record<string, unknown> = {}, key?: string) {
  return (await submitEmails(options, principal, [{ ...body, ...extra }], { key })).data[0]!.id;
}
async function message(id: string) {
  return (await sql`select * from messages where id=${id}`)[0]!;
}
async function due(id: string) {
  await sql`update messages set scheduled_at=now(),next_attempt_at=now() where id=${id}`;
}

it('pins the operator route during acceptance and charges idempotent recipients exactly once', async () => {
  const ids = await Promise.all(Array.from({ length: 3 }, () => accept({}, 'same-operation')));
  expect(new Set(ids).size).toBe(1);
  expect(await message(ids[0]!)).toMatchObject({
    sandbox: false,
    traffic_class: 'transactional',
    route_id: routeId,
    route_revision: 1,
    route_snapshot: { id: routeId, revision: 1 },
    submitting_key_id: credential,
  });
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
  expect(await sql`select * from messages`).toHaveLength(1);
  expect(objects.size).toBe(1);
  await expect(accept({ subject: 'Conflicting request' }, 'same-operation')).rejects.toMatchObject({
    status: 409,
  });
  await deliverEmail(options, ids[0]!);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await message(ids[0]!)).toMatchObject({ status: 'sent', claim_id: null });
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(1);
});

it('rolls back the complete strict batch, quota, outbox and stored MIME when quota is exhausted', async () => {
  await policy({ daily_limit: 1 });
  await expect(
    submitEmails(options, principal, [body, { ...body, to: ['second@example.net'] }], {
      key: 'batch-over-limit',
      batch: true,
    }),
  ).rejects.toMatchObject({ status: 429 });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(await sql`select * from sending_quota`).toHaveLength(0);
  expect(await sql`select * from event_outbox`).toHaveLength(0);
  expect(await sql`select * from idempotency`).toHaveLength(0);
  expect(objects.size).toBe(0);
});

it('checks Production from the database even when the principal claims development', async () => {
  await sql`update domains set dmarc_evidence='{}' where id=${domainId}`;
  await expect(accept()).rejects.toMatchObject({ status: 403 });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();
});

it('holds after suspension without marking delivery started, and allows cancellation with quota release', async () => {
  const id = await accept();
  await policy({ state: 'suspended' });
  await deliverEmail(options, id);
  expect(await message(id)).toMatchObject({
    status: 'held',
    hold_reason: 'sending_suspended',
    delivery_started_at: null,
    claim_id: null,
  });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from transport_attempts`).toHaveLength(0);
  await changeSchedule(sql, principal, id, null);
  expect(await message(id)).toMatchObject({ status: 'canceled', claim_id: null });
  expect(await sql`select * from sending_quota where state='released'`).toHaveLength(1);
  await policy({ state: 'approved' });
  await deliverEmail(options, id);
  expect(send).not.toHaveBeenCalled();
});

it('delivers fifty recipients across five paced chunks without exhausting retries or repeating recipients', async () => {
  const recipients = Array.from({ length: 50 }, (_, index) => `reader${index}@example.net`);
  const id = await accept({ to: recipients });
  for (let chunk = 0; chunk < 5; chunk++) {
    await due(id);
    await deliverEmail(options, id);
    expect(send).toHaveBeenCalledTimes(chunk + 1);
    expect(send.mock.calls[chunk]![0].to).toHaveLength(10);
    if (chunk < 4) {
      await due(id);
      await deliverEmail(options, id);
      expect(await message(id)).toMatchObject({
        status: 'held',
        hold_reason: 'sending_rate_limited',
        claim_id: null,
      });
      expect(send).toHaveBeenCalledTimes(chunk + 1);
      await sql`update sending_dispatches set created_at=now()-interval '61 seconds'`;
    }
  }
  expect(send.mock.calls.flatMap(([input]) => input.to).sort()).toEqual(recipients.sort());
  expect(await message(id)).toMatchObject({ status: 'sent', claim_id: null });
  expect(await sql`select * from transport_attempts where status='accepted'`).toHaveLength(5);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(50);
});

it('reserves scheduled recipients only when due and releases immediate reservations on rescheduling', async () => {
  const scheduled = await accept({ scheduled_at: 'in 2 hours' });
  expect(await sql`select * from sending_quota`).toHaveLength(0);
  await deliverEmail(options, scheduled);
  expect(send).not.toHaveBeenCalled();
  const immediate = await accept();
  await changeSchedule(sql, principal, immediate, 'in 2 hours');
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(0);
  await due(scheduled);
  await deliverEmail(options, scheduled);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(1);
});

it('recovers a pre-attempt crash and retains pacing across a fresh worker connection', async () => {
  const id = await accept({
    to: Array.from({ length: 11 }, (_, index) => `recovery${index}@example.net`),
  });
  await sql`update messages set claim_id=${randomUUID()},lease_until=now()-interval '1 second' where id=${id}`;
  await recoverDeliveries(sql);
  expect(await message(id)).toMatchObject({ claim_id: null, delivery_started_at: null });
  await deliverEmail(options, id);
  expect(send).toHaveBeenCalledTimes(1);
  await sql.end();
  sql = connection();
  options.sql = sql;
  await due(id);
  await deliverEmail(options, id);
  expect(await message(id)).toMatchObject({ status: 'held', hold_reason: 'sending_rate_limited' });
  expect(send).toHaveBeenCalledTimes(1);
  await sql`update sending_dispatches set created_at=now()-interval '61 seconds'`;
  await due(id);
  await deliverEmail(options, id);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0].to).toHaveLength(1);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(11);
});

it('stops the next chunk after operator suspension and keeps already accepted recipients terminal', async () => {
  const id = await accept({
    to: Array.from({ length: 11 }, (_, index) => `suspend${index}@example.net`),
  });
  await deliverEmail(options, id);
  await policy({ state: 'suspended' });
  await due(id);
  await deliverEmail(options, id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await message(id)).toMatchObject({ status: 'held', hold_reason: 'sending_suspended' });
  expect(await sql`select * from message_recipients where status='sent'`).toHaveLength(10);
  expect(await sql`select * from message_recipients where status='queued'`).toHaveLength(1);
  await expect(changeSchedule(sql, principal, id, null)).rejects.toMatchObject({ status: 409 });
});

it('holds a pinned route disabled after acceptance without consuming quota or making a network attempt', async () => {
  const id = await accept();
  await disableMailRoute(sql, actor, routeId, 1, 'Fixture operator disabled transport route');
  await deliverEmail(options, id);
  expect(await message(id)).toMatchObject({
    status: 'held',
    hold_reason: 'route_unverified_or_disabled',
    delivery_started_at: null,
  });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
});

it('cancels while preparation owns a lease but before the atomic attempt, without charging pace', async () => {
  const id = await accept();
  const entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>();
  const originalGet = options.store.get;
  options.store.get = async (...args) => {
    entered.resolve();
    await resume.promise;
    return originalGet(...args);
  };
  const delivery = deliverEmail(options, id);
  try {
    await entered.promise;
    expect((await message(id)).claim_id).not.toBeNull();
    await changeSchedule(sql, principal, id, null);
  } finally {
    resume.resolve();
    await delivery;
    options.store.get = originalGet;
  }
  expect(await message(id)).toMatchObject({
    status: 'canceled',
    delivery_started_at: null,
    claim_id: null,
  });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from transport_attempts`).toHaveLength(0);
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
  expect(await sql`select * from sending_quota where state='released'`).toHaveLength(1);
});

it('commits one attempt before network I/O and rejects cancellation after dispatch begins', async () => {
  const id = await accept();
  const entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>();
  send.mockImplementationOnce(async (input) => {
    entered.resolve();
    await resume.promise;
    return { accepted: input.to, rejected: [], ids: { [input.to[0]!]: 'fixture-accepted' } };
  });
  const delivery = deliverEmail(options, id);
  try {
    await entered.promise;
    expect((await message(id)).delivery_started_at).not.toBeNull();
    expect(await sql`select * from transport_attempts where status='started'`).toHaveLength(1);
    expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(1);
    expect(await sql`select * from sending_dispatches`).toHaveLength(1);
    await expect(changeSchedule(sql, principal, id, null)).rejects.toMatchObject({ status: 409 });
    await deliverEmail(options, id);
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    resume.resolve();
    await delivery;
  }
  expect(await message(id)).toMatchObject({ status: 'sent', claim_id: null });
});

it('rolls quota consumption and pace back if inserting the transport attempt fails', async () => {
  const id = await accept();
  await sql.unsafe(
    "create function reject_fixture_attempt() returns trigger language plpgsql as $$ begin raise exception 'injected attempt persistence failure'; end $$",
  );
  await sql.unsafe(
    'create trigger reject_fixture_attempt before insert on transport_attempts for each row execute function reject_fixture_attempt()',
  );
  try {
    await deliverEmail(options, id);
  } finally {
    await sql.unsafe('drop trigger reject_fixture_attempt on transport_attempts');
    await sql.unsafe('drop function reject_fixture_attempt()');
  }
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from transport_attempts`).toHaveLength(0);
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(0);
  expect(await message(id)).toMatchObject({
    status: 'failed',
    delivery_started_at: null,
    claim_id: null,
  });
  expect(await sql`select * from sending_quota where state='released'`).toHaveLength(1);
});

it('quarantines an interrupted accepted chunk, releases untouched reservations, and never resubmits it', async () => {
  const id = await accept({
    to: Array.from({ length: 11 }, (_, index) => `uncertain${index}@example.net`),
  });
  // Inject loss of persistence after provider acceptance. Both success recording
  // and attempted ambiguity recording fail, leaving a durable started attempt.
  await sql.unsafe(
    "create function reject_fixture_outcome() returns trigger language plpgsql as $$ begin raise exception 'injected outcome persistence failure'; end $$",
  );
  await sql.unsafe(
    'create trigger reject_fixture_outcome before update on transport_attempts for each row execute function reject_fixture_outcome()',
  );
  try {
    await deliverEmail(options, id);
  } finally {
    await sql.unsafe('drop trigger reject_fixture_outcome on transport_attempts');
    await sql.unsafe('drop function reject_fixture_outcome()');
  }
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]![0].to).toHaveLength(10);
  expect(await sql`select * from transport_attempts where status='started'`).toHaveLength(1);
  expect((await message(id)).claim_id).not.toBeNull();
  await sql`update messages set lease_until=now()-interval '1 second' where id=${id}`;
  await recoverDeliveries(sql);
  expect(await message(id)).toMatchObject({ status: 'failed', claim_id: null });
  expect(await sql`select * from transport_attempts where status='ambiguous'`).toHaveLength(1);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(10);
  expect(await sql`select * from sending_quota where state='released'`).toHaveLength(1);
  await due(id);
  await deliverEmail(options, id);
  expect(send).toHaveBeenCalledTimes(1);
});

it('rechecks evidence and credential revocation before dispatching an accepted message', async () => {
  const stale = await accept();
  await sql`update domains set checked_at=now()-interval '24 hours' where id=${domainId}`;
  await deliverEmail(options, stale);
  expect(await message(stale)).toMatchObject({
    status: 'held',
    hold_reason: 'sender_not_ready',
    delivery_started_at: null,
  });
  expect(send).not.toHaveBeenCalled();
  await sql`update domains set checked_at=now() where id=${domainId}`;
  const revoked = await accept();
  await sql`update api_keys set revoked_at=now() where id=${credential}`;
  await deliverEmail(options, revoked);
  expect(await message(revoked)).toMatchObject({
    status: 'held',
    hold_reason: 'credential_unavailable',
    delivery_started_at: null,
  });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
});

it('uses the current required-TLS policy from the atomic attempt after a concurrent domain change', async () => {
  const id = await accept();
  let changed = false;
  const intercepted = new Proxy(sql, {
    apply(target, thisArgument, argumentsList) {
      const query = Reflect.apply(target, thisArgument, argumentsList);
      const template = argumentsList[0] as unknown;
      if (
        !changed &&
        Array.isArray(template) &&
        template.join('').includes('select * from domains where id=')
      ) {
        changed = true;
        return (query as Promise<unknown>).then(async (rows) => {
          // Preserve the old query result while the operator changes the domain
          // before delivery enters its definitive attempt transaction.
          await sql`update domains set enforce_tls=true where id=${domainId}`;
          return rows;
        });
      }
      return query;
    },
  });
  try {
    await deliverEmail({ ...options, sql: intercepted }, id);
  } finally {
    await sql`update domains set enforce_tls=false where id=${domainId}`;
  }
  expect(changed).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]![0].requireTls).toBe(true);
});

it('delivers a pinned approved revision after the organization binds a newer route', async () => {
  const id = await accept();
  await createMailRoute(
    sql,
    actor,
    {
      id: routeId,
      expected_revision: 1,
      name: 'Next fixture SMTP route',
      traffic_class: 'transactional',
      trust_tier: 'customer',
      critical: false,
      transport_instances: [adapter.instance!.id],
      physical_ips: ['8.8.8.8'],
      proof_reference: 'fixture-only/operator-reviewed-next-revision',
      verified: true,
      reason: 'Fixture operator reviewed a new revision of the same isolated route',
    },
    [adapter],
  );
  await policy({ route_bindings: { transactional: { id: routeId, revision: 2 } } });
  await deliverEmail(options, id);
  expect(await message(id)).toMatchObject({ status: 'sent', route_id: routeId, route_revision: 1 });
  expect(send).toHaveBeenCalledTimes(1);
});

it('holds accepted work when required TLS becomes unavailable before an attempt', async () => {
  await sql`update domains set enforce_tls=true where id=${domainId}`;
  const id = await accept();
  options.transports = [{ ...adapter, supportsRequiredTls: async () => false }];
  await deliverEmail(options, id);
  expect(await message(id)).toMatchObject({
    status: 'held',
    hold_reason: 'required_tls_unavailable',
    delivery_started_at: null,
  });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select id from transport_attempts where message_id=${id}`).toHaveLength(0);
});

it('lets non-broadcast audience work use its approved transactional binding', async () => {
  const contact = randomUUID();
  await sql`insert into contacts(id,org_id,environment_id,email) values(${contact},${org},${env},${`${contact}@example.net`})`;
  const accepted = await submitEmails(options, principal, [body], {
    campaign: { contactId: contact, topicId: null },
  });
  expect(await message(accepted.data[0]!.id)).toMatchObject({
    traffic_class: 'transactional',
    contact_id: contact,
  });
});
