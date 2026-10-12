import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import {
  submitEmails,
  generateDomain,
  deliverEmail,
  TransportError,
  changeSchedule,
  recordEvent,
  recoverDeliveries,
} from '../../packages/mail/src/index.js';
import type { PipelineOptions, TransportAdapter } from '../../packages/mail/src/index.js';
const org = randomUUID(),
  env = randomUUID(),
  otherEnv = randomUUID(),
  otherOrg = randomUUID(),
  foreignEnv = randomUUID(),
  domainId = randomUUID();
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  role: 'developer',
  kind: 'api_key',
  permission: 'full_access',
  production: false,
};
const body = {
  from: 'sender@example.com',
  to: ['reader@example.net'],
  subject: 'Hello',
  text: 'Hello',
};
const key = randomBytes(32).toString('base64');
const objects = new Map<string, Buffer>();
let sql: Sql;
let options: PipelineOptions;
let db: PGlite;
let server: PGLiteSocketServer;
const accepted: TransportAdapter = {
  name: 'test',
  supportsRequiredTls: async () => true,
  send: async (m) => ({
    accepted: m.to,
    rejected: [],
    ids: Object.fromEntries(m.to.map((v) => [v, 'provider-id'])),
  }),
};
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((v) => v.endsWith('.sql') && !v.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')", [
    org,
    otherOrg,
  ]);
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$2,'Production'),($4,$5,'Development')",
    [env, org, otherEnv, foreignEnv, otherOrg],
  );
  const keys = generateDomain('example.com', `${org}/${env}`, key);
  await db.query(
    "insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,$3,'example.com','verified',$4,$5,$6)",
    [domainId, org, env, keys.selector, keys.publicKey, keys.cipher],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
  options = {
    sql,
    encryptionKey: key,
    trackingKey: key,
    transports: [accepted],
    store: {
      put: async (k, b) => {
        objects.set(k, b);
      },
      get: async (k) => objects.get(k)!,
      remove: async (k) => {
        objects.delete(k);
      },
    },
  };
}, 30000);
beforeEach(async () => {
  await sql`truncate messages,transport_attempts,message_recipients,delivery_events,event_outbox,idempotency,suppressions,soft_bounces cascade`;
  await sql`update domains set status='verified'`;
  objects.clear();
  options.transports = [accepted];
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
describe('persistent email pipeline', () => {
  it('returns original IDs for concurrent identical requests and conflicts on another body', async () => {
    const requests = await Promise.all(
      Array.from({ length: 5 }, () =>
        submitEmails(options, principal, [{ ...body, scheduled_at: 'in 2 hours' }], {
          key: 'same',
        }),
      ),
    );
    expect(new Set(requests.map((v) => v.data[0]!.id)).size).toBe(1);
    expect(await sql`select * from messages`).toHaveLength(1);
    await expect(
      submitEmails(options, principal, [{ ...body, subject: 'changed' }], { key: 'same' }),
    ).rejects.toMatchObject({ status: 409 });
    await sql`update idempotency set expires_at=now()-interval '1 second'`;
    expect((await submitEmails(options, principal, [body], { key: 'same' })).data[0]!.id).not.toBe(
      requests[0]!.data[0]!.id,
    );
  });
  it('rolls back an entire strict batch and removes uploaded objects', async () => {
    await expect(
      submitEmails(options, principal, [body, { ...body, from: 'sender@unverified.com' }], {
        batch: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await sql`select * from messages`).toHaveLength(0);
    expect(objects.size).toBe(0);
    expect(await sql`select * from event_outbox`).toHaveLength(0);
    const result = await submitEmails(
      options,
      principal,
      [body, { ...body, from: 'sender@unverified.com' }],
      { batch: true, mode: 'permissive' },
    );
    expect(result.data).toHaveLength(1);
    expect(result.errors[0]!.index).toBe(1);
  });
  it('enforces domain scopes and tenant reads independently of SQL predicates', async () => {
    await expect(
      submitEmails(options, { ...principal, domainId: randomUUID() }, [body]),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      submitEmails(options, { ...principal, orgId: otherOrg, environmentId: foreignEnv }, [body]),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(${randomUUID()},${otherOrg},${foreignEnv},${domainId},'{}','sender@example.com','queued')`,
    ).rejects.toThrow(/foreign key/);
    await submitEmails(options, principal, [body]);
    expect(
      await withTenant(
        sql,
        { orgId: otherOrg, environmentId: foreignEnv },
        (tx) => tx`select * from messages`,
      ),
    ).toHaveLength(0);
    expect(
      await withTenant(
        sql,
        { orgId: org, environmentId: otherEnv },
        (tx) => tx`select * from messages`,
      ),
    ).toHaveLength(0);
  });
  it('checks org-wide suppression at acceptance and again immediately before sending', async () => {
    await sql`insert into suppressions(org_id,address,reason) values(${org},'reader@example.net','manual')`;
    expect(
      await withTenant(
        sql,
        { orgId: org, environmentId: otherEnv },
        (tx) => tx`select * from suppressions`,
      ),
    ).toHaveLength(1);
    expect(
      await withTenant(
        sql,
        { orgId: otherOrg, environmentId: foreignEnv },
        (tx) => tx`select * from suppressions`,
      ),
    ).toHaveLength(0);
    const result = await submitEmails(options, principal, [body]);
    expect(objects.size).toBe(0);
    expect((await sql`select status from messages where id=${result.data[0]!.id}`)[0]!.status).toBe(
      'suppressed',
    );
    await sql`delete from suppressions`;
    const queued = await submitEmails(options, principal, [body]);
    await sql`insert into suppressions(org_id,address,reason) values(${org},'reader@example.net','manual')`;
    await deliverEmail(options, queued.data[0]!.id);
    expect(await sql`select * from transport_attempts`).toHaveLength(0);
    expect((await sql`select status from messages where id=${queued.data[0]!.id}`)[0]!.status).toBe(
      'suppressed',
    );
  });
  it('uses a delivery claim to prevent duplicate sends and cancellation races', async () => {
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const began = new Promise<void>((r) => {
      started = r;
    });
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    options.transports = [
      {
        ...accepted,
        send: async (m) => {
          calls++;
          started();
          await blocked;
          return accepted.send(m);
        },
      },
    ];
    const id = (await submitEmails(options, principal, [body])).data[0]!.id;
    const sending = deliverEmail(options, id);
    await began;
    await expect(changeSchedule(sql, principal, id, null)).rejects.toMatchObject({ status: 409 });
    await expect(changeSchedule(sql, principal, id, 'in 2 hours')).rejects.toMatchObject({
      status: 409,
    });
    await deliverEmail(options, id);
    release();
    await sending;
    expect(calls).toBe(1);
    expect((await sql`select status from messages where id=${id}`)[0]!.status).toBe('sent');
  });
  it('does not send canceled mail or a rescheduled job before its new time', async () => {
    const id = (await submitEmails(options, principal, [body])).data[0]!.id;
    await changeSchedule(sql, principal, id, 'in 2 hours');
    await deliverEmail(options, id);
    expect(await sql`select * from transport_attempts`).toHaveLength(0);
    await changeSchedule(sql, principal, id, null);
    await deliverEmail(options, id);
    expect((await sql`select status from messages where id=${id}`)[0]!.status).toBe('canceled');
  });
  it('records failover in order and reuses exactly the same signed MIME', async () => {
    const raws: Buffer[] = [];
    options.transports = [
      {
        ...accepted,
        name: 'reject',
        send: async (m) => {
          raws.push(m.raw);
          throw new TransportError('Rejected', 'permanent');
        },
      },
      {
        ...accepted,
        send: async (m) => {
          raws.push(m.raw);
          return accepted.send(m);
        },
      },
    ];
    const id = (await submitEmails(options, principal, [body])).data[0]!.id;
    await deliverEmail(options, id);
    expect(
      (await sql`select provider,status from transport_attempts order by ordinal`).map((v) => [
        v.provider,
        v.status,
      ]),
    ).toEqual([
      ['reject', 'permanent_failure'],
      ['test', 'accepted'],
    ]);
    expect(raws[0]!.equals(raws[1]!)).toBe(true);
  });
  it('retries three transient failures before failing over without changing MIME', async () => {
    let calls = 0;
    options.transports = [
      {
        ...accepted,
        name: 'busy',
        send: async () => {
          calls++;
          throw new TransportError('Busy', 'transient');
        },
      },
      accepted,
    ];
    const id = (await submitEmails(options, principal, [body])).data[0]!.id;
    await deliverEmail(options, id);
    expect(calls).toBe(4);
    expect(
      (await sql`select provider from transport_attempts order by ordinal`).map((v) => v.provider),
    ).toEqual(['busy', 'busy', 'busy', 'busy', 'test']);
  }, 15000);
  it('retries only temporarily rejected recipients after partial SMTP acceptance', async () => {
    const sent: string[][] = [];
    options.transports = [
      {
        ...accepted,
        send: async (m) => {
          sent.push(m.to);
          return sent.length === 1
            ? {
                accepted: [m.to[0]!],
                rejected: [],
                retryableRejected: [m.to[1]!],
                ids: { [m.to[0]!]: 'first' },
              }
            : accepted.send(m);
        },
      },
    ];
    const id = (
      await submitEmails(options, principal, [
        { ...body, to: ['first@example.net', 'second@example.net'] },
      ])
    ).data[0]!.id;
    await deliverEmail(options, id);
    expect(sent).toEqual([['first@example.net', 'second@example.net'], ['second@example.net']]);
    expect(
      (await sql`select status from message_recipients where message_id=${id}`).map(
        (v) => v.status,
      ),
    ).toEqual(['sent', 'sent']);
  });
  it('stops on ambiguous acceptance and recovers expired claims without silent redelivery', async () => {
    options.transports = [
      {
        ...accepted,
        send: async () => {
          throw new TransportError('Lost response', 'ambiguous');
        },
      },
      accepted,
    ];
    const id = (await submitEmails(options, principal, [body])).data[0]!.id;
    await deliverEmail(options, id);
    expect(await sql`select * from transport_attempts`).toHaveLength(1);
    expect((await sql`select status from messages where id=${id}`)[0]!.status).toBe('failed');
    const other = (await submitEmails(options, principal, [body])).data[0]!.id;
    await sql`update messages set claim_id=${randomUUID()},delivery_started_at=now(),lease_until=now()-interval '1 minute' where id=${other}`;
    await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,recipients) values(${org},${env},${other},'test',1,'started','[]')`;
    await recoverDeliveries(sql);
    expect((await sql`select status from messages where id=${other}`)[0]!.status).toBe('failed');
    await recordEvent(sql, principal, {
      source: 'postal',
      sourceId: randomUUID(),
      messageId: other,
      recipient: 'reader@example.net',
      type: 'delivered',
    });
    expect((await sql`select status from messages where id=${other}`)[0]!.status).toBe('delivered');
  });
  it('deduplicates events, preserves terminal states, and suppresses complaints organization-wide', async () => {
    const id = (await submitEmails(options, principal, [body])).data[0]!.id;
    await deliverEmail(options, id);
    const event = {
      source: 'test',
      sourceId: randomUUID(),
      messageId: id,
      recipient: 'reader@example.net',
      type: 'complained' as const,
    };
    await recordEvent(sql, principal, event);
    expect((await recordEvent(sql, principal, event)).duplicate).toBe(true);
    await recordEvent(sql, principal, { ...event, sourceId: randomUUID(), type: 'delivered' });
    expect((await sql`select status from messages where id=${id}`)[0]!.status).toBe('complained');
    expect(await sql`select * from suppressions where org_id=${org}`).toHaveLength(1);
    expect(await sql`select * from delivery_events`).toHaveLength(2);
  });
  it('suppresses after three distinct soft-bounced messages within seven days', async () => {
    for (let i = 0; i < 3; i++) {
      const id = (await submitEmails(options, principal, [body])).data[0]!.id;
      await deliverEmail(options, id);
      await recordEvent(sql, principal, {
        source: 'test',
        sourceId: randomUUID(),
        messageId: id,
        recipient: 'reader@example.net',
        type: 'bounced',
        hardBounce: false,
      });
      if (i < 2) expect(await sql`select * from suppressions`).toHaveLength(0);
    }
    expect((await sql`select reason from suppressions`)[0]!.reason).toBe('soft_bounce');
  });
  it('keeps API-key scope immutable in PostgreSQL and preserves cached IDs after DNS drift', async () => {
    const [apiKey] =
      await sql`insert into api_keys(org_id,environment_id,name,token_hash,prefix,permission,domain_id) values(${org},${env},'test',${randomUUID()},'fl_test','sending_access',${domainId}) returning id`;
    await expect(sql`update api_keys set domain_id=null where id=${apiKey!.id}`).rejects.toThrow(
      'immutable',
    );
    await expect(
      sql`update api_keys set permission='full_access' where id=${apiKey!.id}`,
    ).rejects.toThrow('immutable');
    const first = await submitEmails(options, principal, [body], { key: 'drift' });
    await sql`update domains set status='failed'`;
    expect(await submitEmails(options, principal, [body], { key: 'drift' })).toEqual(first);
    await expect(submitEmails(options, principal, [body])).rejects.toMatchObject({ status: 403 });
  });
});
