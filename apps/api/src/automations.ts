import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Req,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import { automationSchema, automationEventSchema } from '@flare/shared';
import { MailError } from '@flare/mail';
import { validateAutomation, createAutomationEvent, cancelAutomation } from '@flare/platform';
import { parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
const uuid = z.string().uuid();
const inputSchema = z
  .object({
    identifier: z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/),
    name: z.string().min(1).max(120),
    enabled: z.boolean().default(false),
    definition: automationSchema,
  })
  .strict();
function development(req: AuthRequest) {
  if (req.principal.production)
    throw new ForbiddenException('Edit automations in Development and publish to Production');
}
@Controller('v1')
export class AutomationController {
  @Get('automations') async list(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from automations order by updated_at desc limit 100`,
    );
  }
  @Get('automations/:id') async detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [row] = await tx`select * from automations where id=${parse(uuid, id)}`;
      if (!row) throw new MailError(404, 'Automation not found');
      return row;
    });
  }
  @Post('automations') async create(@Req() req: AuthRequest, @Body() body: unknown) {
    development(req);
    const input = parse(inputSchema, body);
    return withTenant(sql, req.principal, async (tx) => {
      await validateAutomation(tx, req.principal, input.definition);
      const [row] =
        await tx`insert into automations(org_id,environment_id,identifier,name,definition,enabled) values(${req.principal.orgId},${req.principal.environmentId},${input.identifier},${input.name},${tx.json(toJson(input.definition))},${input.enabled}) returning *`;
      await audit(tx, req.principal, 'automation.created', String(row!.id));
      return row;
    });
  }
  @Put('automations/:id') async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    development(req);
    const input = parse(inputSchema, body);
    return withTenant(sql, req.principal, async (tx) => {
      await validateAutomation(tx, req.principal, input.definition);
      const [row] =
        await tx`update automations set name=${input.name},definition=${tx.json(toJson(input.definition))},enabled=${input.enabled},revision=revision+1,updated_at=now() where id=${parse(uuid, id)} and identifier=${input.identifier} returning *`;
      if (!row) throw new MailError(404, 'Automation not found or identifier changed');
      await audit(tx, req.principal, 'automation.updated', id);
      return row;
    });
  }
  @Post('automation-events') async event(@Req() req: AuthRequest, @Body() body: unknown) {
    if (req.principal.domainId)
      throw new ForbiddenException('Automation events require an unscoped full-access key');
    return createAutomationEvent(sql, req.principal, parse(automationEventSchema, body));
  }
  @Get('automation-runs') async runs(
    @Req() req: AuthRequest,
    @Query('automation_id') automation?: string,
  ) {
    const id = automation ? parse(uuid, automation) : null;
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select r.id,r.automation_id,r.contact_id,r.status,r.current_step,r.revision,r.next_step_at,r.error,r.created_at,c.email from automation_runs r join contacts c on c.id=r.contact_id and c.org_id=r.org_id and c.environment_id=r.environment_id where (${id}::uuid is null or r.automation_id=${id}) order by r.created_at desc limit 100`,
    );
  }
  @Get('automation-runs/:id') async run(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [run] = await tx`select * from automation_runs where id=${parse(uuid, id)}`;
      if (!run) throw new MailError(404, 'Automation run not found');
      return {
        ...run,
        steps:
          await tx`select * from automation_steps where run_id=${id} order by started_at,step_id`,
      };
    });
  }
  @Post('automation-runs/:id/cancel') async cancel(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return cancelAutomation(sql, req.principal, parse(uuid, id));
  }
}
