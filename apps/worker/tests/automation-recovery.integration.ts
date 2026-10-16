import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase, toJson } from '@flare/db';
import type { Sql } from '@flare/db';
import { generateDomain } from '@flare/mail';
import type { PipelineOptions } from '@flare/mail';
import { automationSchema } from '@flare/shared';
import type { Principal } from '@flare/shared';
import {
  advanceAutomation,
  cancelAutomation,
  createAutomationEvent,
  fanOutAutomationEvents,
  redriveDeadLetter,
} from '@flare/platform';
import { integrationTargets } from './targets.mjs';

const { databaseUrl } = integrationTargets();
const first = connectDatabase(databaseUrl, { max: 1 }).client;
const second = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const application = `flare-auto-${randomUUID()}`;
const org = randomUUID(),
  env = randomUUID(),
  domain = randomUUID(),
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
function options(sql: Sql, put?: (key: string, body: Buffer) => Promise<void>): PipelineOptions {
  return {
    sql,
    encryptionKey: key,
    trackingKey: key,
    transports: [
      {
        name: 'test',
        sandbox: true,
        supportsRequiredTls: async () => true,
        send: async () => {
          throw new Error('Automation advancement must not dispatch mail');
        },
      },
    ],
    // Deliberately bounded in-memory storage: these tests exercise database
    // commit/rollback and worker races, not S3 crash cleanup (covered separately).
    store: {
      put:
        put ??
        (async (objectKey, body) => {
          objects.set(objectKey, body);
        }),
      get: async (objectKey) => objects.get(objectKey)!,
      remove: async (objectKey) => {
        objects.delete(objectKey);
      },
    },
  };
}
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
    work.then(() => {
      throw new Error('Automation finished before reaching the controlled PUT');
    }),
  ]);
}
async function blocked() {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const rows =
      await observer`select pid from pg_stat_activity where application_name=${`${application}-second`} and wait_event_type='Lock'`;
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Competing automation operation did not wait for the transaction lock');
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
  await first`select set_config('application_name',${`${application}-first`},false)`;
  await second`select set_config('application_name',${`${application}-second`},false)`;
  await first`insert into organizations(id,name,slug) values(${org},'Automation recovery','automation-recovery')`;
  await first`insert into environments(id,org_id,name) values(${env},${org},'Development')`;
  const keys = generateDomain('example.com', `${org}/${env}`, key);
  await first`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${domain},${org},${env},'example.com','verified',${keys.selector},${keys.publicKey},${keys.cipher})`;
});
beforeEach(async () => {
  await first`truncate automations,contacts,email_templates,messages,event_outbox,idempotency cascade`;
  objects.clear();
});
afterAll(async () => {
  await Promise.all([
    first.end({ timeout: 5 }),
    second.end({ timeout: 5 }),
    observer.end({ timeout: 5 }),
  ]);
});
async function templateVersion(template: string) {
  await observer`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${org},${env},${template},1,'Welcome','<a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>')`;
}
async function setup() {
  const contact = randomUUID(),
    template = randomUUID();
  await observer`insert into contacts(id,org_id,environment_id,email) values(${contact},${org},${env},'reader@example.net')`;
  await observer`insert into email_templates(id,org_id,environment_id,name,identifier) values(${template},${org},${env},'Welcome','welcome')`;
  await templateVersion(template);
  const definition = automationSchema.parse({
    trigger: 'signed_up',
    entry: 'welcome',
    steps: [
      {
        id: 'welcome',
        name: 'Welcome',
        type: 'send_email',
        from: 'sender@example.com',
        template_id: template,
        template_version: 1,
        next: 'pause',
      },
      { id: 'pause', name: 'Pause', type: 'wait', seconds: 3600, next: null },
    ],
  });
  await observer`insert into automations(org_id,environment_id,identifier,name,definition,enabled) values(${org},${env},'welcome','Welcome',${observer.json(toJson(definition))},true)`;
  const event = await createAutomationEvent(observer, principal, {
    contact_id: contact,
    name: 'signed_up',
    external_id: 'signup-1',
  });
  await fanOutAutomationEvents(observer);
  const [run] = await observer`select id from automation_runs where event_id=${event.id}`;
  return { id: String(run!.id), template };
}
it('persists one transient failure before a blocked competing worker can retry the step', async () => {
  const { id } = await setup();
  const started = gate(),
    release = gate();
  let puts = 0;
  const failure = new Error('Controlled temporary object-store failure');
  const work = outcome(
    advanceAutomation(
      options(first, async () => {
        puts++;
        started.release();
        await release.promise;
        throw failure;
      }),
      id,
    ),
  );
  let competitor: ReturnType<typeof outcome> | undefined;
  let beforeFailure: string | undefined;
  try {
    await entered(started, work);
    competitor = outcome(advanceAutomation(options(second), id));
    await blocked();
    expect((await observer`select attempts,status from automation_runs where id=${id}`)[0]).toEqual(
      {
        attempts: 0,
        status: 'queued',
      },
    );
    beforeFailure = String((await observer`select clock_timestamp()::text as at`)[0]!.at);
  } finally {
    release.release();
    await work;
    await competitor;
  }
  expect((await work).error).toBe(failure);
  expect((await competitor)?.error).toBeUndefined();
  expect(puts).toBe(1);
  expect(
    (
      await observer`select next_step_at>=${beforeFailure!}::text::timestamptz+interval '2 seconds' as full_backoff from automation_runs where id=${id}`
    )[0]!.full_backoff,
  ).toBe(true);
  expect(
    (
      await observer`select attempts,status,current_step,error,next_step_at>now() as deferred from automation_runs where id=${id}`
    )[0],
  ).toMatchObject({
    attempts: 1,
    status: 'queued',
    current_step: 'welcome',
    error: failure.message,
    deferred: true,
  });
  expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(0);
  expect(await observer`select step_id from automation_steps where run_id=${id}`).toHaveLength(0);
  await observer`update automation_runs set next_step_at=now() where id=${id}`;
  await advanceAutomation(options(second), id);
  expect(
    (await observer`select attempts,error,current_step from automation_runs where id=${id}`)[0],
  ).toEqual({ attempts: 0, error: null, current_step: 'pause' });
  expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(1);
});
it('lets cancellation win after an in-flight failure without leaving work eligible for recovery', async () => {
  const { id } = await setup();
  const started = gate(),
    release = gate();
  const work = outcome(
    advanceAutomation(
      options(first, async () => {
        started.release();
        await release.promise;
        throw new Error('Object store temporarily unavailable');
      }),
      id,
    ),
  );
  let cancellation: ReturnType<typeof outcome> | undefined;
  try {
    await entered(started, work);
    cancellation = outcome(cancelAutomation(second, principal, id));
    await blocked();
  } finally {
    release.release();
    await work;
    await cancellation;
  }
  expect((await work).error).toBeInstanceOf(Error);
  expect((await cancellation)?.error).toBeUndefined();
  await advanceAutomation(options(first), id);
  await expect(redriveDeadLetter(second, principal, 'automation', id)).rejects.toMatchObject({
    status: 409,
  });
  expect((await observer`select attempts,status from automation_runs where id=${id}`)[0]).toEqual({
    attempts: 1,
    status: 'canceled',
  });
  expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(0);
  expect(
    await observer`select id from event_outbox where type='automation.canceled' and data->>'id'=${id}`,
  ).toHaveLength(1);
});
it('commits permanent failure before returning and permits only an explicit redrive to advance', async () => {
  const { id, template } = await setup();
  await observer`delete from template_versions where template_id=${template}`;
  await expect(advanceAutomation(options(first), id)).rejects.toMatchObject({ status: 422 });
  expect(
    (await observer`select status,attempts,current_step from automation_runs where id=${id}`)[0],
  ).toEqual({ status: 'failed', attempts: 1, current_step: 'welcome' });
  await templateVersion(template);
  await advanceAutomation(options(second), id);
  expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(0);
  const redrives = await Promise.all([
    outcome(redriveDeadLetter(first, principal, 'automation', id)),
    outcome(redriveDeadLetter(second, principal, 'automation', id)),
  ]);
  expect(redrives.filter((result) => result.error === undefined)).toHaveLength(1);
  expect(redrives.find((result) => result.error !== undefined)?.error).toMatchObject({
    status: 409,
  });
  expect(
    await observer`select id from audit_logs where action='dead_letter.automation.redriven' and resource_id=${id}`,
  ).toHaveLength(1);
  await Promise.all([
    advanceAutomation(options(first), id),
    advanceAutomation(options(second), id),
  ]);
  expect(
    (
      await observer`select status,attempts,current_step,error from automation_runs where id=${id}`
    )[0],
  ).toMatchObject({ attempts: 0, current_step: 'pause', error: null });
  expect(
    (
      await observer`select status,error from automation_steps where run_id=${id} and step_id='welcome'`
    )[0],
  ).toEqual({ status: 'completed', error: null });
  expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(1);
  expect(
    await observer`select id from event_outbox where type='automation.failed' and data->>'id'=${id}`,
  ).toHaveLength(1);
});
it('commits one message and its completed step before a competing worker advances the successor', async () => {
  const { id } = await setup();
  const started = gate(),
    release = gate();
  const work = outcome(
    advanceAutomation(
      options(first, async (objectKey, body) => {
        started.release();
        await release.promise;
        objects.set(objectKey, body);
      }),
      id,
    ),
  );
  let competitor: ReturnType<typeof outcome> | undefined;
  try {
    await entered(started, work);
    competitor = outcome(advanceAutomation(options(second), id));
    await blocked();
    expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(0);
  } finally {
    release.release();
    await work;
    await competitor;
  }
  expect((await work).error).toBeUndefined();
  expect((await competitor)?.error).toBeUndefined();
  const messages = await observer`select id from messages where automation_run_id=${id}`;
  expect(messages).toHaveLength(1);
  expect(
    (
      await observer`select status,message_id from automation_steps where run_id=${id} and step_id='welcome'`
    )[0],
  ).toEqual({ status: 'completed', message_id: messages[0]!.id });
  expect(
    (await observer`select current_step,status,attempts from automation_runs where id=${id}`)[0],
  ).toEqual({ current_step: 'pause', status: 'waiting', attempts: 0 });
});
it.each([false, true])(
  'recovers once after losing the database connection inside an uncommitted step (reuse pool: %s)',
  async (reusePool) => {
    const { id } = await setup();
    const started = gate(),
      release = gate();
    const [backend] = await first`select pg_backend_pid() as pid`;
    const [other] = await second`select pg_backend_pid() as pid`;
    expect(backend!.pid).not.toBe(other!.pid);
    const work = outcome(
      advanceAutomation(
        options(first, async () => {
          started.release();
          await release.promise;
        }),
        id,
      ),
    );
    try {
      await entered(started, work);
      const [terminated] = await observer`select pg_terminate_backend(${backend!.pid}) as stopped`;
      expect(terminated!.stopped).toBe(true);
      if (reusePool) {
        // The former transaction callback is still suspended. Reusing its client
        // must never let it execute on the newly opened, unrelated connection.
        const [replacement] = await first`select pg_backend_pid() as pid`;
        expect(replacement!.pid).not.toBe(backend!.pid);
      }
      await advanceAutomation(options(second), id);
      expect(
        (await observer`select current_step,attempts,error from automation_runs where id=${id}`)[0],
      ).toEqual({ current_step: 'pause', attempts: 0, error: null });
    } finally {
      release.release();
      await work;
    }
    expect((await work).error).toBeDefined();
    await advanceAutomation(options(second), id);
    expect(
      (
        await observer`select current_step,status,attempts,error from automation_runs where id=${id}`
      )[0],
    ).toEqual({ current_step: 'pause', status: 'waiting', attempts: 0, error: null });
    expect(await observer`select id from messages where automation_run_id=${id}`).toHaveLength(1);
    expect(
      await observer`select id from event_outbox where type='automation.failed' and data->>'id'=${id}`,
    ).toHaveLength(0);
  },
);

async function driver(format: 'esm' | 'cjs') {
  const dbRequire = createRequire(new URL('../../../packages/db/package.json', import.meta.url));
  type Factory = (url: string, options: { max: number; max_pipeline: number }) => Sql;
  const factory: Factory =
    format === 'cjs'
      ? dbRequire('postgres')
      : (
          await import(
            pathToFileURL(resolve(dirname(dbRequire.resolve('postgres')), '../../src/index.js'))
              .href
          )
        ).default;
  return factory(databaseUrl, { max: 1, max_pipeline: 1 });
}
it.each(['esm', 'cjs'] as const)(
  'rejects in-flight and queued savepoint queries after connection loss (%s driver)',
  async (format) => {
    const client = await driver(format);
    const { id } = await setup();
    const [backend] = await client`select pg_backend_pid() as pid`;
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    const work = outcome(
      client.begin(async (tx) => {
        await tx`update automation_runs set attempts=99 where id=${id}`;
        await tx.savepoint(async (step) => {
          // Force both a running query and transaction-local queued work. Every
          // promise must settle after disconnect, including work never sent.
          const queries = [
            step`select pg_sleep(30)`,
            ...Array.from({ length: 149 }, (_, i) => step`select ${i}::int as value`),
          ];
          pending = Promise.allSettled(queries.map((query) => query.execute()));
          const results = await pending;
          const failed = results.find((result) => result.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
        });
      }),
    );
    try {
      let sleeping = false;
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        const rows =
          await observer`select pid from pg_stat_activity where pid=${backend!.pid} and wait_event='PgSleep'`;
        if (rows.length) {
          sleeping = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(sleeping).toBe(true);
      await observer`select pg_terminate_backend(${backend!.pid})`;
      expect((await work).error).toBeInstanceOf(Error);
      expect((await work).error).not.toBeInstanceOf(TypeError);
      const results = await pending;
      expect(results).toHaveLength(150);
      expect(results?.every((result) => result.status === 'rejected')).toBe(true);
      expect((await second`select attempts from automation_runs where id=${id}`)[0]).toEqual({
        attempts: 0,
      });
      const [replacement] = await client`select pg_backend_pid() as pid`.catch((error: unknown) => {
        throw new Error(`First ${format} query after the killed transaction failed`, {
          cause: error,
        });
      });
      expect(replacement!.pid).not.toBe(backend!.pid);
      expect((await client`select 42 as answer`)[0]).toEqual({ answer: 42 });
    } finally {
      await observer`select pg_terminate_backend(${backend!.pid})`;
      await work;
      await pending;
      await client.end({ timeout: 5 });
    }
  },
);

it.each(['esm', 'cjs'] as const)(
  'fences a resumed transaction callback from its reconnected pool (%s driver)',
  async (format) => {
    const client = await driver(format);
    const { id } = await setup();
    const started = gate(),
      release = gate(),
      finished = gate();
    const [backend] = await client`select pg_backend_pid() as pid`;
    let lateError: unknown;
    let reachedCallback = false;
    const work = outcome(
      client.begin(async (tx) => {
        await tx.savepoint(async (step) => {
          reachedCallback = true;
          started.release();
          await release.promise;
          try {
            await step`update automation_runs set attempts=99 where id=${id}`;
          } catch (error) {
            lateError = error;
            throw error;
          } finally {
            // Unlike the rejected outer begin promise, this proves the resumed
            // callback's actual SQL has settled before asserting database state.
            finished.release();
          }
        });
      }),
    );
    try {
      await entered(started, work);
      await observer`select pg_terminate_backend(${backend!.pid})`;
      expect((await work).error).toBeInstanceOf(Error);
      const [replacement] = await client`select pg_backend_pid() as pid`;
      expect(replacement!.pid).not.toBe(backend!.pid);
      release.release();
      await finished.promise;
      expect(lateError).toBeInstanceOf(Error);
      expect(lateError).not.toBeInstanceOf(TypeError);
      expect((await client`select attempts from automation_runs where id=${id}`)[0]).toEqual({
        attempts: 0,
      });
      expect((await client`select 42 as answer`)[0]).toEqual({ answer: 42 });
    } finally {
      release.release();
      await work;
      if (reachedCallback) await finished.promise;
      await client.end({ timeout: 5 });
    }
  },
);
