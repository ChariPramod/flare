import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { connectDatabase } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { registry } from '@flare/shared';
import { collectOperationalMetrics, readOperationalSnapshot } from '../src/operational-metrics.js';
import { integrationTargets } from './targets.mjs';

const { databaseUrl } = integrationTargets();
const first = connectDatabase(databaseUrl, { max: 1 }).client;
const second = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const org = randomUUID(),
  environment = randomUUID();
beforeAll(async () => {
  for (const sql of [first, second, observer]) sql.options.onnotice = () => undefined;
  await first`drop schema public cascade`;
  await first`create schema public`;
  await first`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await first.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await first`insert into organizations(id,name,slug) values(${org},'Operational metrics fixture','operational-metrics')`;
  await first`insert into environments(id,org_id,name) values(${environment},${org},'Development')`;
  await first`insert into workflow_runs(org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload) values(${org},${environment},'fixture','fixture','fixture','{}')`;
});
afterAll(async () => {
  await Promise.all([
    first.end({ timeout: 5 }),
    second.end({ timeout: 5 }),
    observer.end({ timeout: 5 }),
  ]);
});
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
/** Inspect the real transaction after its SET LOCAL commands, immediately before its aggregate. */
function beforeAggregate(check: (tx: Transaction) => Promise<void>): Sql {
  return new Proxy(first, {
    get(target, property, receiver) {
      if (property !== 'begin') return Reflect.get(target, property, receiver);
      return (mode: string, work: (tx: Transaction) => Promise<unknown>) =>
        target.begin(mode, async (tx) =>
          work(
            new Proxy(tx, {
              apply(query, thisArg, args: [TemplateStringsArray, ...unknown[]]) {
                if (args[0].join(' ').includes('with due as'))
                  return check(tx).then(() => Reflect.apply(query, thisArg, args));
                return Reflect.apply(query, thisArg, args);
              },
            }),
          ),
        );
    },
  });
}
it('uses a real read-only snapshot and restores session settings after it commits', async () => {
  const settings: unknown[] = [];
  const snapshot = await readOperationalSnapshot(
    beforeAggregate(async (tx) => {
      settings.push(
        ...(await tx`select current_setting('transaction_read_only') as read_only,current_setting('statement_timeout') as statement_timeout,current_setting('lock_timeout') as lock_timeout`),
      );
      await expect(
        tx.savepoint(
          async (nested) => nested`update organizations set name='must not change' where id=${org}`,
        ),
      ).rejects.toMatchObject({ code: '25006' });
    }),
  );
  expect(settings).toEqual([
    { read_only: 'on', statement_timeout: '2500ms', lock_timeout: '500ms' },
  ]);
  expect(snapshot.due.workflow.count).toBe(1);
  expect((await first`select name from organizations where id=${org}`)[0]?.name).toBe(
    'Operational metrics fixture',
  );
  expect(
    (
      await first`select current_setting('transaction_read_only') as read_only,current_setting('statement_timeout') as statement_timeout,current_setting('lock_timeout') as lock_timeout`
    )[0],
  ).toEqual({ read_only: 'off', statement_timeout: '0', lock_timeout: '0' });
});
it('times out on a real table lock, marks metrics stale and recovers after release', async () => {
  const probes = { redis: async () => undefined, objects: async () => undefined };
  await collectOperationalMetrics(second, probes);
  const prior = (
    await registry.getSingleMetric('flare_operational_collection_timestamp_seconds')!.get()
  ).values;
  const priorCounts = (await registry.getSingleMetric('flare_due_operations')!.get()).values;
  const held = gate(),
    release = gate();
  const holder = first.begin(async (tx) => {
    await tx`lock table messages in access exclusive mode`;
    held.release();
    await release.promise;
  });
  await held.promise;
  const [{ pid }] = await second`select pg_backend_pid() as pid`;
  const work = outcome(collectOperationalMetrics(second, probes));
  try {
    let blocked = false;
    for (let attempts = 0; attempts < 50; attempts++) {
      if (
        (
          await observer`select wait_event_type='Lock' as waiting from pg_stat_activity where pid=${pid}`
        )[0]?.waiting
      ) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(blocked).toBe(true);
    expect((await work).error).toMatchObject({ code: '55P03' });
    expect(
      (await registry.getSingleMetric('flare_operational_collection_success')!.get()).values[0]!
        .value,
    ).toBe(0);
    expect(
      (await registry.getSingleMetric('flare_operational_collection_timestamp_seconds')!.get())
        .values,
    ).toEqual(prior);
    expect((await registry.getSingleMetric('flare_due_operations')!.get()).values).toEqual(
      priorCounts,
    );
  } finally {
    release.release();
    await holder;
    await work;
  }
  await collectOperationalMetrics(second, probes);
  expect(
    (await registry.getSingleMetric('flare_operational_collection_success')!.get()).values[0]!
      .value,
  ).toBe(1);
  expect(
    (await registry.getSingleMetric('flare_operational_collection_timestamp_seconds')!.get())
      .values[0]!.value,
  ).toBeGreaterThan(prior[0]!.value);
});
it('enforces the server statement deadline and leaves the connection usable', async () => {
  await expect(
    readOperationalSnapshot(
      beforeAggregate(async (tx) => {
        await tx`select pg_sleep(5)`;
      }),
    ),
  ).rejects.toMatchObject({ code: '57014' });
  expect((await first`select 1 as ready`)[0]?.ready).toBe(1);
  expect((await readOperationalSnapshot(first)).due.workflow.count).toBe(1);
});
