import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../../packages/db/src/index.js';
import type { Sql } from '../../../packages/db/src/index.js';
import { encrypt, hashToken, newTotpSecret, totp } from '../../../packages/shared/src/security.js';
vi.mock('./context.js', () => ({ config: {}, sql: {}, redis: {} }));
import {
  authorizeOperatorMutation,
  grantOperatorMfa,
  operatorIds,
  verifyOperator,
} from './operator-auth.js';

const operatorId = randomUUID(),
  outsiderId = randomUUID(),
  sessionId = randomUUID(),
  otherSession = randomUUID();
const secret = newTotpSecret(),
  encryptionKey = randomBytes(32).toString('base64');
const settings = { jwtSecret: randomBytes(32).toString('hex'), userIds: operatorId };
const identity = { actorId: operatorId, sessionId };
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  await db.exec(`create table users(id uuid primary key,name text,email text,mfa_secret text,mfa_last_counter bigint default -1,recovery_hashes jsonb default '[]');
    create table sessions(id uuid primary key,user_id uuid references users(id),expires_at timestamptz,revoked_at timestamptz,operator_mfa_at timestamptz);`);
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate sessions,users cascade`;
  await sql`insert into users(id,name,email,mfa_secret,recovery_hashes) values(${operatorId},'Operator','operator@example.test',${encrypt(secret, encryptionKey, `mfa:${operatorId}`)},${sql.json([hashToken('single-use-recovery')])}),(${outsiderId},'Tenant owner','owner@example.test',${encrypt(secret, encryptionKey, `mfa:${outsiderId}`)},'[]')`;
  await sql`insert into sessions(id,user_id,expires_at) values(${sessionId},${operatorId},now()+interval '1 hour'),(${otherSession},${operatorId},now()+interval '1 hour')`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function bearer(sub = operatorId, jti = sessionId, expiry = '1h') {
  return `Bearer ${await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setJti(jti).setIssuer('flare').setAudience('flare-dashboard').setExpirationTime(expiry).sign(new TextEncoder().encode(settings.jwtSecret))}`;
}

it('uses an explicit UUID allowlist and no organization membership or tenant headers', async () => {
  expect(operatorIds(` ${operatorId}, ${operatorId} `).size).toBe(1);
  expect(() => operatorIds('owner@example.test')).toThrow('UUIDs');
  const token = await bearer();
  expect(await verifyOperator(sql, settings, token, false)).toMatchObject({
    actorId: operatorId,
    sessionId,
    stepUpRequired: true,
  });
  await expect(
    verifyOperator(sql, { ...settings, userIds: '' }, token, false),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    verifyOperator(sql, settings, await bearer(outsiderId), false),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    verifyOperator(sql, settings, 'Bearer fl_not-an-operator', false),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    verifyOperator(sql, settings, token.replace(/.$/, '!'), false),
  ).rejects.toMatchObject({ status: 401 });
});
it('requires live MFA and recent proof bound to exactly one session', async () => {
  const token = await bearer();
  await expect(verifyOperator(sql, settings, token)).rejects.toMatchObject({ status: 403 });
  await grantOperatorMfa(
    sql,
    identity,
    totp(secret, Math.floor(Date.now() / 30000)),
    encryptionKey,
  );
  expect(await verifyOperator(sql, settings, token)).toMatchObject({
    stepUpRequired: false,
    verifiedUntil: expect.any(String),
  });
  await expect(
    verifyOperator(sql, settings, await bearer(operatorId, otherSession)),
  ).rejects.toMatchObject({ status: 403 });
  for (const date of ["now()-interval '16 minutes'", "now()+interval '1 minute'"]) {
    await sql.unsafe(`update sessions set operator_mfa_at=${date} where id=$1`, [sessionId]);
    await expect(verifyOperator(sql, settings, token)).rejects.toMatchObject({ status: 403 });
  }
  await sql`update sessions set operator_mfa_at=now(),revoked_at=now() where id=${sessionId}`;
  await expect(verifyOperator(sql, settings, token, false)).rejects.toMatchObject({ status: 401 });
  await sql`update sessions set revoked_at=null,expires_at=now()-interval '1 minute' where id=${sessionId}`;
  await expect(verifyOperator(sql, settings, token, false)).rejects.toMatchObject({ status: 401 });
  await sql`update sessions set expires_at=now()+interval '1 hour' where id=${sessionId}`;
  await sql`update users set mfa_secret=null where id=${operatorId}`;
  await expect(verifyOperator(sql, settings, token, false)).rejects.toMatchObject({ status: 401 });
  await expect(
    verifyOperator(sql, settings, await bearer(operatorId, sessionId, '-1s'), false),
  ).rejects.toMatchObject({ status: 401 });
});
it('consumes TOTP/recovery atomically without elevating rejected or replayed attempts', async () => {
  await expect(grantOperatorMfa(sql, identity, 'invalid', encryptionKey)).rejects.toMatchObject({
    status: 403,
  });
  expect(
    (await sql`select operator_mfa_at from sessions where id=${sessionId}`)[0]?.operator_mfa_at,
  ).toBeNull();
  const attempts = await Promise.allSettled([
    grantOperatorMfa(sql, identity, 'single-use-recovery', encryptionKey),
    grantOperatorMfa(
      sql,
      { ...identity, sessionId: otherSession },
      'single-use-recovery',
      encryptionKey,
    ),
  ]);
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await sql`select count(*)::int as n from sessions where operator_mfa_at is not null`)[0]?.n,
  ).toBe(1);
  expect(
    (await sql`select recovery_hashes from users where id=${operatorId}`)[0]?.recovery_hashes,
  ).toEqual([]);
  const code = totp(secret, Math.floor(Date.now() / 30000));
  await grantOperatorMfa(sql, identity, code, encryptionKey);
  await expect(grantOperatorMfa(sql, identity, code, encryptionKey)).rejects.toMatchObject({
    status: 403,
  });
});
it('rechecks elevated authorization in the policy mutation transaction', async () => {
  await grantOperatorMfa(sql, identity, 'single-use-recovery', encryptionKey);
  await sql.begin((tx) => authorizeOperatorMutation(tx, identity, settings.userIds));
  await expect(
    sql.begin((tx) => authorizeOperatorMutation(tx, identity, '')),
  ).rejects.toMatchObject({ status: 403 });
  await sql`update sessions set revoked_at=now() where id=${sessionId}`;
  await expect(
    sql.begin((tx) => authorizeOperatorMutation(tx, identity, settings.userIds)),
  ).rejects.toMatchObject({ status: 403 });
});

it.each(['session', 'MFA'] as const)(
  'rejects an operator mutation when its %s window expires after the transaction starts',
  async (window) => {
    await expect(
      sql.begin(async (tx) => {
        if (window === 'session')
          await tx`update sessions set operator_mfa_at=now(),expires_at=now()+interval '20 milliseconds' where id=${sessionId}`;
        else
          await tx`update sessions set operator_mfa_at=now()-interval '15 minutes'+interval '20 milliseconds' where id=${sessionId}`;
        await new Promise((resolve) => setTimeout(resolve, 50));
        const [elapsed] =
          await tx`select clock_timestamp()>now()+interval '20 milliseconds' as expired`;
        expect(elapsed?.expired).toBe(true);
        await authorizeOperatorMutation(tx, identity, settings.userIds);
      }),
    ).rejects.toMatchObject({ status: 403 });
  },
);

it('does not consume MFA proof or elevate a session that expires while step-up waits', async () => {
  const delayed = new Proxy(sql, {
    get(target, property, receiver) {
      if (property !== 'begin') return Reflect.get(target, property, receiver);
      return (action: Parameters<Sql['begin']>[0]) =>
        sql.begin(async (tx) => {
          await tx`update sessions set expires_at=now()+interval '20 milliseconds' where id=${sessionId}`;
          await new Promise((resolve) => setTimeout(resolve, 50));
          const [elapsed] =
            await tx`select clock_timestamp()>expires_at as expired from sessions where id=${sessionId}`;
          expect(elapsed?.expired).toBe(true);
          return action(tx);
        });
    },
  });
  await expect(
    grantOperatorMfa(delayed, identity, 'single-use-recovery', encryptionKey),
  ).rejects.toMatchObject({ status: 401 });
  expect(
    (await sql`select recovery_hashes from users where id=${operatorId}`)[0]?.recovery_hashes,
  ).toEqual([hashToken('single-use-recovery')]);
  expect(
    (await sql`select operator_mfa_at from sessions where id=${sessionId}`)[0]?.operator_mfa_at,
  ).toBeNull();
});
