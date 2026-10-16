import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '@flare/db';
import type { Sql } from '@flare/db';
import { encrypt, hashToken, newTotpSecret, totp } from '@flare/shared';
import { withMfaProof } from './mfa-proof.js';

const userId = randomUUID(),
  secret = newTotpSecret();
const encryptionKey = randomBytes(32).toString('base64');
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  await db.exec(`create table users(id uuid primary key,mfa_secret text,mfa_last_counter bigint default -1,recovery_hashes jsonb default '[]');
    create table sessions(id uuid primary key,user_id uuid references users(id));`);
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate sessions,users cascade`;
  await sql`insert into users(id,mfa_secret,recovery_hashes) values(${userId},${encrypt(secret, encryptionKey, `mfa:${userId}`)},${sql.json([hashToken('recovery-once')])})`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
it('rejects missing users and missing or invalid MFA before performing the protected action', async () => {
  const action = vi.fn();
  for (const [id, code] of [
    [userId, undefined],
    [userId, 'invalid'],
    [randomUUID(), 'recovery-once'],
  ] as const)
    await expect(withMfaProof(sql, id, code, encryptionKey, action)).rejects.toMatchObject({
      status: 401,
    });
  expect(action).not.toHaveBeenCalled();
});
it('rolls back recovery proof and session creation together if the protected action fails', async () => {
  await expect(
    withMfaProof(sql, userId, 'recovery-once', encryptionKey, async (tx) => {
      await tx`insert into sessions(id,user_id) values(${randomUUID()},${userId})`;
      throw new Error('Session issuance failed');
    }),
  ).rejects.toThrow('Session issuance failed');
  expect(await sql`select id from sessions`).toHaveLength(0);
  expect(
    (await sql`select recovery_hashes from users where id=${userId}`)[0]?.recovery_hashes,
  ).toEqual([hashToken('recovery-once')]);
  const sessionId = randomUUID();
  expect(
    await withMfaProof(sql, userId, 'recovery-once', encryptionKey, async (tx) => {
      await tx`insert into sessions(id,user_id) values(${sessionId},${userId})`;
      return sessionId;
    }),
  ).toBe(sessionId);
  await expect(
    withMfaProof(sql, userId, 'recovery-once', encryptionKey, async () => undefined),
  ).rejects.toMatchObject({ status: 401 });
  expect(await sql`select id from sessions`).toEqual([{ id: sessionId }]);
});
it('rolls back TOTP consumption with a failed action and consumes it once after success', async () => {
  const code = totp(secret, Math.floor(Date.now() / 30000));
  await expect(
    withMfaProof(sql, userId, code, encryptionKey, async (tx) => {
      await tx`update users set mfa_secret=null where id=${userId}`;
      throw new Error('Disable failed');
    }),
  ).rejects.toThrow('Disable failed');
  expect(
    (await sql`select mfa_secret,mfa_last_counter from users where id=${userId}`)[0],
  ).toMatchObject({ mfa_secret: expect.any(String), mfa_last_counter: '-1' });
  await withMfaProof(sql, userId, code, encryptionKey, async () => undefined);
  await expect(
    withMfaProof(sql, userId, code, encryptionKey, async () => undefined),
  ).rejects.toMatchObject({ status: 401 });
});
it('runs password-only session issuance in the same transaction even before MFA enrollment', async () => {
  await sql`update users set mfa_secret=null where id=${userId}`;
  await expect(
    withMfaProof(sql, userId, undefined, encryptionKey, async (tx) => {
      await tx`insert into sessions(id,user_id) values(${randomUUID()},${userId})`;
      throw new Error('Rollback session');
    }),
  ).rejects.toThrow('Rollback session');
  expect(await sql`select id from sessions`).toHaveLength(0);
});
