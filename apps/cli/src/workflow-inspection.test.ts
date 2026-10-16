import { expect, it, vi } from 'vitest';
import { workflowInspectionCommand } from './workflow-inspection.js';
import { safeOutput } from './config.js';
it('routes dedicated workflow inspection commands only to read-only helpers with explicit bounds', async () => {
  const client = { inspectWorkflow: vi.fn(), reconcileWorkflows: vi.fn(), cancel: vi.fn() };
  const id = '00000000-0000-4000-8000-000000000001';
  await workflowInspectionCommand(client, ['workflow', 'inspect', id], {});
  expect(client.inspectWorkflow).toHaveBeenCalledExactlyOnceWith(id);
  await workflowInspectionCommand(client, ['workflow', 'reconcile'], {
    before: '2026-01-01T00:00:00Z',
    'max-runs': '3',
    concurrency: '1',
    'deadline-ms': '5000',
    cursor: 'opaque',
  });
  expect(client.reconcileWorkflows).toHaveBeenCalledExactlyOnceWith({
    before: '2026-01-01T00:00:00Z',
    maxRuns: 3,
    concurrency: 1,
    deadlineMs: 5000,
    cursor: 'opaque',
  });
  expect(client.cancel).not.toHaveBeenCalled();
  expect(
    safeOutput({ message: 'credential-value', apiKey: 'credential-value' }, ['credential-value']),
  ).not.toContain('credential-value');
});
it('requires an explicit before filter and valid run identity without calling any API', async () => {
  const client = { inspectWorkflow: vi.fn(), reconcileWorkflows: vi.fn() };
  for (const args of [
    ['workflow', 'inspect'],
    ['workflow', 'inspect', 'not-a-uuid'],
    ['workflow', 'reconcile'],
    ['workflow', 'reconcile', 'extra'],
  ])
    await expect(workflowInspectionCommand(client, args, {})).rejects.toThrow('Usage');
  expect(client.inspectWorkflow).not.toHaveBeenCalled();
  expect(client.reconcileWorkflows).not.toHaveBeenCalled();
});
