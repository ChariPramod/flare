import assert from 'node:assert/strict';

export type EvalCase = { id: string; criterion: string; expected?: unknown; error?: string };

// A malformed fixture must fail discovery, never silently drop a case or expectation.
export function cases<T extends EvalCase>(input: T[]): T[] {
  const seen = new Set<string>();
  for (const item of input) {
    assert.match(item.id, /^[a-z][a-z0-9.-]+$/, 'Every eval needs a stable case ID');
    assert.ok(!seen.has(item.id), `Duplicate eval case ID: ${item.id}`);
    seen.add(item.id);
    assert.ok(item.criterion?.trim(), `${item.id}: a criterion is required`);
    assert.equal(
      Number(item.expected !== undefined) + Number(item.error !== undefined),
      1,
      `${item.id}: supply exactly one expected result or error`,
    );
    if (item.error !== undefined) assert.ok(item.error.trim(), `${item.id}: error cannot be empty`);
  }
  return input;
}
