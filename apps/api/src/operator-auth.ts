import {
  ForbiddenException,
  Injectable,
  Inject,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import type { Request, Response } from 'express';
import type { Sql, Transaction } from '@flare/db';
import { decrypt, hashToken, verifyTotp } from '@flare/shared';
import { z } from 'zod';
import { config, sql } from './context.js';
import { enforceLimit } from './rate-limit.js';

export interface OperatorIdentity {
  actorId: string;
  sessionId: string;
  user: { id: string; name: string; email: string };
  stepUpRequired: boolean;
  verifiedUntil: string | null;
}
export interface OperatorRequest extends Request {
  operator: OperatorIdentity;
}
export const OperatorWithoutStepUp = () => SetMetadata('operatorWithoutStepUp', true);

export function operatorIds(value: string | readonly string[]): Set<string> {
  const ids = (typeof value === 'string' ? value.split(',') : value)
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.some((id) => !z.string().uuid().safeParse(id).success))
    throw new Error('Operator user allowlist must contain UUIDs');
  return new Set(ids);
}

export async function verifyOperator(
  db: Sql,
  settings: { jwtSecret: string; userIds: string | readonly string[] },
  authorization: unknown,
  requireStepUp = true,
): Promise<OperatorIdentity> {
  const token =
    typeof authorization === 'string' ? authorization.match(/^Bearer (\S+)$/)?.[1] : null;
  if (!token || token.startsWith('fl_'))
    throw new UnauthorizedException('An operator user session is required');
  let actorId: string, sessionId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(settings.jwtSecret), {
      issuer: 'flare',
      audience: 'flare-dashboard',
      algorithms: ['HS256'],
    });
    actorId = z.string().uuid().parse(payload.sub);
    sessionId = z.string().uuid().parse(payload.jti);
  } catch {
    throw new UnauthorizedException('Invalid or expired operator session');
  }
  if (!operatorIds(settings.userIds).has(actorId))
    throw new ForbiddenException('Platform operator access is required');
  const [session] = await db`select u.id,u.name,u.email,s.operator_mfa_at,
    s.operator_mfa_at >= now()-interval '15 minutes' and s.operator_mfa_at <= now() as recent,
    s.operator_mfa_at+interval '15 minutes' as verified_until
    from sessions s join users u on u.id=s.user_id
    where s.id=${sessionId} and s.user_id=${actorId} and s.revoked_at is null
    and s.expires_at>now() and u.mfa_secret is not null`;
  if (!session)
    throw new UnauthorizedException('An active MFA-enabled operator session is required');
  if (requireStepUp && !session.recent)
    throw new ForbiddenException('Recent operator MFA verification is required');
  return {
    actorId,
    sessionId,
    user: { id: actorId, name: String(session.name), email: String(session.email) },
    stepUpRequired: !session.recent,
    verifiedUntil: session.recent ? new Date(session.verified_until).toISOString() : null,
  };
}

export async function grantOperatorMfa(
  db: Sql,
  identity: Pick<OperatorIdentity, 'actorId' | 'sessionId'>,
  code: string,
  encryptionKey: string,
) {
  return db.begin(async (tx) => {
    // Use the same user-first lock order as ordinary MFA replay protection.
    const [user] =
      await tx`select mfa_secret,mfa_last_counter,recovery_hashes from users where id=${identity.actorId} for update`;
    const [session] =
      await tx`select id from sessions where id=${identity.sessionId} and user_id=${identity.actorId} and revoked_at is null and expires_at>now() for update`;
    if (!user?.mfa_secret || !session)
      throw new UnauthorizedException('An active MFA-enabled operator session is required');
    const counter = verifyTotp(
      decrypt(String(user.mfa_secret), encryptionKey, `mfa:${identity.actorId}`),
      code,
      Number(user.mfa_last_counter),
    );
    if (counter !== null) {
      await tx`update users set mfa_last_counter=${counter} where id=${identity.actorId}`;
    } else {
      const recovery = [...(user.recovery_hashes as string[])];
      const index = recovery.indexOf(hashToken(code));
      if (index < 0)
        throw new ForbiddenException('A fresh authenticator or recovery code is required');
      recovery.splice(index, 1);
      await tx`update users set recovery_hashes=${tx.json(recovery)} where id=${identity.actorId}`;
    }
    const [updated] =
      await tx`update sessions set operator_mfa_at=now() where id=${identity.sessionId} returning operator_mfa_at+interval '15 minutes' as verified_until`;
    return { verified_until: new Date(updated!.verified_until).toISOString() };
  });
}

export async function authorizeOperatorMutation(
  tx: Transaction,
  identity: Pick<OperatorIdentity, 'actorId' | 'sessionId'>,
  userIds: string | readonly string[],
) {
  if (!operatorIds(userIds).has(identity.actorId))
    throw new ForbiddenException('Platform operator access is required');
  const [user] =
    await tx`select id from users where id=${identity.actorId} and mfa_secret is not null for update`;
  const [session] =
    await tx`select id from sessions where id=${identity.sessionId} and user_id=${identity.actorId} and revoked_at is null and expires_at>now() and operator_mfa_at>=now()-interval '15 minutes' and operator_mfa_at<=now() for update`;
  if (!user || !session)
    throw new ForbiddenException('Recent operator MFA verification is required');
}

@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<OperatorRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const withoutStepUp = this.reflector.getAllAndOverride<boolean>('operatorWithoutStepUp', [
      context.getHandler(),
      context.getClass(),
    ]);
    req.operator = await verifyOperator(
      sql,
      {
        jwtSecret: config.JWT_SECRET,
        userIds: config.FLARE_OPERATOR_USER_IDS,
      },
      req.headers.authorization,
      !withoutStepUp,
    );
    // A policy save refreshes several independent dashboard resources together.
    // Keep this separate from API-key admission and the tighter MFA-proof bucket.
    await enforceLimit(res, `operator:${req.operator.actorId}`, 10, 30);
    if (req.method === 'POST' && /^\/v1\/operator\/step-up\/?$/i.test(req.path))
      await enforceLimit(res, `operator-proof:${req.operator.actorId}`, 1 / 6, 5);
    return true;
  }
}
