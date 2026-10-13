import { createHmac, randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Ajv } from 'ajv';
import { CreateWorkflowDto$outboundSchema } from '@novu/api/models/components/createworkflowdto.js';
import { withTenant, toJson } from '@flare/db';
import {
  canEditWorkflow,
  channels,
  conditionMatches,
  contextMatches,
  contextSchema,
  preferencesSchema,
  resolvePreferences,
  subscriberSchema,
  workflowSchema,
} from '@flare/shared';
import type { Preferences, Workflow } from '@flare/shared';
import { z } from 'zod';
import { Access } from './auth.js';
import { parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { expandWorkflowTemplates } from './template-workflows.js';
import { outbox } from '@flare/mail';
import { audit } from './identity.js';
import { idempotent } from './idempotency.js';
import { novu, novuKey } from './novu.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const safeId = (value: string) => parse(z.string().min(1).max(128), value);
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().max(100).default(''),
});
function ensureDevelopment(req: AuthRequest) {
  if (!canEditWorkflow(req.principal))
    throw new ForbiddenException('Production workflows are read-only. Publish from Development.');
}
function engineDefinition(workflow: Workflow) {
  try {
    ajv.compile(workflow.payloadSchema);
  } catch {
    throw new BadRequestException('Invalid payload JSON Schema');
  }
  return parse(CreateWorkflowDto$outboundSchema, {
    name: workflow.name,
    workflowId: workflow.workflowId,
    description: workflow.description,
    tags: workflow.tags,
    severity: workflow.severity,
    active: workflow.active,
    steps: workflow.steps,
    payloadSchema: workflow.payloadSchema,
    validatePayload: true,
    preferences: {
      workflow: {
        channels: Object.fromEntries(
          channels.map((channel) => [
            channel,
            { enabled: workflow.preferences[channel] ?? workflow.defaults[channel] ?? true },
          ]),
        ),
      },
      user: { all: { enabled: true, readOnly: workflow.critical } },
    },
  });
}
const recipient = z.union([
  z.string().min(1).max(128),
  subscriberSchema,
  z.object({ type: z.literal('Topic'), topicKey: z.string().min(1).max(128) }).strict(),
]);
const triggerSchema = z
  .object({
    name: z.string().min(1).max(100),
    to: z.union([recipient, z.array(recipient).min(1).max(100)]).optional(),
    broadcast: z.boolean().default(false),
    payload: z.record(z.unknown()).default({}),
    overrides: z.record(z.unknown()).optional(),
    actor: z.string().min(1).max(128).optional(),
    transactionId: z.string().min(1).max(128).optional(),
    context: contextSchema.default({}),
  })
  .strict()
  .refine(
    (input) => Boolean(input.to) !== input.broadcast,
    'Provide recipients or broadcast, exclusively',
  );

@Controller('v1')
export class WorkflowController {
  @Get('workflows') async list(@Req() req: AuthRequest, @Query() query: unknown) {
    const { page, limit, q } = parse(listQuery, query);
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select * from workflows where definition->>'name' ilike ${`%${q}%`} order by updated_at desc limit ${limit} offset ${(page - 1) * limit}`,
      page,
      limit,
    }));
  }
  @Get('workflows/:id') async get(@Req() req: AuthRequest, @Param('id') id: string) {
    const [row] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from workflows where identifier = ${safeId(id)}`,
    );
    if (!row) throw new NotFoundException();
    return row;
  }
  @Post('workflows') async create(@Req() req: AuthRequest, @Body() body: unknown) {
    ensureDevelopment(req);
    const workflow = await expandWorkflowTemplates(req.principal, parse(workflowSchema, body));
    await novu(
      req.principal,
      '/v2/workflows',
      'POST',
      engineDefinition(workflow),
      `workflow-create-${workflow.workflowId}`,
    );
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`insert into workflows (org_id,environment_id,identifier,definition) values (${req.principal.orgId},${req.principal.environmentId},${workflow.workflowId},${tx.json(toJson(workflow))}) returning *`;
      await audit(tx, req.principal, 'workflow.created', workflow.workflowId);
      return row;
    });
  }
  @Put('workflows/:id') async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    ensureDevelopment(req);
    const workflow = await expandWorkflowTemplates(req.principal, parse(workflowSchema, body));
    if (workflow.workflowId !== id)
      throw new BadRequestException('Workflow identifier is immutable');
    await this.get(req, id);
    const { workflowId: _workflowId, ...definition } = engineDefinition(workflow);
    await novu(req.principal, `/v2/workflows/${encodeURIComponent(id)}`, 'PUT', definition);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update workflows set definition = ${tx.json(toJson(workflow))}, revision = revision+1, updated_at = now() where identifier = ${id} returning *`;
      await audit(tx, req.principal, 'workflow.updated', id);
      return row;
    });
  }
  @Delete('workflows/:id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    ensureDevelopment(req);
    await this.get(req, id);
    await novu(req.principal, `/v2/workflows/${encodeURIComponent(id)}`, 'DELETE');
    return withTenant(sql, req.principal, async (tx) => {
      await tx`delete from workflows where identifier = ${id}`;
      await audit(tx, req.principal, 'workflow.deleted', id);
      return { id, deleted: true };
    });
  }
  @Access('send') @Post('events/trigger') async trigger(
    @Req() req: Pick<AuthRequest, 'principal' | 'headers'>,
    @Body() body: unknown,
  ) {
    if (req.principal.permission === 'sending_access')
      throw new ForbiddenException('Workflow triggers require full_access');
    const input = parse(triggerSchema, body);
    // Resolve credentials before accepting durable work, without returning them to the caller.
    await novuKey(req.principal);
    return idempotent(
      req.principal,
      'trigger',
      req.headers['idempotency-key'],
      input,
      async (tx) => {
        const [row] = await tx`select definition from workflows where identifier = ${input.name}`;
        if (!row) throw new NotFoundException('Workflow not found');
        const workflow = row.definition as Workflow;
        if (!workflow.active) throw new BadRequestException('Workflow is inactive');
        const validator = ajv.compile(workflow.payloadSchema);
        if (!validator(input.payload))
          throw new BadRequestException({
            message: 'Payload does not match workflow schema',
            errors: validator.errors,
          });
        const targets: Array<Record<string, unknown>> = [];
        if (input.broadcast) {
          const all = await tx`select profile from subscribers`;
          for (const subscriber of all) targets.push(subscriber.profile as Record<string, unknown>);
        }
        for (const target of input.to ? (Array.isArray(input.to) ? input.to : [input.to]) : []) {
          if (typeof target === 'object' && 'topicKey' in target) {
            const subscriptions =
              await tx`select s.profile, sub.context, sub.condition from topic_subscriptions sub join topics t on t.id=sub.topic_id and t.org_id=sub.org_id and t.environment_id=sub.environment_id join subscribers s on s.subscriber_id=sub.subscriber_id and s.org_id=sub.org_id and s.environment_id=sub.environment_id where t.key=${target.topicKey}`;
            for (const subscription of subscriptions)
              if (
                contextMatches(subscription.context as Record<string, string>, input.context) &&
                conditionMatches(subscription.condition, {
                  payload: input.payload,
                  subscriber: subscription.profile,
                  context: input.context,
                })
              )
                targets.push(subscription.profile as Record<string, unknown>);
          } else {
            const id = typeof target === 'string' ? target : target.subscriberId;
            const [existing] = await tx`select profile from subscribers where subscriber_id=${id}`;
            const profile =
              typeof target === 'string'
                ? ((existing?.profile as Record<string, unknown>) ?? { subscriberId: id })
                : target;
            await tx`insert into subscribers (org_id,environment_id,subscriber_id,profile) values (${req.principal.orgId},${req.principal.environmentId},${id},${tx.json(toJson(profile))}) on conflict (org_id,environment_id,subscriber_id) do update set profile=excluded.profile,updated_at=now()`;
            targets.push(profile);
          }
        }
        const filtered = targets.filter((target) => target.subscriberId !== input.actor);
        if (filtered.length > 10000)
          throw new BadRequestException('Fan-out exceeds 10,000 recipients; split the trigger');
        const transactionId = input.transactionId ?? randomUUID();
        const ids: string[] = [];
        for (let offset = 0; offset < filtered.length; offset += 100) {
          const chunkTransaction =
            offset === 0 ? transactionId : `${transactionId}-${offset / 100}`;
          const payload = {
            name: input.name,
            to: filtered.slice(offset, offset + 100),
            payload: input.payload,
            overrides: input.overrides,
            actor: input.actor,
            context: input.context,
            transactionId: chunkTransaction,
          };
          const [run] =
            await tx`insert into workflow_runs (org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload) values (${req.principal.orgId},${req.principal.environmentId},${input.name},${chunkTransaction},${transactionId},${tx.json(JSON.parse(JSON.stringify(payload)))}) returning id`;
          ids.push(String(run!.id));
          await outbox(tx, req.principal, 'workflow.queued', {
            id: run!.id,
            workflowId: input.name,
            transactionId: chunkTransaction,
          });
        }
        return { ids, transactionId, status: 'queued', recipients: filtered.length };
      },
    );
  }
  @Access('send') @Post('events/trigger/bulk') async bulk(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const events = parse(z.array(triggerSchema).min(1).max(100), body);
    const results = [];
    const key = req.headers['idempotency-key'];
    if (key && (typeof key !== 'string' || key.length > 240))
      throw new BadRequestException('Bulk idempotency key must be at most 240 characters');
    for (const [index, event] of events.entries()) {
      const subrequest = {
        principal: req.principal,
        headers: { ...req.headers, 'idempotency-key': key ? `${key}:${index}` : undefined },
      };
      results.push(await this.trigger(subrequest, event));
    }
    return { data: results };
  }
  @Delete('events/trigger/:transactionId') async cancel(
    @Req() req: AuthRequest,
    @Param('transactionId') id: string,
  ) {
    const runs = await withTenant(sql, req.principal, async (tx) => {
      const rows =
        await tx`update workflow_runs set status='canceled',updated_at=now() where parent_transaction_id=${safeId(id)} and status in ('queued','accepted') returning id,workflow_id,transaction_id`;
      for (const row of rows)
        await outbox(tx, req.principal, 'workflow.canceled', {
          id: row.id,
          workflowId: row.workflow_id,
          transactionId: row.transaction_id,
        });
      return rows;
    });
    for (const run of runs)
      await novu(
        req.principal,
        `/v1/events/trigger/${encodeURIComponent(String(run.transaction_id))}`,
        'DELETE',
      );
    return { transactionId: id, canceled: runs.length };
  }
  @Get('activity') async activity(@Req() req: AuthRequest, @Query() query: unknown) {
    const input = parse(
      listQuery.extend({
        workflow: z.string().optional(),
        status: z.enum(['queued', 'accepted', 'failed', 'canceled']).optional(),
        transactionId: z.string().optional(),
      }),
      query,
    );
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select id,workflow_id,transaction_id,status,attempts,error,created_at,updated_at from workflow_runs where (${input.workflow ?? null}::text is null or workflow_id=${input.workflow ?? null}) and (${input.status ?? null}::text is null or status=${input.status ?? null}) and (${input.transactionId ?? null}::text is null or parent_transaction_id=${input.transactionId ?? null}) order by created_at desc limit ${input.limit} offset ${(input.page - 1) * input.limit}`,
      page: input.page,
      limit: input.limit,
    }));
  }
  @Get('activity/:id') async activityDetail(@Req() req: AuthRequest, @Param('id') id: string) {
    const [run] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from workflow_runs where id=${parse(z.string().uuid(), id)}`,
    );
    if (!run) throw new NotFoundException();
    return {
      ...run,
      engine:
        run.status === 'accepted'
          ? await novu(
              req.principal,
              `/v1/notifications?transactionId=${encodeURIComponent(String(run.transaction_id))}`,
            )
          : null,
    };
  }
  @Get('subscribers') async subscribers(@Req() req: AuthRequest, @Query() query: unknown) {
    const { page, limit, q } = parse(listQuery, query);
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select * from subscribers where subscriber_id ilike ${`%${q}%`} or profile->>'email' ilike ${`%${q}%`} order by created_at desc limit ${limit} offset ${(page - 1) * limit}`,
      page,
      limit,
    }));
  }
  @Post('subscribers') async subscriber(@Req() req: AuthRequest, @Body() body: unknown) {
    const profile = parse(subscriberSchema, body);
    await novu(req.principal, '/v2/subscribers', 'POST', profile);
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`insert into subscribers(org_id,environment_id,subscriber_id,profile) values(${req.principal.orgId},${req.principal.environmentId},${profile.subscriberId},${tx.json(toJson(profile))}) on conflict(org_id,environment_id,subscriber_id) do update set profile=excluded.profile,updated_at=now() returning *`;
      return row;
    });
  }
  @Get('subscribers/:id') async getSubscriber(@Req() req: AuthRequest, @Param('id') id: string) {
    const [row] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from subscribers where subscriber_id=${safeId(id)}`,
    );
    if (!row) throw new NotFoundException();
    return row;
  }
  @Get('subscribers/:id/preferences') async preferences(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    const subscriber = await this.getSubscriber(req, id);
    const layers = subscriber.preferences as Record<string, Preferences>;
    const workflows = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select definition from workflows`,
    );
    return {
      global: layers.global ?? {},
      workflows: workflows
        .map((row) => row.definition as Workflow)
        .filter((w) => !w.critical)
        .map((w) => ({
          workflowId: w.workflowId,
          name: w.name,
          resolved: resolvePreferences({
            defaults: w.defaults,
            workflow: w.preferences,
            global: layers.global,
            subscriberWorkflow: layers[w.workflowId],
          }),
        })),
    };
  }
  @Put('subscribers/:id/preferences') async setPreferences(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({ workflowId: z.string().optional(), channels: preferencesSchema }).strict(),
      body,
    );
    const subscriber = await this.getSubscriber(req, id);
    if (input.workflowId) {
      const row = await this.get(req, input.workflowId);
      if ((row.definition as Workflow).critical)
        throw new BadRequestException('Critical workflows ignore subscriber preferences');
    }
    await novu(req.principal, `/v2/subscribers/${encodeURIComponent(id)}/preferences`, 'PATCH', {
      workflowId: input.workflowId,
      channels: Object.fromEntries(
        Object.entries(input.channels).map(([key, enabled]) => [key, { enabled }]),
      ),
    });
    const preferences = {
      ...(subscriber.preferences as Record<string, Preferences>),
      [input.workflowId ?? 'global']: input.channels,
    };
    await withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`update subscribers set preferences=${tx.json(preferences)} where subscriber_id=${id}`,
    );
    return preferences;
  }
  @Get('subscribers/:id/inbox-token') async inbox(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    await this.getSubscriber(req, id);
    const key = await novuKey(req.principal);
    const [environment] = await withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select novu_application_id from environments where id=${req.principal.environmentId}`,
    );
    return {
      subscriberId: id,
      subscriberHash: createHmac('sha256', key).update(id).digest('hex'),
      applicationIdentifier: environment?.novu_application_id,
      backendUrl:
        process.env.NOVU_PUBLIC_API_URL ||
        `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/novu`,
      socketUrl: process.env.NOVU_PUBLIC_WS_URL ?? 'http://localhost:3002',
    };
  }
  @Get('topics') async topics(@Req() req: AuthRequest) {
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select t.*,count(s.id)::int as subscribers from topics t left join topic_subscriptions s on s.topic_id=t.id and s.org_id=t.org_id and s.environment_id=t.environment_id group by t.id order by t.created_at desc`,
    }));
  }
  @Post('topics') async topic(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          key: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
          name: z.string().min(1).max(120),
        })
        .strict(),
      body,
    );
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`insert into topics(org_id,environment_id,key,name) values(${req.principal.orgId},${req.principal.environmentId},${input.key},${input.name}) returning *`;
      return row;
    });
  }
  @Post('topics/:key/subscriptions') async subscribe(
    @Req() req: AuthRequest,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          subscribers: z.array(z.string().min(1).max(128)).min(1).max(1000),
          context: contextSchema.default({}),
          condition: z.unknown().optional(),
        })
        .strict(),
      body,
    );
    return withTenant(sql, req.principal, async (tx) => {
      const [topic] = await tx`select id from topics where key=${safeId(key)}`;
      if (!topic) throw new NotFoundException();
      for (const id of input.subscribers)
        await tx`insert into topic_subscriptions(org_id,environment_id,topic_id,subscriber_id,context,condition) values(${req.principal.orgId},${req.principal.environmentId},${topic.id},${id},${tx.json(input.context)},${input.condition === undefined ? null : tx.json(JSON.parse(JSON.stringify(input.condition)))}) on conflict(org_id,environment_id,topic_id,subscriber_id,context) do update set condition=excluded.condition`;
      return { added: input.subscribers.length };
    });
  }
  @Delete('topics/:key/subscriptions') async unsubscribe(
    @Req() req: AuthRequest,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          subscribers: z.array(z.string()).min(1).max(1000),
          context: contextSchema.default({}),
        })
        .strict(),
      body,
    );
    return withTenant(sql, req.principal, async (tx) => {
      const rows =
        await tx`delete from topic_subscriptions where topic_id in(select id from topics where key=${safeId(key)}) and subscriber_id in ${tx(input.subscribers)} and context=${tx.json(input.context)} returning id`;
      return { removed: rows.length };
    });
  }
}
