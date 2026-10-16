import type { FlareClient } from '@pareto-labs/flare-sdk';
/** Dedicated inspection commands have no mutation fallback. */
export async function workflowInspectionCommand(
  client: Pick<FlareClient, 'inspectWorkflow' | 'reconcileWorkflows'>,
  args: string[],
  values: Record<string, string | boolean | undefined>,
) {
  if (args[1] === 'inspect') {
    const id = args[2];
    if (args.length !== 3 || !id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))
      throw new Error('Usage: workflow inspect RUN_UUID');
    return client.inspectWorkflow(id);
  }
  if (args[1] !== 'reconcile' || args.length !== 2 || typeof values.before !== 'string')
    throw new Error('Usage: workflow reconcile --before ISO_TIMESTAMP');
  const number = (name: string) => (values[name] === undefined ? undefined : Number(values[name]));
  return client.reconcileWorkflows({
    before: values.before,
    ...(typeof values.cursor === 'string' ? { cursor: values.cursor } : {}),
    maxRuns: number('max-runs'),
    concurrency: number('concurrency'),
    deadlineMs: number('deadline-ms'),
  });
}
