import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '@flare/db';
import type { Transaction } from '@flare/db';
import { generateDomain } from '@flare/mail';
import type { PipelineOptions } from '@flare/mail';
import { cancelBroadcast, dispatchBroadcast, scheduleBroadcast } from '@flare/platform';
import type { Principal } from '@flare/shared';
import { integrationTargets } from './targets.mjs';

const { databaseUrl } = integrationTargets();
const first = connectDatabase(databaseUrl, { max: 1 }).client;
const second = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const org = randomUUID(),
  env = randomUUID(),
  key = randomBytes(32).toString('base64');
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'session',
  role: 'owner',
  production: false,
};
const objects = new Map<string, Buffer>();
const base: PipelineOptions = {
  sql: first,
  encryptionKey: key,
  trackingKey: key,
  transports: [
    {
      name: 'test',
      sandbox: true,
      supportsRequiredTls: async () => true,
      send: async () => {
        throw new Error('Broadcast admission must never invoke a transport');
      },
    },
  ],
  store: {
    put: async (name, value) => {
      objects.set(name, value);
    },
    get: async (name) => objects.get(name)!,
    remove: async (name) => {
      objects.delete(name);
    },
  },
};
const preferenceBase = 'https://flare.example.test';
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}
async function entered(signal: ReturnType<typeof gate>, work: Promise<unknown>) {
  await Promise.race([
    signal.promise,
    work.then((result) => {
      if (result && typeof result === 'object' && 'error' in result && result.error)
        throw result.error;
      throw new Error(
        `Broadcast ended before the controlled storage call: ${JSON.stringify(result)}`,
      );
    }),
  ]);
}
async function waiting(pid: number) {
  for (let count = 0; count < 100; count++) {
    if (
      (
        await observer`select wait_event_type='Lock' as waiting from pg_stat_activity where pid=${pid}`
      )[0]?.waiting
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Competing operation did not wait on the original policy lock');
}
beforeAll(async () => {
  for (const sql of [first, second, observer]) sql.options.onnotice = () => undefined;
  await first`drop schema public cascade`;
  await first`create schema public`;
  await first`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await first.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await first`insert into organizations(id,name,slug) values(${org},'Broadcast recovery','broadcast-recovery')`;
  await first`insert into environments(id,org_id,name) values(${env},${org},'Development')`;
  const keys = generateDomain('example.com', `${org}/${env}`, key);
  await first`insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${org},${env},'example.com','verified',${keys.selector},${keys.publicKey},${keys.cipher})`;
});
beforeEach(async () => {
  await first`truncate contacts,email_templates,broadcasts,messages,event_outbox cascade`;
  objects.clear();
});
afterAll(async () => {
  await Promise.all([
    first.end({ timeout: 5 }),
    second.end({ timeout: 5 }),
    observer.end({ timeout: 5 }),
  ]);
});
async function setup(rate = 1) {
  const id = randomUUID(),
    template = randomUUID();
  await observer`insert into email_templates(id,org_id,environment_id,name,identifier) values(${template},${org},${env},'Recovery','recovery')`;
  await observer`insert into template_versions(org_id,environment_id,template_id,version,subject,html,variables) values(${org},${env},${template},1,'Recovery','<a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>','{}')`;
  await observer`insert into contacts(org_id,environment_id,email) values(${org},${env},'first@example.net'),(${org},${env},'second@example.net'),(${org},${env},'third@example.net')`;
  await observer`insert into broadcasts(id,org_id,environment_id,name,sender,template_id,template_version,rate_per_second) values(${id},${org},${env},'Recovery','sender@example.com',${template},1,${rate})`;
  await scheduleBroadcast(observer, principal, id);
  return id;
}
it('rolls back the entire failed batch and commits full backoff before a waiting dispatcher resumes', async () => {
  const id = await setup(2);
  const [backend] = await second`select pg_backend_pid() as pid`;
  const started = gate(),
    release = gate();
  let puts = 0;
  const failed = {
    ...base,
    store: {
      ...base.store,
      put: async (name: string, value: Buffer) => {
        if (++puts === 1) return base.store.put(name, value, 'message/rfc822');
        started.release();
        await release.promise;
        throw new Error('controlled second-recipient storage failure');
      },
    },
  };
  const work = outcome(dispatchBroadcast(failed, id, preferenceBase));
  let competing: ReturnType<typeof outcome> | undefined;
  let failedAfter = '';
  try {
    await entered(started, work);
    competing = outcome(dispatchBroadcast({ ...base, sql: second }, id, preferenceBase));
    await waiting(Number(backend!.pid));
    failedAfter = String((await observer`select clock_timestamp()::text as at`)[0]!.at);
  } finally {
    release.release();
    await work;
    await competing;
  }
  expect((await work).error).toBeInstanceOf(Error);
  expect(await competing).toEqual({ value: undefined, error: undefined });
  expect(
    (
      await observer`select status,error,next_dispatch_at>=${failedAfter}::text::timestamptz+interval '1 minute' as full_backoff from broadcasts where id=${id}`
    )[0],
  ).toEqual({
    status: 'scheduled',
    error: 'controlled second-recipient storage failure',
    full_backoff: true,
  });
  expect(await observer`select * from messages where broadcast_id=${id}`).toHaveLength(0);
  expect(
    await observer`select * from broadcast_recipients where broadcast_id=${id} and status='pending'`,
  ).toHaveLength(3);
  expect(await observer`select * from event_outbox where type='broadcast.started'`).toHaveLength(0);
  await observer`update broadcasts set next_dispatch_at=clock_timestamp() where id=${id}`;
  expect(await dispatchBroadcast({ ...base, sql: second }, id, preferenceBase)).toEqual({
    processed: 2,
    finished: false,
  });
  expect(await observer`select * from messages where broadcast_id=${id}`).toHaveLength(2);
  expect(await observer`select * from event_outbox where type='broadcast.started'`).toHaveLength(1);
});
it('starts pacing after batch completion rather than transaction start', async () => {
  const id = await setup();
  const started = gate(),
    release = gate();
  const slow = {
    ...base,
    store: {
      ...base.store,
      put: async (name: string, value: Buffer) => {
        started.release();
        await release.promise;
        await base.store.put(name, value, 'message/rfc822');
      },
    },
  };
  const work = outcome(dispatchBroadcast(slow, id, preferenceBase));
  let completedAfter = '';
  try {
    await entered(started, work);
    completedAfter = String((await observer`select clock_timestamp()::text as at`)[0]!.at);
  } finally {
    release.release();
    await work;
  }
  expect(await work).toEqual({ value: { processed: 1, finished: false }, error: undefined });
  expect(
    (
      await observer`select next_dispatch_at>=${completedAfter}::text::timestamptz+interval '1 second' as full_spacing from broadcasts where id=${id}`
    )[0]?.full_spacing,
  ).toBe(true);
  expect(await dispatchBroadcast({ ...base, sql: second }, id, preferenceBase)).toBeUndefined();
});
it('lets cancellation take effect after a failed batch without reviving recipients', async () => {
  const id = await setup();
  const [backend] = await second`select pg_backend_pid() as pid`;
  const started = gate(),
    release = gate();
  const failed = {
    ...base,
    store: {
      ...base.store,
      put: async () => {
        started.release();
        await release.promise;
        throw new Error('controlled storage failure');
      },
    },
  };
  const work = outcome(dispatchBroadcast(failed, id, preferenceBase));
  let canceled: ReturnType<typeof outcome> | undefined;
  try {
    await entered(started, work);
    canceled = outcome(cancelBroadcast(second, principal, id));
    await waiting(Number(backend!.pid));
  } finally {
    release.release();
    await work;
    await canceled;
  }
  expect((await work).error).toBeInstanceOf(Error);
  expect((await canceled)?.value).toMatchObject({ status: 'canceled', canceled_messages: 0 });
  expect(await dispatchBroadcast({ ...base, sql: second }, id, preferenceBase)).toBeUndefined();
  expect((await observer`select status from broadcasts where id=${id}`)[0]?.status).toBe(
    'canceled',
  );
  expect(
    await observer`select * from broadcast_recipients where broadcast_id=${id} and status='canceled'`,
  ).toHaveLength(3);
  expect(await observer`select * from messages where broadcast_id=${id}`).toHaveLength(0);
  expect(await observer`select * from event_outbox where type='broadcast.canceled'`).toHaveLength(
    1,
  );
});
it('does not let a disconnected callback overwrite a recovered batch on a new connection', async () => {
  const id = await setup();
  const [backend] = await first`select pg_backend_pid() as pid`;
  const started = gate(),
    release = gate(),
    finished = gate();
  let callbacks = 0;
  const observed = new Proxy(first, {
    get(target, property, receiver) {
      if (property !== 'begin') return Reflect.get(target, property, receiver);
      return (action: (tx: Transaction) => Promise<unknown>) =>
        first.begin(async (tx) => {
          callbacks++;
          try {
            return await action(tx);
          } finally {
            finished.release();
          }
        });
    },
  });
  let suspended = false;
  const failed = {
    ...base,
    sql: observed,
    store: {
      ...base.store,
      put: async () => {
        suspended = true;
        started.release();
        await release.promise;
        throw new Error('stale storage response after disconnect');
      },
    },
  };
  const work = outcome(dispatchBroadcast(failed, id, preferenceBase));
  try {
    await entered(started, work);
    expect(
      (await observer`select pg_terminate_backend(${backend!.pid}) as stopped`)[0]?.stopped,
    ).toBe(true);
    expect((await work).error).toBeDefined();
    expect((await first`select pg_backend_pid() as pid`)[0]?.pid).not.toBe(backend!.pid);
    expect(await dispatchBroadcast({ ...base, sql: second }, id, preferenceBase)).toEqual({
      processed: 1,
      finished: false,
    });
  } finally {
    release.release();
    await work;
    if (suspended) await finished.promise;
  }
  expect(callbacks).toBe(1);
  expect((await observer`select status,error from broadcasts where id=${id}`)[0]).toEqual({
    status: 'sending',
    error: null,
  });
  expect(await observer`select * from messages where broadcast_id=${id}`).toHaveLength(1);
  expect(
    await observer`select * from broadcast_recipients where broadcast_id=${id} and status='queued'`,
  ).toHaveLength(1);
  expect(await observer`select * from event_outbox where type='broadcast.started'`).toHaveLength(1);
});
