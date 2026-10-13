import { enforceLimit } from './rate-limit.js';
import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Injectable,
  Inject,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import * as oidc from 'openid-client';
import { z } from 'zod';
import {
  can,
  decrypt,
  encrypt,
  hashPassword,
  hashToken,
  newTotpSecret,
  verifyPassword,
  verifyTotp,
} from '@flare/shared';
import type { Action, Role } from '@flare/shared';
import { config, parse, redis, sql } from './context.js';
import type { AuthRequest } from './context.js';

export const Public = () => SetMetadata('public', true);
export const Access = (action: Action | 'send') => SetMetadata('access', action);
const jwtKey = new TextEncoder().encode(config.JWT_SECRET);
const dummyHash = hashPassword(randomBytes(24).toString('base64url'));
const loginSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string().max(256),
    code: z.string().max(128).optional(),
  })
  .strict();

export async function authenticateApiKey(token: string) {
  const [key] =
    await sql`select k.*, e.name as environment_name from api_keys k join environments e on e.id = k.environment_id and e.org_id = k.org_id where token_hash = ${hashToken(token)} and revoked_at is null`;
  if (!key) throw new UnauthorizedException('Invalid API key');
  await sql`update api_keys set last_used_at = now() where id = ${key.id}`;
  return {
    orgId: String(key.org_id),
    environmentId: String(key.environment_id),
    actorId: String(key.id),
    kind: 'api_key' as const,
    role: 'developer' as const,
    permission: key.permission as 'full_access' | 'sending_access',
    domainId: key.domain_id as string | null,
    production: key.environment_name === 'Production',
    allowPublish: Boolean(key.allow_publish),
    rateLimit: Number(key.rate_limit ?? process.env.API_RATE_LIMIT ?? 10),
    rateBurst: Number(key.rate_burst ?? process.env.API_RATE_BURST ?? 10),
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      if (req.path.startsWith('/v1/auth/'))
        await enforceLimit(
          res,
          `auth:${hashToken(req.ip ?? 'unknown')}`,
          Number(process.env.AUTH_RATE_LIMIT ?? 0.166667),
          Number(process.env.AUTH_RATE_BURST ?? 10),
        );
      return true;
    }
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Bearer authentication required');
    if (token.startsWith('fl_')) {
      const principal = await authenticateApiKey(token);
      req.principal = principal;
      await enforceLimit(res, `key:${principal.actorId}`, principal.rateLimit, principal.rateBurst);
    } else {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, jwtKey, {
          issuer: 'flare',
          audience: 'flare-dashboard',
          algorithms: ['HS256'],
        }));
      } catch {
        throw new UnauthorizedException('Invalid or expired session');
      }
      if (!payload.sub || typeof payload.jti !== 'string') throw new UnauthorizedException();
      const orgId = parse(z.string().uuid(), req.headers['x-org-id']);
      const environmentId = parse(z.string().uuid(), req.headers['x-environment-id']);
      const [membership] =
        await sql`select m.role, e.name from memberships m join sessions s on s.user_id = m.user_id join environments e on e.org_id = m.org_id where m.user_id = ${payload.sub} and m.org_id = ${orgId} and e.id = ${environmentId} and s.id = ${payload.jti} and s.revoked_at is null and s.expires_at > now()`;
      if (!membership)
        throw new ForbiddenException('No access to this organization or environment');
      req.principal = {
        orgId,
        environmentId,
        actorId: payload.sub,
        sessionId: payload.jti,
        role: membership.role as Role,
        kind: 'session',
        production: membership.name === 'Production',
      };
    }
    if (
      (req.headers['x-org-id'] && req.headers['x-org-id'] !== req.principal.orgId) ||
      (req.headers['x-environment-id'] &&
        req.headers['x-environment-id'] !== req.principal.environmentId)
    )
      throw new ForbiddenException('Credentials belong to a different tenant');
    const action =
      this.reflector.getAllAndOverride<Action | 'send'>('access', [
        context.getHandler(),
        context.getClass(),
      ]) ?? (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'read' : 'write');
    if (action === 'send' ? req.principal.role === 'viewer' : !can(req.principal, action))
      throw new ForbiddenException('Your role or API key does not allow this action');
    return true;
  }
}

async function issueSession(userId: string) {
  const [session] =
    await sql`insert into sessions (user_id, expires_at) values (${userId}, now() + interval '12 hours') returning id`;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(String(session!.id))
    .setIssuer('flare')
    .setAudience('flare-dashboard')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(jwtKey);
  const organizations =
    await sql`select o.id, o.name, m.role, coalesce(json_agg(json_build_object('id', e.id, 'name', e.name) order by e.name), '[]') as environments from memberships m join organizations o on o.id = m.org_id join environments e on e.org_id = o.id where m.user_id = ${userId} group by o.id, m.role order by o.created_at`;
  const [user] =
    await sql`select id, name, email, mfa_secret is not null as mfa_enabled from users where id = ${userId}`;
  return { token, expires_in: 43200, user, organizations };
}
async function consumeMfa(userId: string, code?: string) {
  return sql.begin(async (tx) => {
    const [user] = await tx`select * from users where id = ${userId} for update`;
    if (!user?.mfa_secret) return;
    const counter = verifyTotp(
      decrypt(String(user.mfa_secret), config.FLARE_ENCRYPTION_KEY, `mfa:${userId}`),
      code ?? '',
      Number(user.mfa_last_counter),
    );
    if (counter !== null) {
      await tx`update users set mfa_last_counter = ${counter} where id = ${userId}`;
      return;
    }
    const recovery = user.recovery_hashes as string[];
    const index = recovery.indexOf(hashToken(code ?? ''));
    if (index < 0) throw new UnauthorizedException('A valid MFA or recovery code is required');
    recovery.splice(index, 1);
    await tx`update users set recovery_hashes = ${tx.json(recovery)} where id = ${userId}`;
  });
}
const sessionOnly = (req: AuthRequest) => {
  if (req.principal.kind !== 'session') throw new ForbiddenException('A user session is required');
};
let oidcConfiguration: Promise<oidc.Configuration> | undefined;
function getOidc() {
  if (!process.env.OIDC_ISSUER || !process.env.OIDC_CLIENT_ID || !process.env.OIDC_CLIENT_SECRET)
    throw new BadRequestException('OIDC is not configured');
  return (oidcConfiguration ??= oidc.discovery(
    new URL(process.env.OIDC_ISSUER),
    process.env.OIDC_CLIENT_ID,
    process.env.OIDC_CLIENT_SECRET,
  ));
}

@Controller('v1/auth')
export class AuthController {
  @Public() @Get('config') configuration() {
    return {
      oidc_url:
        process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID
          ? `${process.env.PUBLIC_API_URL}/v1/auth/oidc`
          : null,
    };
  }
  @Public() @Post('login') async login(@Body() body: unknown) {
    const input = parse(loginSchema, body);
    const [user] = await sql`select id, password_hash from users where email = ${input.email}`;
    if (
      !(await verifyPassword(
        input.password,
        user?.password_hash ? String(user.password_hash) : await dummyHash,
      )) ||
      !user?.password_hash
    )
      throw new UnauthorizedException('Invalid credentials');
    await consumeMfa(String(user.id), input.code);
    return issueSession(String(user.id));
  }
  @Access('read') @Post('logout') async logout(@Req() req: AuthRequest) {
    sessionOnly(req);
    await sql`update sessions set revoked_at = now() where id = ${req.principal.sessionId!} and user_id = ${req.principal.actorId}`;
    return { success: true };
  }
  @Get('me') async me(@Req() req: AuthRequest) {
    sessionOnly(req);
    const [user] =
      await sql`select id, email, name, mfa_secret is not null as mfa_enabled from users where id = ${req.principal.actorId}`;
    const organizations =
      await sql`select o.id,o.name,m.role,json_agg(json_build_object('id',e.id,'name',e.name) order by e.name) as environments from memberships m join organizations o on o.id=m.org_id join environments e on e.org_id=o.id where m.user_id=${req.principal.actorId} group by o.id,m.role order by o.created_at`;
    return { user, principal: req.principal, organizations };
  }
  @Access('read') @Post('mfa/setup') async mfaSetup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    sessionOnly(req);
    const { password } = parse(z.object({ password: z.string().max(256) }), body);
    const [user] =
      await sql`select email, password_hash, mfa_secret from users where id = ${req.principal.actorId}`;
    if (!user?.password_hash || !(await verifyPassword(password, String(user.password_hash))))
      throw new UnauthorizedException('Password required');
    if (user.mfa_secret) throw new BadRequestException('MFA is already enabled');
    const secret = newTotpSecret();
    await sql`update users set mfa_pending = ${encrypt(secret, config.FLARE_ENCRYPTION_KEY, `mfa:${req.principal.actorId}`)} where id = ${req.principal.actorId}`;
    return {
      secret,
      uri: `otpauth://totp/Flare:${encodeURIComponent(String(user.email))}?secret=${secret}&issuer=Flare&algorithm=SHA1&digits=6&period=30`,
    };
  }
  @Access('read') @Post('mfa/enable') async mfaEnable(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    sessionOnly(req);
    const { code } = parse(z.object({ code: z.string() }), body);
    const codes = Array.from({ length: 10 }, () => randomBytes(12).toString('hex'));
    await sql.begin(async (tx) => {
      const [user] =
        await tx`select mfa_pending, mfa_secret from users where id = ${req.principal.actorId} for update`;
      if (!user?.mfa_pending || user.mfa_secret)
        throw new BadRequestException('Start MFA setup first');
      const counter = verifyTotp(
        decrypt(
          String(user.mfa_pending),
          config.FLARE_ENCRYPTION_KEY,
          `mfa:${req.principal.actorId}`,
        ),
        code,
      );
      if (counter === null) throw new BadRequestException('Invalid MFA code');
      await tx`update users set mfa_secret = mfa_pending, mfa_pending = null, mfa_last_counter = ${counter}, recovery_hashes = ${tx.json(codes.map(hashToken))} where id = ${req.principal.actorId}`;
      await tx`update sessions set revoked_at = now() where user_id = ${req.principal.actorId} and id != ${req.principal.sessionId!}`;
    });
    return { recovery_codes: codes };
  }
  @Access('read') @Post('mfa/disable') async mfaDisable(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    sessionOnly(req);
    const { password, code } = parse(
      z.object({ password: z.string().max(256), code: z.string() }),
      body,
    );
    const [user] = await sql`select password_hash from users where id = ${req.principal.actorId}`;
    if (!user?.password_hash || !(await verifyPassword(password, String(user.password_hash))))
      throw new UnauthorizedException();
    await consumeMfa(req.principal.actorId, code);
    await sql`update users set mfa_secret = null, mfa_pending = null, recovery_hashes = '[]', mfa_last_counter = -1 where id = ${req.principal.actorId}`;
    return { success: true };
  }
  @Public() @Get('oidc') async oidcStart(@Res() res: Response) {
    const configuration = await getOidc();
    const state = oidc.randomState(),
      nonce = oidc.randomNonce(),
      verifier = oidc.randomPKCECodeVerifier();
    await redis.set(`oidc:${state}`, JSON.stringify({ nonce, verifier }), 'EX', 600);
    res.cookie('flare_oidc_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.PUBLIC_API_URL?.startsWith('https:'),
      maxAge: 600_000,
      path: '/v1/auth/oidc',
    });
    res.redirect(
      oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: `${process.env.PUBLIC_API_URL}/v1/auth/oidc/callback`,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      }).href,
    );
  }
  @Public() @Get('oidc/callback') async oidcCallback(@Req() req: Request, @Res() res: Response) {
    const state = parse(z.string(), req.query.state);
    const cookie = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('flare_oidc_state='))
      ?.slice('flare_oidc_state='.length);
    if (cookie !== state) throw new UnauthorizedException('Invalid OIDC browser state');
    const saved = await redis.getdel(`oidc:${state}`);
    if (!saved) throw new UnauthorizedException('OIDC state expired');
    const { nonce, verifier } = JSON.parse(saved) as { nonce: string; verifier: string };
    const configuration = await getOidc();
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      new URL(req.originalUrl, process.env.PUBLIC_API_URL),
      {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    if (!claims || claims.email_verified !== true || typeof claims.email !== 'string')
      throw new UnauthorizedException('OIDC must return a verified email');
    const userId = await sql.begin(async (tx) => {
      const [existing] =
        await tx`select user_id from oidc_identities where issuer = ${claims.iss} and subject = ${claims.sub}`;
      if (existing) return String(existing.user_id);
      const [user] =
        await tx`select id from users where email = ${claims.email!.toString().toLowerCase()}`;
      if (!user) throw new ForbiddenException('Accept an organization invitation before using SSO');
      await tx`insert into oidc_identities (issuer, subject, user_id) values (${claims.iss}, ${claims.sub}, ${user.id})`;
      return String(user.id);
    });
    // Local MFA remains mandatory for SSO accounts that enabled it.
    const code = randomBytes(32).toString('base64url');
    await redis.set(`oidc-exchange:${hashToken(code)}`, userId, 'EX', 60);
    res.clearCookie('flare_oidc_state', { path: '/v1/auth/oidc' });
    res.redirect(`${process.env.WEB_ORIGIN}/login?code=${encodeURIComponent(code)}`);
  }
  @Public() @Post('exchange') async exchange(@Req() req: Request, @Body() body: unknown) {
    const { code, mfa_code } = parse(
      z.object({ code: z.string().min(32).max(256), mfa_code: z.string().max(128).optional() }),
      body,
    );
    const exchangeKey = `oidc-exchange:${hashToken(code)}`;
    const userId = await redis.get(exchangeKey);
    if (!userId) throw new UnauthorizedException('Exchange code expired or already used');
    await consumeMfa(userId, mfa_code);
    const consumed = await redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      1,
      exchangeKey,
      userId,
    );
    if (Number(consumed) !== 1)
      throw new UnauthorizedException('Exchange code expired or already used');
    return issueSession(userId);
  }
  @Public() @Post('accept-invite') async acceptInvite(@Req() req: Request, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          token: z.string().min(32).max(256),
          name: z.string().min(1).max(120),
          password: z.string().min(12).max(256),
        })
        .strict(),
      body,
    );
    const passwordHash = await hashPassword(input.password);
    const userId = await sql.begin(async (tx) => {
      const [invite] =
        await tx`select * from invites where token_hash = ${hashToken(input.token)} and expires_at > now() and accepted_at is null for update`;
      if (!invite) throw new BadRequestException('Invalid or expired invitation');
      const [existing] =
        await tx`select id, password_hash from users where email = ${invite.email}`;
      if (existing)
        throw new BadRequestException(
          'Existing users must accept this invitation from their authenticated session',
        );
      const [user] =
        await tx`insert into users (email, name, password_hash) values (${invite.email}, ${input.name}, ${passwordHash}) returning id`;
      await tx`insert into memberships (org_id, user_id, role) values (${invite.org_id}, ${user!.id}, ${invite.role})`;
      await tx`update invites set accepted_at = now() where id = ${invite.id}`;
      await tx`insert into audit_logs (org_id, actor_id, action, resource_id) values (${invite.org_id}, ${String(user!.id)}, 'member.joined', ${String(user!.id)})`;
      return String(user!.id);
    });
    return issueSession(userId);
  }
}
