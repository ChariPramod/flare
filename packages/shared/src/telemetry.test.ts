import { expect, it } from 'vitest';
import {
  failureKinds,
  operationKinds,
  recordOperationalSnapshot,
  registry,
  safetyKinds,
} from './telemetry.js';
import type { OperationalSnapshot } from './telemetry.js';
function snapshot(): OperationalSnapshot {
  return {
    due: Object.fromEntries(operationKinds.map((kind) => [kind, { count: 0, age: 0 }])),
    failed: Object.fromEntries(failureKinds.map((kind) => [kind, 0])),
    safety: Object.fromEntries(safetyKinds.map((kind) => [kind, 0])),
    pending: { workflow: 0, email: 0, webhook: 0 },
  } as OperationalSnapshot;
}
it('publishes only the fixed metric label sets and no untrusted keys', async () => {
  const value = snapshot();
  value.due.email = { count: 2, age: 301 };
  (value.due as Record<string, unknown>)['recipient@example.test'] = { count: 10, age: 900 };
  recordOperationalSnapshot(value, 123);
  const text = await registry.metrics();
  expect(text).toContain('flare_due_operations{kind="email",service="flare"} 2');
  expect(text).toContain('flare_oldest_due_operation_seconds{kind="email",service="flare"} 301');
  expect(text).toContain('flare_operational_collection_timestamp_seconds{service="flare"} 123');
  expect(text).not.toContain('recipient@example.test');
  const labels = (await registry.getSingleMetric('flare_sending_safety_issues')!.get()).values.map(
    (value) => value.labels.kind,
  );
  expect(labels.sort()).toEqual([...safetyKinds].sort());
});
it('rejects invalid snapshots before replacing any metric or freshness evidence', async () => {
  recordOperationalSnapshot(snapshot(), 456);
  const before = await registry.getSingleMetric('flare_due_operations')!.get();
  const value = snapshot();
  value.due.email = { count: 2, age: 10 };
  value.failed.publication = 10002;
  expect(() => recordOperationalSnapshot(value, 789)).toThrow(
    'Invalid operational metric snapshot',
  );
  expect((await registry.getSingleMetric('flare_due_operations')!.get()).values).toEqual(
    before.values,
  );
  expect(
    (await registry.getSingleMetric('flare_operational_collection_timestamp_seconds')!.get())
      .values[0]!.value,
  ).toBe(456);
});
