import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  SetMetadata,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  getSendingPolicy,
  listSendingPolicies,
  listSendingPolicyAudit,
  restoreProtectedSuppression,
  sendingPolicyUpdateSchema,
  updateSendingCredential,
  updateSendingPolicy,
  createMailRoute,
  disableMailRoute,
  listMailRoutes,
  mailRouteCreateSchema,
  configuredTransports,
} from '@flare/mail';
import { config, parse, sql } from './context.js';
import {
  authorizeOperatorMutation,
  grantOperatorMfa,
  OperatorGuard,
  OperatorWithoutStepUp,
} from './operator-auth.js';
import type { OperatorRequest } from './operator-auth.js';
import type { Transaction } from '@flare/db';

// Public bypasses tenant membership authorization only. Every route is protected
// by the independent operator guard; API keys and tenant owners receive no grant.
@SetMetadata('public', true)
@UseGuards(OperatorGuard)
@Controller('v1/operator')
export class OperatorController {
  @Get('mail-routes') async routes() {
    return listMailRoutes(sql);
  }
  @Post('mail-routes') async createRoute(@Req() req: OperatorRequest, @Body() body: unknown) {
    const input = parse(mailRouteCreateSchema, body);
    let transports;
    try {
      transports = configuredTransports();
    } catch {
      throw new ServiceUnavailableException('Named mail transports are unavailable');
    }
    return createMailRoute(sql, this.actor(req), input, transports);
  }
  @Post('mail-routes/:id/:revision/disable') async disableRoute(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Param('revision') revision: string,
    @Body() body: unknown,
  ) {
    const { reason } = parse(
      z.object({ reason: z.string().trim().min(10).max(2000) }).strict(),
      body,
    );
    return disableMailRoute(
      sql,
      this.actor(req),
      parse(z.string().uuid(), id),
      parse(z.coerce.number().int().positive(), revision),
      reason,
    );
  }
  @OperatorWithoutStepUp() @Post('logout') async logout(@Req() req: OperatorRequest) {
    await sql`update sessions set revoked_at=now(),operator_mfa_at=null where id=${req.operator.sessionId} and user_id=${req.operator.actorId}`;
    return { success: true };
  }
  @OperatorWithoutStepUp() @Get('session') session(@Req() req: OperatorRequest) {
    return {
      user: req.operator.user,
      step_up_required: req.operator.stepUpRequired,
      verified_until: req.operator.verifiedUntil,
    };
  }
  @OperatorWithoutStepUp() @Post('step-up') async stepUp(
    @Req() req: OperatorRequest,
    @Body() body: unknown,
  ) {
    const { code } = parse(z.object({ code: z.string().min(1).max(128) }).strict(), body);
    return grantOperatorMfa(sql, req.operator, code, config.FLARE_ENCRYPTION_KEY);
  }
  @Get('sending-policies') async policies() {
    return listSendingPolicies(sql);
  }
  @Get('sending-policies/:orgId') async policy(@Param('orgId') raw: string) {
    return getSendingPolicy(sql, parse(z.string().uuid(), raw));
  }
  @Patch('sending-policies/:orgId') async update(
    @Req() req: OperatorRequest,
    @Param('orgId') raw: string,
    @Body() body: unknown,
  ) {
    return updateSendingPolicy(
      sql,
      this.actor(req),
      parse(z.string().uuid(), raw),
      parse(sendingPolicyUpdateSchema, body),
    );
  }
  @Get('sending-policies/:orgId/audit') async audit(@Param('orgId') raw: string) {
    return listSendingPolicyAudit(sql, parse(z.string().uuid(), raw));
  }
  @Post('sending-policies/:orgId/restore-suppression') async restore(
    @Req() req: OperatorRequest,
    @Param('orgId') raw: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          email: z.string().email().toLowerCase(),
          reason: z.string().trim().min(10).max(2000),
          expected_revision: z.number().int().min(0),
        })
        .strict(),
      body,
    );
    return restoreProtectedSuppression(sql, this.actor(req), parse(z.string().uuid(), raw), input);
  }
  private actor(req: OperatorRequest) {
    return {
      actorId: req.operator.actorId,
      sessionId: req.operator.sessionId,
      authorize: (tx: Transaction) =>
        authorizeOperatorMutation(tx, req.operator, config.FLARE_OPERATOR_USER_IDS),
    };
  }
  @Patch('organizations/:orgId/credentials/:keyId') async credential(
    @Req() req: OperatorRequest,
    @Param('orgId') orgId: string,
    @Param('keyId') keyId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          expected_revision: z.number().int().min(0),
          reason: z.string().trim().min(10).max(2000),
          traffic_class: z.enum(['transactional', 'marketing']).nullable(),
          critical_sending: z.boolean(),
        })
        .strict(),
      body,
    );
    return updateSendingCredential(
      sql,
      this.actor(req),
      parse(z.string().uuid(), orgId),
      parse(z.string().uuid(), keyId),
      input,
    );
  }
}
