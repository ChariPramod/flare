import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { withTenant } from '@flare/db';
import { createApiKey, encrypt } from '@flare/shared';
import { Access } from './auth.js';
import { config, parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
import { novu } from './novu.js';

const integrationInput = z
  .object({
    identifier: z.string().regex(/^[a-z][a-z0-9_-]{1,99}$/),
    name: z.string().min(1).max(120),
    provider: z.string().min(1).max(80),
    channel: z.enum(['email', 'sms', 'push', 'chat', 'in_app']),
    credentials: z.record(z.string()).default({}),
    active: z.boolean().default(true),
    primary: z.boolean().default(false),
    priority: z.number().int().min(0).max(100).default(0),
    conditions: z.unknown().optional(),
  })
  .strict();
@Controller('v1')
export class IntegrationController {
  @Get('integrations/catalog') catalog() {
    return {
      channels: {
        email: [
          {
            id: 'smtp',
            name: 'Flare SMTP relay',
            description: 'All workflow email enters the Flare email pipeline.',
          },
        ],
        sms: [
          { id: 'twilio', name: 'Twilio' },
          { id: 'plivo', name: 'Plivo' },
        ],
        push: [
          { id: 'fcm', name: 'Firebase' },
          { id: 'apns', name: 'Apple Push' },
        ],
        chat: [
          { id: 'slack', name: 'Slack' },
          { id: 'discord', name: 'Discord' },
        ],
        in_app: [{ id: 'novu', name: 'Novu Inbox' }],
      },
    };
  }
  @Get('integrations') list(@Req() req: AuthRequest) {
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select id,identifier,name,provider,channel,active,is_primary,priority,conditions,created_at from integrations order by channel,priority`,
    }));
  }
  @Access('manage_integrations') @Post('integrations') async create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = parse(integrationInput, body);
    if (input.channel === 'email' && input.provider !== 'smtp')
      throw new BadRequestException('Workflow email must use the Flare SMTP relay');
    const relayKey = input.channel === 'email' ? createApiKey() : null;
    const credentials = relayKey
      ? {
          host: 'flare-smtp-relay',
          port: '2525',
          user: 'flare',
          password: relayKey.token,
          secure: 'false',
          from: input.credentials.from ?? '',
          senderName: 'Flare',
        }
      : input.credentials;
    const result = (await novu(req.principal, '/v1/integrations', 'POST', {
      identifier: input.identifier,
      name: input.name,
      providerId: input.provider,
      channel: input.channel,
      credentials,
      active: input.active,
      primary: input.primary,
      conditions: input.conditions,
    })) as { _id?: string };
    return withTenant(sql, req.principal, async (tx) => {
      let relayKeyId: string | null = null;
      if (relayKey) {
        const [created] =
          await tx`insert into api_keys(org_id,environment_id,name,token_hash,prefix,permission) values(${req.principal.orgId},${req.principal.environmentId},${`SMTP ${input.name}`},${relayKey.hash},${relayKey.prefix},'sending_access') returning id`;
        relayKeyId = String(created!.id);
      }
      if (input.primary)
        await tx`update integrations set is_primary=false where channel=${input.channel}`;
      const [row] =
        await tx`insert into integrations(org_id,environment_id,identifier,provider,channel,name,credential_cipher,active,is_primary,priority,conditions,novu_id) values(${req.principal.orgId},${req.principal.environmentId},${input.identifier},${input.provider},${input.channel},${input.name},${encrypt(JSON.stringify(credentials), config.FLARE_ENCRYPTION_KEY, `${req.principal.orgId}/${req.principal.environmentId}`)},${input.active},${input.primary},${input.priority},${input.conditions === undefined ? null : tx.json(JSON.parse(JSON.stringify(input.conditions)))},${result._id ?? null}) returning id,identifier,name,provider,channel,active,is_primary,priority`;
      await audit(tx, req.principal, 'integration.created', String(row!.id));
      if (relayKeyId)
        await tx`update integrations set relay_key_id=${relayKeyId} where id=${row!.id}`;
      return row;
    });
  }
  @Access('manage_integrations') @Put('integrations/:id') async toggle(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    id = parse(z.string().uuid(), id);
    const input = parse(
      z
        .object({
          active: z.boolean(),
          primary: z.boolean().default(false),
          priority: z.number().int().min(0).max(100).default(0),
        })
        .strict(),
      body,
    );
    const [row] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select id,novu_id,channel from integrations where id=${id}`,
    );
    if (!row) throw new NotFoundException();
    await novu(
      req.principal,
      `/v1/integrations/${encodeURIComponent(String(row.novu_id))}`,
      'PUT',
      { active: input.active, primary: input.primary },
    );
    return withTenant(sql, req.principal, async (tx) => {
      if (input.primary)
        await tx`update integrations set is_primary=false where channel=${row.channel}`;
      await tx`update integrations set active=${input.active},is_primary=${input.primary},priority=${input.priority} where id=${id}`;
      await audit(tx, req.principal, 'integration.updated', id);
      return { id, ...input };
    });
  }
  @Access('manage_integrations') @Delete('integrations/:id') async remove(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    id = parse(z.string().uuid(), id);
    const [row] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select novu_id,relay_key_id from integrations where id=${id}`,
    );
    if (!row) throw new NotFoundException();
    await novu(
      req.principal,
      `/v1/integrations/${encodeURIComponent(String(row.novu_id))}`,
      'DELETE',
    );
    return withTenant(sql, req.principal, async (tx) => {
      if (row.relay_key_id)
        await tx`update api_keys set revoked_at=now() where id=${row.relay_key_id}`;
      await tx`delete from integrations where id=${id}`;
      await audit(tx, req.principal, 'integration.deleted', id);
      return { id, deleted: true };
    });
  }
}
