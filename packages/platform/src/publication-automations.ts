import { toJson } from '@flare/db';
import type { Transaction } from '@flare/db';
import { automationSchema, fingerprint } from '@flare/shared';
import type { Automation, Tenant } from '@flare/shared';
import { MailError } from '@flare/mail';
import type { ContentDependencies } from './content.js';
import { validateAutomation } from './automations.js';
type Template = ContentDependencies['templates'][number];
export type AutomationContent = {
  identifier: string;
  name: string;
  revision: number;
  enabled: boolean;
  // Within publication snapshots template_id contains a stable identifier, never a database UUID.
  definition: Automation;
  templates: Template[];
};
export async function automationSnapshot(tx: Transaction): Promise<AutomationContent[]> {
  const rows =
    await tx`select identifier,name,definition,revision,enabled from automations order by identifier`;
  const result: AutomationContent[] = [];
  for (const row of rows) {
    const definition = structuredClone(row.definition) as Automation;
    const templates: Template[] = [];
    for (const step of definition.steps) {
      if (step.type !== 'send_email') continue;
      const [template] =
        await tx`select t.identifier,t.name,v.version,v.subject,v.html,v.text_body as text,v.variables from email_templates t join template_versions v on v.template_id=t.id and v.org_id=t.org_id and v.environment_id=t.environment_id where t.id=${step.template_id} and v.version=${step.template_version}`;
      if (!template)
        throw new MailError(422, `Automation ${row.identifier} has a missing template version`);
      step.template_id = String(template.identifier);
      if (
        !templates.some(
          (v) => v.identifier === template.identifier && v.version === template.version,
        )
      )
        templates.push(template as Template);
    }
    result.push({
      identifier: String(row.identifier),
      name: String(row.name),
      revision: Number(row.revision),
      enabled: Boolean(row.enabled),
      definition,
      templates,
    });
  }
  return result;
}
export async function putPublicationTemplate(tx: Transaction, tenant: Tenant, template: Template) {
  const [row] =
    await tx`insert into email_templates(org_id,environment_id,name,identifier,current_version) values(${tenant.orgId},${tenant.environmentId},${template.name},${template.identifier},${template.version}) on conflict(org_id,environment_id,identifier) do update set current_version=greatest(email_templates.current_version,excluded.current_version) returning id`;
  const [existing] =
    await tx`select subject,html,text_body as text,variables from template_versions where template_id=${row!.id} and version=${template.version}`;
  if (
    existing &&
    fingerprint(existing) !==
      fingerprint({
        subject: template.subject,
        html: template.html,
        text: template.text,
        variables: template.variables ?? {},
      })
  )
    throw new MailError(409, `Template version conflict: ${template.identifier}`);
  if (!existing)
    await tx`insert into template_versions(org_id,environment_id,template_id,version,subject,html,text_body,variables) values(${tenant.orgId},${tenant.environmentId},${row!.id},${template.version},${template.subject},${template.html},${template.text},${tx.json(toJson(template.variables ?? {}))})`;
  return String(row!.id);
}
export async function putAutomation(tx: Transaction, target: Tenant, snapshot: AutomationContent) {
  const definition = structuredClone(snapshot.definition);
  for (const template of snapshot.templates) {
    const id = await putPublicationTemplate(tx, target, template);
    for (const step of definition.steps)
      if (
        step.type === 'send_email' &&
        step.template_id === template.identifier &&
        step.template_version === template.version
      )
        step.template_id = id;
  }
  const validated = automationSchema.parse(definition);
  await validateAutomation(
    tx,
    { ...target, actorId: target.orgId, kind: 'session', role: 'owner', production: true },
    validated,
  );
  // Definition and activation change atomically. Existing runs keep their own pinned snapshots.
  await tx`insert into automations(org_id,environment_id,identifier,name,definition,revision,enabled) values(${target.orgId},${target.environmentId},${snapshot.identifier},${snapshot.name},${tx.json(toJson(validated))},${snapshot.revision},${snapshot.enabled}) on conflict(org_id,environment_id,identifier) do update set name=excluded.name,definition=excluded.definition,revision=excluded.revision,enabled=excluded.enabled,updated_at=now()`;
}
