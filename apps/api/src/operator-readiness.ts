import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { Transaction } from '@flare/db';
import { z } from 'zod';
import {
  configuredTransports,
  domainReadinessRevokeSchema,
  domainReadinessUpdateSchema,
  listDomainReadiness,
  revokeDomainReadiness,
  updateDomainReadiness,
} from '@flare/mail';
import { config, parse, sql } from './context.js';
import { authorizeOperatorMutation, OperatorGuard } from './operator-auth.js';
import type { OperatorRequest } from './operator-auth.js';

@SetMetadata('public', true)
@UseGuards(OperatorGuard)
@Controller('v1/operator/organizations/:orgId/domains/:domainId/evidence')
export class OperatorReadinessController {
  private transports(required = true) {
    try {
      return configuredTransports();
    } catch {
      // Revocation and inspection must remain possible after a credential/configuration outage.
      if (!required) return [];
      throw new ServiceUnavailableException('Named mail transports are unavailable');
    }
  }
  private actor(req: OperatorRequest) {
    return {
      actorId: req.operator.actorId,
      sessionId: req.operator.sessionId,
      authorize: (tx: Transaction) =>
        authorizeOperatorMutation(tx, req.operator, config.FLARE_OPERATOR_USER_IDS),
    };
  }
  @Get() async list(@Param('orgId') orgId: string, @Param('domainId') domainId: string) {
    return listDomainReadiness(
      sql,
      parse(z.string().uuid(), orgId),
      parse(z.string().uuid(), domainId),
      this.transports(false),
    );
  }
  @Post() async record(
    @Req() req: OperatorRequest,
    @Param('orgId') orgId: string,
    @Param('domainId') domainId: string,
    @Body() body: unknown,
  ) {
    return updateDomainReadiness(
      sql,
      this.actor(req),
      parse(z.string().uuid(), orgId),
      parse(z.string().uuid(), domainId),
      parse(domainReadinessUpdateSchema, body),
      this.transports(),
    );
  }
  @Post(':instanceId/revoke') async revoke(
    @Req() req: OperatorRequest,
    @Param('orgId') orgId: string,
    @Param('domainId') domainId: string,
    @Param('instanceId') instanceId: string,
    @Body() body: unknown,
  ) {
    return revokeDomainReadiness(
      sql,
      this.actor(req),
      parse(z.string().uuid(), orgId),
      parse(z.string().uuid(), domainId),
      parse(z.string().min(1).max(128), instanceId),
      parse(domainReadinessRevokeSchema, body),
      this.transports(false),
    );
  }
}
