import { it, expect, vi } from 'vitest';
import { reconcileWorkflows } from '../../packages/sdk/src/reconciliation.js';
import type {
  WorkflowRunMetadata,
  WorkflowInspection,
} from '../../packages/sdk/src/reconciliation.js';
const before = '2026-01-01T00:00:00Z';
const row = (id: string): WorkflowRunMetadata => ({
  id,
  workflow_id: 'workflow',
  transaction_id: id,
  parent_transaction_id: id,
  status: 'accepted',
  attempts: 1,
  cancellation_status: 'none',
  created_at: before,
  updated_at: before,
  queue_presence: 'unknown',
  replay_allowed: false,
});
const inspection = (id: string): WorkflowInspection => ({
  ...row(id),
  cancellation: {
    eligible: false,
    transaction_id: id,
    scope: 'trigger',
    reason: 'no_pending_action',
  },
  engine_observation: {
    status: 'available',
    checked_at: before,
    partial: false,
    notifications: [],
  },
  observation_age_ms: 0,
  partial: false,
});
it('bounds inventory and concurrency, follows stable cursors, and makes no mutation calls', async () => {
  let active = 0,
    peak = 0;
  const reader = {
    workflowInventory: vi.fn(async ({ cursor, limit }) => ({
      before,
      data: (cursor ? [row('c')] : [row('a'), row('b')]).slice(0, limit),
      next_cursor: cursor ? null : 'next',
    })),
    inspectWorkflow: vi.fn(async (id: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return inspection(id);
    }),
    mutate: vi.fn(),
  };
  const report = await reconcileWorkflows(reader, { before, maxRuns: 3, concurrency: 2 });
  expect(report).toMatchObject({
    complete: true,
    partial: false,
    inventory_complete: true,
    next_cursor: null,
  });
  expect(report.data.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  expect(peak).toBe(2);
  expect(reader.workflowInventory.mock.calls[1]?.[0]).toMatchObject({ cursor: 'next', limit: 1 });
  expect(reader.mutate).not.toHaveBeenCalled();
  expect(report.data[0]).toMatchObject({
    queue_presence: 'unknown',
    replay_allowed: false,
    observation_age_ms: expect.any(Number),
  });
});
it('reports max-run truncation and preserves a resumable inventory cursor', async () => {
  const reader = {
    workflowInventory: vi.fn(async () => ({ before, data: [row('a')], next_cursor: 'next' })),
    inspectWorkflow: vi.fn(async () => inspection('a')),
  };
  const report = await reconcileWorkflows(reader, { before, maxRuns: 1 });
  expect(report).toMatchObject({
    complete: false,
    partial: true,
    inventory_complete: false,
    next_cursor: 'next',
    stop_reason: 'limit',
  });
  expect(reader.workflowInventory).toHaveBeenCalledTimes(1);
});
it('contains outages, mismatched identities and partial observations without exposing exception content', async () => {
  const reader = {
    workflowInventory: vi.fn(async () => ({
      before,
      data: ['a', 'b', 'c'].map(row),
      next_cursor: null,
    })),
    inspectWorkflow: vi.fn(async (id: string) => {
      if (id === 'a') throw new Error('private credential and subscriber payload');
      if (id === 'b') return inspection('wrong');
      return { ...inspection(id), partial: true };
    }),
  };
  const report = await reconcileWorkflows(reader, { before });
  expect(report).toMatchObject({ complete: false, partial: true, inventory_complete: true });
  expect(report.data.slice(0, 2)).toEqual(
    expect.arrayContaining([expect.objectContaining({ inspection_error: 'unavailable' })]),
  );
  expect(JSON.stringify(report)).not.toMatch(/credential|subscriber|payload|wrong/);
});
it('enforces the total deadline when an inspection ignores abort and does not start new inspections', async () => {
  const controller = new AbortController();
  const reader = {
    workflowInventory: vi.fn(async () => ({
      before,
      data: ['a', 'b'].map(row),
      next_cursor: null,
    })),
    inspectWorkflow: vi.fn(async () => {
      controller.abort();
      return new Promise<WorkflowInspection>(() => {});
    }),
  };
  const report = await reconcileWorkflows(reader, {
    before,
    concurrency: 1,
    signal: controller.signal,
  });
  expect(report).toMatchObject({ complete: false, partial: true, stop_reason: 'deadline' });
  expect(
    report.data.every((item) => 'inspection_error' in item && item.inspection_error === 'deadline'),
  ).toBe(true);
  expect(reader.inspectWorkflow).toHaveBeenCalledTimes(1);
});
it.each([
  ['duplicate rows', [row('a'), row('a')], 'next'],
  ['empty nonfinal page', [], 'next'],
])('rejects invalid inventory progress: %s', async (_label, data, next_cursor) => {
  const reader = {
    workflowInventory: vi.fn(async () => ({
      before,
      data: data as WorkflowRunMetadata[],
      next_cursor: next_cursor as string,
    })),
    inspectWorkflow: vi.fn(async () => inspection('a')),
  };
  expect(await reconcileWorkflows(reader, { before })).toMatchObject({
    complete: false,
    partial: true,
    stop_reason: 'unavailable',
    data: [],
  });
  expect(reader.inspectWorkflow).not.toHaveBeenCalled();
});
it('validates caller bounds before any API request', async () => {
  const reader = { workflowInventory: vi.fn(), inspectWorkflow: vi.fn() };
  for (const options of [
    { before: 'yesterday' },
    { before, maxRuns: 101 },
    { before, concurrency: 5 },
    { before, deadlineMs: 999 },
  ])
    await expect(reconcileWorkflows(reader, options)).rejects.toThrow('Invalid reconciliation');
  expect(reader.workflowInventory).not.toHaveBeenCalled();
});
