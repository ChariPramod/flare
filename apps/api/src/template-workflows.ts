import { withTenant } from '@flare/db';
import type { Tenant, Workflow } from '@flare/shared';
import { MailError } from '@flare/mail';
import { sql } from './context.js';
// Store expanded content in the Flare workflow so its engine version and publication are reproducible.
export async function expandWorkflowTemplates(
  tenant: Tenant,
  workflow: Workflow,
): Promise<Workflow> {
  return withTenant(sql, tenant, async (tx) => {
    const steps = [];
    for (const step of workflow.steps) {
      const controls = { ...step.controlValues };
      if (step.type === 'email' && typeof controls.templateId === 'string') {
        const id = controls.templateId;
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new MailError(422, 'Invalid template ID');
        const version = controls.templateVersion;
        if (version !== undefined && (!Number.isInteger(version) || Number(version) < 1))
          throw new MailError(422, 'Invalid template version');
        const [template] =
          await tx`select v.* from email_templates t join template_versions v on v.template_id=t.id and v.org_id=t.org_id and v.environment_id=t.environment_id and v.version=coalesce(${version === undefined ? null : Number(version)},t.current_version) where t.id=${id} and not t.archived`;
        if (!template) throw new MailError(422, 'Workflow email template not found');
        // Novu owns subscriber/payload interpolation at execution; do not render it now.
        controls.subject = template.subject;
        controls.body = template.html;
        delete controls.templateId;
        delete controls.templateVersion;
      }
      steps.push({ ...step, controlValues: controls });
    }
    return { ...workflow, steps };
  });
}
