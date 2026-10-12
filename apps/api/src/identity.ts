import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { withTenant } from '@flare/db';
import type { Transaction } from '@flare/db';
import { createApiKey, encrypt, hashToken } from '@flare/shared';
import type { Principal } from '@flare/shared';
import { Access } from './auth.js';
import { config, parse, sql } from './context.js';
import type { AuthRequest } from './context.js';

export async function audit(
  tx: Transaction,
  p: Principal,
  action: string,
  resourceId: string | null = null,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await tx`insert into audit_logs (org_id, environment_id, actor_id, action, resource_id, metadata) values (${p.orgId}, ${p.environmentId}, ${p.actorId}, ${action}, ${resourceId}, ${tx.json(metadata)})`;
}
const idSchema = z.string().uuid();
const sessionOnly = (req: AuthRequest) => {
  if (req.principal.kind !== 'session') throw new ForbiddenException('A user session is required');
};

@Controller('v1')
export class IdentityController {
  @Get('environments') async environments(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select id, name, novu_key_cipher is not null as novu_configured, novu_application_id, bridge_url from environments order by name`,
    );
  }
  @Access('manage_integrations') @Patch('environments/:id') async updateEnvironment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    sessionOnly(req);
    id = parse(idSchema, id);
    const input = parse(
      z
        .object({
          novu_api_key: z.string().min(1).max(1024).optional(),
          novu_application_id: z.string().min(1).max(128).optional(),
          bridge_url: z
            .string()
            .url()
            .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
            .nullable()
            .optional(),
        })
        .strict(),
      body,
    );
    return withTenant(sql, req.principal, async (tx) => {
      const [environment] = await tx`select id from environments where id = ${id}`;
      if (!environment) throw new NotFoundException();
      if (input.novu_api_key)
        await tx`update environments set novu_key_cipher = ${encrypt(input.novu_api_key, config.FLARE_ENCRYPTION_KEY, `${req.principal.orgId}/${id}`)} where id = ${id}`;
      if (input.novu_application_id)
        await tx`update environments set novu_application_id = ${input.novu_application_id} where id = ${id}`;
      if (input.bridge_url !== undefined)
        await tx`update environments set bridge_url = ${input.bridge_url} where id = ${id}`;
      await audit(tx, req.principal, 'environment.updated', id);
      return { id, updated: true };
    });
  }
  @Access('manage_keys') @Get('api-keys') async keys(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select id, name, prefix, permission, domain_id, created_at, last_used_at, revoked_at from api_keys order by created_at desc`,
    );
  }
  @Access('manage_keys') @Post('api-keys') async createKey(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          name: z.string().trim().min(1).max(120),
          permission: z.enum(['full_access', 'sending_access']),
          domain_id: idSchema.optional(),
        })
        .strict()
        .refine(
          (value) => !value.domain_id || value.permission === 'sending_access',
          'Only sending keys may be domain scoped',
        ),
      body,
    );
    const key = createApiKey();
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`insert into api_keys (org_id, environment_id, name, token_hash, prefix, permission, domain_id, created_by) values (${req.principal.orgId}, ${req.principal.environmentId}, ${input.name}, ${key.hash}, ${key.prefix}, ${input.permission}, ${input.domain_id ?? null}, ${req.principal.actorId}) returning id, name, prefix, permission, domain_id, created_at`;
      await audit(tx, req.principal, 'api_key.created', String(row!.id));
      return { ...row, token: key.token };
    });
  }
  @Access('manage_keys') @Delete('api-keys/:id') async revokeKey(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    id = parse(idSchema, id);
    return withTenant(sql, req.principal, async (tx) => {
      const [key] =
        await tx`update api_keys set revoked_at = coalesce(revoked_at, now()) where id = ${id} returning id`;
      if (!key) throw new NotFoundException();
      await audit(tx, req.principal, 'api_key.revoked', id);
      return { id, revoked: true };
    });
  }
  @Get('team') async team(@Req() req: AuthRequest) {
    sessionOnly(req);
    return sql`select u.id, u.name, u.email, m.role, m.created_at from memberships m join users u on u.id = m.user_id where m.org_id = ${req.principal.orgId} order by m.created_at`;
  }
  @Access('manage_team') @Post('team/invites') async invite(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          email: z.string().email().toLowerCase(),
          role: z.enum(['admin', 'developer', 'viewer']),
        })
        .strict(),
      body,
    );
    const token = randomBytes(32).toString('base64url');
    return withTenant(sql, req.principal, async (tx) => {
      const [invite] =
        await tx`insert into invites (org_id, email, role, token_hash, expires_at) values (${req.principal.orgId}, ${input.email}, ${input.role}, ${hashToken(token)}, now() + interval '7 days') returning id, email, role, expires_at`;
      await audit(tx, req.principal, 'member.invited', String(invite!.id));
      return { ...invite, accept_url: `${process.env.WEB_ORIGIN}/invite?token=${token}` };
    });
  }
  @Access('read') @Post('team/accept-invite') async acceptExisting(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    sessionOnly(req);
    const { token } = parse(z.object({ token: z.string().min(32).max(256) }).strict(), body);
    return sql.begin(async (tx) => {
      const [invite] =
        await tx`select i.* from invites i join users u on u.email = i.email where u.id = ${req.principal.actorId} and i.token_hash = ${hashToken(token)} and i.accepted_at is null and i.expires_at > now() for update of i`;
      if (!invite) throw new BadRequestException('Invalid or expired invitation for this user');
      await tx`insert into memberships (org_id, user_id, role) values (${invite.org_id}, ${req.principal.actorId}, ${invite.role}) on conflict do nothing`;
      await tx`update invites set accepted_at = now() where id = ${invite.id}`;
      await tx`insert into audit_logs (org_id, actor_id, action, resource_id) values (${invite.org_id}, ${req.principal.actorId}, 'member.joined', ${req.principal.actorId})`;
      return { success: true };
    });
  }
  @Access('manage_team') @Patch('team/:id') async role(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { role } = parse(
      z.object({ role: z.enum(['owner', 'admin', 'developer', 'viewer']) }).strict(),
      body,
    );
    return this.changeMember(req.principal, parse(idSchema, id), role);
  }
  @Access('manage_team') @Delete('team/:id') async removeMember(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.changeMember(req.principal, parse(idSchema, id), null);
  }
  private async changeMember(p: Principal, id: string, role: string | null) {
    return sql.begin(async (tx) => {
      await tx`select id from organizations where id = ${p.orgId} for update`;
      const [member] =
        await tx`select role from memberships where org_id = ${p.orgId} and user_id = ${id}`;
      if (!member) throw new NotFoundException();
      if ((member.role === 'owner' || role === 'owner') && p.role !== 'owner')
        throw new ForbiddenException('Only an owner can change ownership');
      if (member.role === 'owner' && role !== 'owner') {
        const [count] =
          await tx`select count(*)::int as n from memberships where org_id = ${p.orgId} and role = 'owner'`;
        if (Number(count!.n) < 2)
          throw new BadRequestException('The last owner cannot be removed or demoted');
      }
      if (role)
        await tx`update memberships set role = ${role} where org_id = ${p.orgId} and user_id = ${id}`;
      else await tx`delete from memberships where org_id = ${p.orgId} and user_id = ${id}`;
      await audit(tx, p, role ? 'member.role_changed' : 'member.removed', id, { role });
      return { id, role, removed: role === null };
    });
  }
  @Get('audit-logs') async auditLogs(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) => tx`select * from audit_logs order by created_at desc limit 100`,
    );
  }
}
