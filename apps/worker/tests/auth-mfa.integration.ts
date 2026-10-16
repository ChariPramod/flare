import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '@flare/db';
import { encrypt, hashToken, newTotpSecret } from '@flare/shared';
import { withMfaProof } from '../../api/src/mfa-proof.js';
import { integrationTargets } from './targets.mjs';

const { databaseUrl } = integrationTargets();
const login = connectDatabase(databaseUrl, { max: 1 }).client;
const enrollment = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const userId = randomUUID(),
  existingSession = randomUUID();
const encryptionKey = randomBytes(32).toString('base64');
const cipher = encrypt(newTotpSecret(), encryptionKey, `mfa:${userId}`);
const application = `flare-mfa-race-${randomUUID()}`;
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function blocked(name: string) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const rows =
      await observer`select pid from pg_stat_activity where application_name=${name} and wait_event_type='Lock'`;
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected MFA race to block on the user row lock');
}
beforeAll(async () => {
  for (const db of [login, enrollment, observer]) db.options.onnotice = () => undefined;
  await login`drop schema public cascade`;
  await login`create schema public`;
  await login`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await login.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await login`select set_config('application_name',${`${application}-login`},false)`;
  await enrollment`select set_config('application_name',${`${application}-enroll`},false)`;
});
beforeEach(async () => {
  await login`truncate sessions,users cascade`;
  await login`insert into users(id,email,name) values(${userId},'race@example.test','MFA race')`;
  await login`insert into sessions(id,user_id,expires_at) values(${existingSession},${userId},now()+interval '1 hour')`;
});
afterAll(async () => {
  await Promise.all([
    login.end({ timeout: 5 }),
    enrollment.end({ timeout: 5 }),
    observer.end({ timeout: 5 }),
  ]);
});
it('serializes password-only session creation with enrollment so the issued session is revoked', async () => {
  const proof = gate(),
    release = gate(),
    sessionId = randomUUID();
  const issued = withMfaProof(login, userId, undefined, encryptionKey, async (tx) => {
    proof.release();
    await release.promise;
    await tx`insert into sessions(id,user_id,expires_at) values(${sessionId},${userId},now()+interval '1 hour')`;
  });
  void issued.catch(() => undefined);
  let enabled: Promise<unknown> | undefined;
  try {
    await Promise.race([proof.promise, issued]);
    enabled = enrollment.begin(async (tx) => {
      await tx`select id from users where id=${userId} for update`;
      await tx`update users set mfa_secret=${cipher} where id=${userId}`;
      await tx`update sessions set revoked_at=now() where user_id=${userId} and id<>${existingSession}`;
    });
    void enabled.catch(() => undefined);
    await blocked(`${application}-enroll`);
  } finally {
    release.release();
    await issued;
    await enabled;
  }
  expect(
    (await observer`select revoked_at from sessions where id=${sessionId}`)[0]?.revoked_at,
  ).toBeInstanceOf(Date);
  await expect(
    withMfaProof(login, userId, undefined, encryptionKey, async () => undefined),
  ).rejects.toMatchObject({ status: 401 });
});
it('requires MFA when enrollment commits before a waiting login acquires its user lock', async () => {
  const changed = gate(),
    release = gate();
  const enabled = enrollment.begin(async (tx) => {
    await tx`select id from users where id=${userId} for update`;
    await tx`update users set mfa_secret=${cipher} where id=${userId}`;
    changed.release();
    await release.promise;
  });
  void enabled.catch(() => undefined);
  let attempt: Promise<unknown> | undefined;
  try {
    await Promise.race([changed.promise, enabled]);
    attempt = withMfaProof(login, userId, undefined, encryptionKey, async (tx) => {
      await tx`insert into sessions(id,user_id,expires_at) values(${randomUUID()},${userId},now()+interval '1 hour')`;
    });
    void attempt.catch(() => undefined);
    await blocked(`${application}-login`);
  } finally {
    release.release();
    await enabled;
  }
  await expect(attempt).rejects.toMatchObject({ status: 401 });
  expect(await observer`select id from sessions where user_id=${userId}`).toEqual([
    { id: existingSession },
  ]);
});
it('allows only one session from concurrent recovery-code proofs', async () => {
  await login`update users set mfa_secret=${cipher},recovery_hashes=${login.json([hashToken('concurrent-recovery')])} where id=${userId}`;
  const proof = gate(),
    release = gate();
  const first = withMfaProof(login, userId, 'concurrent-recovery', encryptionKey, async (tx) => {
    proof.release();
    await release.promise;
    await tx`insert into sessions(id,user_id,expires_at) values(${randomUUID()},${userId},now()+interval '1 hour')`;
  });
  void first.catch(() => undefined);
  let second: Promise<unknown> | undefined;
  try {
    await Promise.race([proof.promise, first]);
    second = withMfaProof(enrollment, userId, 'concurrent-recovery', encryptionKey, async (tx) => {
      await tx`insert into sessions(id,user_id,expires_at) values(${randomUUID()},${userId},now()+interval '1 hour')`;
    });
    void second.catch(() => undefined);
    await blocked(`${application}-enroll`);
  } finally {
    release.release();
    await first;
  }
  await expect(second).rejects.toMatchObject({ status: 401 });
  expect(await observer`select id from sessions where user_id=${userId}`).toHaveLength(2);
});
