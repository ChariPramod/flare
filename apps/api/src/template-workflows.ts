import { withTenant } from '@flare/db';
import type { Tenant, Workflow } from '@flare/shared';
import { compileWorkflowContent, translationPayload } from '@flare/platform';
import { sql } from './context.js';
export async function expandWorkflowTemplates(tenant: Tenant, workflow: Workflow) {
  return withTenant(sql, tenant, async (tx) => {
    const compiled = await compileWorkflowContent(tx, tenant, workflow);
    await translationPayload(tx, workflow.workflowId, compiled.dependencies, 'en_US');
    return compiled;
  });
}
