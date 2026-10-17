import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, toJson } from '@flare/db';
import type { Transaction } from '@flare/db';
import { advancePublication, createPublication } from '@flare/platform';
import { workflowSchema } from '@flare/shared';
import type { Principal } from '@flare/shared';
import { integrationTargets } from './targets.mjs';

const { databaseUrl } = integrationTargets();
const first = connectDatabase(databaseUrl, { max: 1 }).client;
const second = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const org = randomUUID(),
  env = randomUUID(),
  production = randomUUID();
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'session',
  role: 'owner',
  production: false,
};
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
      throw new Error('Publication ended before the controlled engine call');
    }),
  ]);
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
  await first`insert into organizations(id,name,slug) values(${org},'Publication recovery','publication-recovery')`;
  await first`insert into environments(id,org_id,name) values(${env},${org},'Development'),(${production},${org},'Production')`;
});
beforeEach(async () => {
  await first`truncate publication_operations,workflows cascade`;
});
afterAll(async () => {
  await Promise.all([
    first.end({ timeout: 5 }),
    second.end({ timeout: 5 }),
    observer.end({ timeout: 5 }),
  ]);
});
async function setup() {
  const definition = workflowSchema.parse({ workflowId: 'welcome', name: 'Welcome', steps: [] });
  await observer`insert into workflows(org_id,environment_id,identifier,definition,source_definition) values(${org},${env},'welcome',${observer.json(toJson(definition))},${observer.json(toJson(definition))})`;
  const old = { ...definition, name: 'Old' };
  await observer`insert into workflows(org_id,environment_id,identifier,definition,source_definition) values(${org},${production},'welcome',${observer.json(toJson(old))},${observer.json(toJson(old))})`;
  return createPublication(observer, principal, { workflows: ['welcome'] });
}
it('keeps competing publishers out until an engine failure and its full backoff commit', async () => {
  const { id } = await setup();
  const started = gate(),
    release = gate();
  const competitor = vi.fn(async () => undefined);
  let failedAfter: string | undefined;
  const work = outcome(
    advancePublication(first, id, async () => {
      started.release();
      await release.promise;
      throw new Error('controlled transient engine error');
    }),
  );
  try {
    await entered(started, work);
    await advancePublication(second, id, competitor);
    expect(competitor).not.toHaveBeenCalled();
    expect(
      (
        await observer`select status,attempts,failures from publication_items where operation_id=${id}`
      )[0],
    ).toEqual({ status: 'pending', attempts: 0, failures: 0 });
    failedAfter = String((await observer`select clock_timestamp()::text as at`)[0]!.at);
  } finally {
    release.release();
    await work;
  }
  expect((await work).error).toBeInstanceOf(Error);
  const [pending] =
    await observer`select status,attempts,failures,next_attempt_at from publication_items where operation_id=${id}`;
  expect(pending).toMatchObject({ status: 'pending', attempts: 1, failures: 1 });
  // Preserve database timestamp precision; Date -> String drops fractional seconds.
  expect(
    (
      await observer`select next_attempt_at>=${failedAfter!}::text::timestamptz+interval '5 seconds' as full_backoff from publication_items where operation_id=${id}`
    )[0]?.full_backoff,
  ).toBe(true);
  await advancePublication(second, id, competitor);
  expect(competitor).not.toHaveBeenCalled();
  expect(
    (
      await observer`select definition,publication_blocked from workflows where environment_id=${production}`
    )[0],
  ).toMatchObject({ definition: { name: 'Old' }, publication_blocked: true });
  await observer`update publication_items set next_attempt_at=now() where operation_id=${id}`;
  await advancePublication(second, id, competitor);
  expect(competitor).toHaveBeenCalledTimes(1);
  expect(
    (
      await observer`select status,attempts,failures from publication_items where operation_id=${id}`
    )[0],
  ).toEqual({ status: 'completed', attempts: 2, failures: 1 });
});
it('recovers after database loss without recording a stale failure over the reconciled engine update', async () => {
  const { id } = await setup();
  const started = gate(),
    release = gate(),
    finished = gate();
  const [backend] = await first`select pg_backend_pid() as pid`;
  const [other] = await second`select pg_backend_pid() as pid`;
  expect(backend!.pid).not.toBe(other!.pid);
  let remoteAccepted = false;
  let transactions = 0;
  const observed = new Proxy(first, {
    get(target, property, receiver) {
      if (property !== 'begin') return Reflect.get(target, property, receiver);
      return (action: (tx: Transaction) => Promise<unknown>) => {
        const transaction = ++transactions;
        return first.begin(async (tx) => {
          try {
            return await action(tx);
          } finally {
            // begin rejects on socket loss while its callback can remain suspended.
            // Observe the entire attempt callback, including savepoint rollback and
            // the attempted failure recorder, before asserting the final rows.
            if (transaction === 2) finished.release();
          }
        });
      };
    },
  });
  const work = outcome(
    advancePublication(observed, id, async () => {
      remoteAccepted = true;
      started.release();
      await release.promise;
      throw new Error('lost response from accepted update');
    }),
  );
  try {
    await entered(started, work);
    expect(
      (await observer`select pg_terminate_backend(${backend!.pid}) as stopped`)[0]!.stopped,
    ).toBe(true);
    expect((await work).error).toBeDefined();
    // The original callback is still suspended while its client reconnects. A database
    // disconnect must not start a separate failure transaction or increment attempts.
    const [replacement] = await first`select pg_backend_pid() as pid`;
    expect(replacement!.pid).not.toBe(backend!.pid);
    expect(
      (
        await observer`select status,attempts,failures from publication_items where operation_id=${id}`
      )[0],
    ).toEqual({ status: 'pending', attempts: 0, failures: 0 });
    await advancePublication(second, id, async () => {
      expect(remoteAccepted).toBe(true);
    });
  } finally {
    release.release();
    await work;
    if (remoteAccepted) await finished.promise;
  }
  // The entire resumed callback settled; neither its savepoint nor its failure
  // recorder may write to the reconnected pool or a new transaction.
  expect(
    (
      await observer`select status,attempts,failures,error from publication_items where operation_id=${id}`
    )[0],
  ).toEqual({ status: 'completed', attempts: 1, failures: 0, error: null });
  expect(
    (
      await observer`select definition,publication_blocked from workflows where environment_id=${production}`
    )[0],
  ).toMatchObject({ definition: { name: 'Welcome' }, publication_blocked: false });
});
