import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { fingerprint, can, channels } from '@flare/shared';
import type { Tenant, Principal, Workflow } from '@flare/shared';
import { MailError } from '@flare/mail';
import { z } from 'zod';
import {
  contentInput,
  emptyDependencies,
  enginePayloadSchema,
  resolveDictionary,
} from './content.js';
import type { ContentDependencies } from './content.js';
type Layout = ContentDependencies['layouts'][number];
type Dictionary = {
  workflow_identifier: string;
  locale: string;
  version: number;
  entries: Record<string, string>;
};
type WorkflowContent = {
  identifier: string;
  definition: Workflow;
  source_definition: Workflow;
  content_dependencies: ContentDependencies;
  revision: number;
};
type Snapshot = { workflows: WorkflowContent[]; layouts: Layout[]; translations: Dictionary[] };
type WorkflowItem = WorkflowContent & { dictionaries: Dictionary[] };
const name = z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/);
export const publicationSchema = z
  .object({
    workflows: z.array(name).max(100).default([]),
    layouts: z.array(name).max(100).default([]),
    translations: z.array(name).max(100).default([]),
    diff_token: z.string().length(64).optional(),
  })
  .strict()
  .refine(
    (v) => v.workflows.length + v.layouts.length + v.translations.length > 0,
    'Select resources to publish',
  );
async function snapshot(sql: Sql, tenant: Tenant): Promise<Snapshot> {
  return withTenant(sql, tenant, async (tx) => ({
    workflows:
      (await tx`select identifier,definition,coalesce(source_definition,definition) as source_definition,content_dependencies,revision from workflows order by identifier`) as unknown as WorkflowContent[],
    layouts:
      (await tx`select l.identifier,l.name,v.version,v.html,v.translations from layouts l join layout_versions v on v.layout_id=l.id and v.org_id=l.org_id and v.environment_id=l.environment_id and v.version=l.current_version order by l.identifier`) as unknown as Layout[],
    translations:
      (await tx`select t.workflow_identifier,t.locale,v.version,v.entries from translations t join translation_versions v using(org_id,environment_id,workflow_identifier,locale) where v.version=t.current_version order by t.workflow_identifier,t.locale`) as unknown as Dictionary[],
  }));
}
export async function publicationDiff(sql: Sql, tenant: Tenant) {
  const envs = await withTenant(sql, tenant, (tx) => tx`select id,name from environments`);
  const dev = envs.find((v) => v.name === 'Development'),
    prod = envs.find((v) => v.name === 'Production');
  if (!dev || !prod) throw new MailError(422, 'Development and Production are required');
  const development = await snapshot(sql, { ...tenant, environmentId: String(dev.id) }),
    production = await snapshot(sql, { ...tenant, environmentId: String(prod.id) });
  const diff_token = fingerprint({ development, production });
  return {
    diff_token,
    development,
    production,
    sourceId: String(dev.id),
    targetId: String(prod.id),
    workflows: development.workflows.map((w) => ({
      identifier: w.identifier,
      development: w.definition,
      production:
        production.workflows.find((p) => p.identifier === w.identifier)?.definition ?? null,
      revision: w.revision,
      changed:
        fingerprint({ definition: w.definition, deps: w.content_dependencies }) !==
        fingerprint({
          definition: production.workflows.find((p) => p.identifier === w.identifier)?.definition,
          deps: production.workflows.find((p) => p.identifier === w.identifier)
            ?.content_dependencies,
        }),
      dependencies: w.content_dependencies,
    })),
    layouts: development.layouts.map((l) => ({
      identifier: l.identifier,
      development: l,
      production: production.layouts.find((p) => p.identifier === l.identifier) ?? null,
    })),
    translations: [...new Set(development.translations.map((v) => v.workflow_identifier))].map(
      (identifier) => ({
        identifier,
        development: development.translations.filter((v) => v.workflow_identifier === identifier),
        production: production.translations.filter((v) => v.workflow_identifier === identifier),
      }),
    ),
    excluded: ['subscribers', 'integrations', 'topics', 'contacts', 'credentials'],
  };
}
export async function createPublication(sql: Sql, principal: Principal, raw: unknown) {
  if (principal.production || !can(principal, 'publish'))
    throw new MailError(403, 'An authorized Development publication credential is required');
  const input = contentInput(publicationSchema, raw),
    diff = await publicationDiff(sql, principal);
  if (principal.environmentId !== diff.sourceId)
    throw new MailError(403, 'Publish from Development');
  if (input.diff_token && input.diff_token !== diff.diff_token)
    throw new MailError(409, 'Publication diff is stale; refresh and review it');
  const workflowIds = new Set(input.workflows);
  for (const id of input.translations)
    if (!diff.production.workflows.some((v) => v.identifier === id)) workflowIds.add(id);
  const items: {
    kind: 'layout' | 'workflow' | 'translation';
    identifier: string;
    snapshot: unknown;
  }[] = [];
  for (const id of new Set(input.layouts)) {
    const layout = diff.development.layouts.find((v) => v.identifier === id);
    if (!layout) throw new MailError(404, `Layout ${id} not found`);
    items.push({ kind: 'layout', identifier: id, snapshot: layout });
  }
  for (const id of workflowIds) {
    const row = diff.development.workflows.find((v) => v.identifier === id);
    if (!row) throw new MailError(404, `Workflow ${id} not found`);
    const dictionaries = diff.development.translations.filter((v) => v.workflow_identifier === id);
    resolveDictionary(
      row.content_dependencies,
      dictionaries.find((v) => v.locale === 'en_US')?.entries ?? {},
      {},
    );
    const source = structuredClone(row.source_definition);
    // Resolve old UUID references while still in Development; only stable identifiers cross environments.
    await withTenant(sql, principal, async (tx) => {
      for (const step of source.steps)
        if (typeof step.controlValues.templateId === 'string') {
          const [template] =
            await tx`select identifier from email_templates where id=${step.controlValues.templateId}`;
          if (!template) throw new MailError(422, 'Referenced template no longer exists');
          step.controlValues.templateIdentifier = String(template.identifier);
          delete step.controlValues.templateId;
        }
    });
    items.push({
      kind: 'workflow',
      identifier: id,
      snapshot: { ...row, source_definition: source, dictionaries },
    });
  }
  for (const id of new Set(input.translations)) {
    const dictionaries = diff.development.translations.filter((v) => v.workflow_identifier === id);
    if (!dictionaries.length) throw new MailError(404, `Translations for ${id} not found`);
    const target = diff.production.workflows.find((v) => v.identifier === id);
    if (target && !workflowIds.has(id))
      resolveDictionary(
        target.content_dependencies,
        dictionaries.find((v) => v.locale === 'en_US')?.entries ?? {},
        {},
      );
    items.push({ kind: 'translation', identifier: id, snapshot: dictionaries });
  }
  return withTenant(sql, principal, async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${principal.orgId}/publication`},0))`;
    const [active] =
      await tx`select id,status from publication_operations where target_environment_id=${diff.targetId} and status in ('pending','failed') for update`;
    if (active?.status === 'pending')
      throw new MailError(409, `Finish or retry publication ${active.id} before publishing again`);
    if (active?.status === 'failed') {
      const unfinished =
        await tx`select kind,identifier from publication_items where operation_id=${active.id} and status<>'completed'`;
      if (
        unfinished.some(
          (row) =>
            !items.some((item) => item.kind === row.kind && item.identifier === row.identifier),
        )
      )
        throw new MailError(
          409,
          'A replacement must include every unfinished resource from the failed publication',
        );
      await tx`update publication_operations set status='superseded' where id=${active.id}`;
    }
    const [operation] =
      await tx`insert into publication_operations(org_id,environment_id,target_environment_id,actor_id,snapshot_hash) values(${principal.orgId},${principal.environmentId},${diff.targetId},${principal.actorId},${diff.diff_token}) returning id,status`;
    for (const [ordinal, item] of items.entries())
      await tx`insert into publication_items(org_id,environment_id,operation_id,ordinal,kind,identifier,snapshot) values(${principal.orgId},${principal.environmentId},${operation!.id},${ordinal},${item.kind},${item.identifier},${tx.json(toJson(item.snapshot))})`;
    await tx`insert into audit_logs(org_id,environment_id,actor_id,action,resource_id) values(${principal.orgId},${principal.environmentId},${principal.actorId},'publication.accepted',${operation!.id})`;
    return {
      id: String(operation!.id),
      status: 'pending',
      items: items.map(({ kind, identifier }) => ({ kind, identifier })),
    };
  });
}
async function putLayout(tx: Transaction, tenant: Tenant, layout: Layout) {
  const [row] =
    await tx`insert into layouts(org_id,environment_id,identifier,name,current_version) values(${tenant.orgId},${tenant.environmentId},${layout.identifier},${layout.name},${layout.version}) on conflict(org_id,environment_id,identifier) do update set name=excluded.name,current_version=greatest(layouts.current_version,excluded.current_version),updated_at=now() returning id`;
  const [existing] =
    await tx`select html,translations from layout_versions where layout_id=${row!.id} and version=${layout.version}`;
  if (existing && (existing.html !== layout.html || existing.translations !== layout.translations))
    throw new MailError(409, `Layout version conflict: ${layout.identifier} v${layout.version}`);
  if (!existing)
    await tx`insert into layout_versions(org_id,environment_id,layout_id,version,html,translations) values(${tenant.orgId},${tenant.environmentId},${row!.id},${layout.version},${layout.html},${layout.translations})`;
}
async function putDictionaries(tx: Transaction, tenant: Tenant, dictionaries: Dictionary[]) {
  for (const d of dictionaries) {
    const [existing] =
      await tx`select entries from translation_versions where workflow_identifier=${d.workflow_identifier} and locale=${d.locale} and version=${d.version}`;
    if (existing && fingerprint(existing.entries) !== fingerprint(d.entries))
      throw new MailError(
        409,
        `Translation version conflict: ${d.workflow_identifier}/${d.locale}`,
      );
    await tx`insert into translations(org_id,environment_id,workflow_identifier,locale,current_version) values(${tenant.orgId},${tenant.environmentId},${d.workflow_identifier},${d.locale},${d.version}) on conflict(org_id,environment_id,workflow_identifier,locale) do update set current_version=excluded.current_version,updated_at=now()`;
    if (!existing)
      await tx`insert into translation_versions(org_id,environment_id,workflow_identifier,locale,version,entries) values(${tenant.orgId},${tenant.environmentId},${d.workflow_identifier},${d.locale},${d.version},${tx.json(d.entries)})`;
  }
}
export type PublishEngine = (
  target: Tenant,
  workflow: Workflow,
  deps: ContentDependencies,
) => Promise<void>;
export async function advancePublication(sql: Sql, id: string, publish: PublishEngine) {
  const [lookup] =
    await sql`select * from publication_operations where id=${id} and status='pending'`;
  if (!lookup) return;
  const tenant = { orgId: String(lookup.org_id), environmentId: String(lookup.environment_id) },
    target = { ...tenant, environmentId: String(lookup.target_environment_id) };
  // Serialize preparation with completion, so a second worker cannot re-block a completed workflow.
  const item = await withTenant(sql, tenant, async (tx) => {
    const [operation] =
      await tx`select id from publication_operations where id=${id} and status='pending' for update skip locked`;
    if (!operation) return;
    const [row] =
      await tx`select * from publication_items where operation_id=${id} and status<>'completed' order by ordinal limit 1 for update`;
    if (!row || new Date(String(row.next_attempt_at)) > new Date()) return;
    if (row.kind === 'workflow') {
      await tx`select set_config('flare.environment_id',${target.environmentId},true)`;
      await tx`update workflows set publication_blocked=true where identifier=${row.identifier}`;
    }
    return row;
  });
  if (!item) return;

  try {
    await withTenant(sql, tenant, async (tx) => {
      const [operation] =
        await tx`select * from publication_operations where id=${id} and status='pending' for update skip locked`;
      if (!operation) return;
      const [current] =
        await tx`select * from publication_items where operation_id=${id} and status<>'completed' order by ordinal limit 1 for update`;
      if (
        !current ||
        current.id !== item.id ||
        new Date(String(current.next_attempt_at)) > new Date()
      )
        return;
      await tx`select set_config('flare.environment_id',${target.environmentId},true)`;
      if (current.kind === 'layout') await putLayout(tx, target, current.snapshot as Layout);
      else if (current.kind === 'translation')
        await putDictionaries(tx, target, current.snapshot as Dictionary[]);
      else {
        const snapshot = current.snapshot as WorkflowItem,
          deps = snapshot.content_dependencies ?? emptyDependencies();
        for (const layout of deps.layouts) await putLayout(tx, target, layout);
        const source = structuredClone(snapshot.source_definition);
        for (const template of deps.templates) {
          const [row] =
            await tx`insert into email_templates(org_id,environment_id,name,identifier,current_version) values(${target.orgId},${target.environmentId},${template.name},${template.identifier},${template.version}) on conflict(org_id,environment_id,identifier) do update set current_version=greatest(email_templates.current_version,excluded.current_version) returning id`;
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
            await tx`insert into template_versions(org_id,environment_id,template_id,version,subject,html,text_body,variables) values(${target.orgId},${target.environmentId},${row!.id},${template.version},${template.subject},${template.html},${template.text},${tx.json(toJson(template.variables ?? {}))})`;
          for (const step of source.steps)
            if (step.controlValues.templateIdentifier === template.identifier) {
              step.controlValues.templateId = String(row!.id);
              delete step.controlValues.templateIdentifier;
            }
        }
        await tx`insert into workflows(org_id,environment_id,identifier,definition,source_definition,content_dependencies,publication_blocked) values(${target.orgId},${target.environmentId},${snapshot.identifier},${tx.json(toJson(snapshot.definition))},${tx.json(toJson(source))},${tx.json(toJson(deps))},true) on conflict(org_id,environment_id,identifier) do update set definition=excluded.definition,source_definition=excluded.source_definition,content_dependencies=excluded.content_dependencies,revision=workflows.revision+1,publication_blocked=true,updated_at=now()`;
        await putDictionaries(tx, target, snapshot.dictionaries);
        await publish(target, snapshot.definition, deps);
        await tx`update workflows set publication_blocked=false where identifier=${snapshot.identifier}`;
      }
      await tx`insert into audit_logs(org_id,environment_id,actor_id,action,resource_id) values(${target.orgId},${target.environmentId},${operation.actor_id},'publication.item_completed',${current.identifier})`;
      await tx`select set_config('flare.environment_id',${tenant.environmentId},true)`;
      await tx`update publication_items set status='completed',attempts=attempts+1,error=null,completed_at=now() where id=${current.id}`;
      await tx`update publication_operations set status='completed',completed_at=now(),error=null where id=${id} and not exists(select 1 from publication_items where operation_id=${id} and status<>'completed')`;
    });
  } catch (error) {
    await withTenant(sql, tenant, async (tx) => {
      await tx`select id from publication_operations where id=${id} for update`;
      const [current] =
        await tx`select * from publication_items where id=${item.id} and status='pending' for update`;
      if (!current) return;
      const failed =
        (error instanceof MailError && error.status < 500) || Number(current.failures) >= 4;
      const message =
        error instanceof MailError ? error.message : 'Publication engine or database update failed';
      await tx`update publication_items set status=${failed ? 'failed' : 'pending'},attempts=attempts+1,failures=failures+1,error=${message},next_attempt_at=now()+${5 * 2 ** Number(current.failures)}*interval '1 second' where id=${item.id}`;
      await tx`update publication_operations set status=${failed ? 'failed' : 'pending'},error=${message} where id=${id} and status='pending'`;
    });
    throw error;
  }
}
export function publicationEngineBody(workflow: Workflow, deps: ContentDependencies) {
  return {
    workflowId: workflow.workflowId,
    name: workflow.name,
    description: workflow.description,
    tags: workflow.tags,
    severity: workflow.severity,
    active: workflow.active,
    steps: workflow.steps,
    payloadSchema: enginePayloadSchema(workflow.payloadSchema, deps),
    validatePayload: true,
    preferences: {
      workflow: {
        channels: Object.fromEntries(
          channels.map((c) => [
            c,
            { enabled: workflow.preferences[c] ?? workflow.defaults[c] ?? true },
          ]),
        ),
      },
      user: { all: { enabled: true, readOnly: workflow.critical } },
    },
  };
}
function contains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => contains(actual[i], v))
    );
  if (expected !== null && typeof expected === 'object')
    return (
      actual !== null &&
      typeof actual === 'object' &&
      Object.entries(expected).every(([k, v]) =>
        contains((actual as Record<string, unknown>)[k], v),
      )
    );
  return actual === expected;
}
export async function syncPublicationWorkflow(
  url: string,
  key: string,
  workflow: Workflow,
  deps: ContentDependencies,
) {
  const path = `${url}/v2/workflows/${encodeURIComponent(workflow.workflowId)}`;
  const request = async (target: string, method: string, body?: unknown) => {
    const response = await fetch(target, {
      method,
      headers: { Authorization: `ApiKey ${key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok)
      throw new MailError(
        response.status >= 500 || response.status === 429 ? 503 : 422,
        `Novu publication request failed (${response.status})`,
      );
    if (response.status === 204) return {};
    const result = (await response.json()) as { data?: unknown };
    return result.data ?? result;
  };
  const expected = publicationEngineBody(workflow, deps),
    before = await request(path, 'GET');
  if (!contains(before, expected)) {
    if (before) {
      const { workflowId: _id, ...update } = expected;
      await request(path, 'PUT', update);
    } else await request(`${url}/v2/workflows`, 'POST', expected);
  }
  if (!contains(await request(path, 'GET'), expected))
    throw new MailError(503, 'Novu workflow does not yet match the publication snapshot');
}
