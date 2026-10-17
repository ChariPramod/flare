import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '@flare/db';
import type { Transaction } from '@flare/db';
import { encrypt, hashToken, newTotpSecret } from '@flare/shared';
import { lockSendingPolicy, updateSendingPolicy } from '@flare/mail';
import { integrationTargets } from './targets.mjs';

vi.mock('../../api/src/context.js', () => ({ config: {}, sql: {}, redis: {} }));
import { authorizeOperatorMutation, grantOperatorMfa } from '../../api/src/operator-auth.js';

const { databaseUrl } = integrationTargets();
const blocker = connectDatabase(databaseUrl, { max: 1 }).client;
const operator = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const userId = randomUUID(),
  sessionId = randomUUID(),
  orgId = randomUUID();
const application = `flare-operator-expiry-${randomUUID()}`;
const encryptionKey = randomBytes(32).toString('base64');
const identity = { actorId: userId, sessionId };
const actor = {
  ...identity,
  authorize: (tx: Transaction) => authorizeOperatorMutation(tx, identity, userId),
};
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function until(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
}
async function blocked() {
  await until(async () => {
    const [row] =
      await observer`select pid from pg_stat_activity where application_name=${application} and wait_event_type='Lock'`;
    return Boolean(row);
  }, 'Operator request never reached the controlled lock');
}
async function expires(window: 'session' | 'MFA') {
  await until(async () => {
    const [row] =
      window === 'session'
        ? await observer`select expires_at<clock_timestamp() as expired from sessions where id=${sessionId}`
        : await observer`select operator_mfa_at+interval '15 minutes'<clock_timestamp() as expired from sessions where id=${sessionId}`;
    return row?.expired === true;
  }, 'Operator deadline did not expire');
}
async function duringLock(
  lock: (tx: Transaction) => Promise<unknown>,
  action: () => Promise<unknown>,
  afterBlocked: () => Promise<void>,
) {
  const locked = gate(),
    release = gate();
  const holding = blocker.begin(async (tx) => {
    await lock(tx);
    locked.release();
    await release.promise;
  });
  void holding.catch(() => undefined);
  let attempted: Promise<unknown> | undefined;
  try {
    await Promise.race([
      locked.promise,
      holding.then(() => {
        throw new Error('Blocker finished before acquiring lock');
      }),
    ]);
    attempted = action();
    void attempted.catch(() => undefined);
    await blocked();
    await afterBlocked();
  } finally {
    release.release();
    await holding;
  }
  return attempted!;
}
beforeAll(async () => {
  for (const db of [blocker, operator, observer]) db.options.onnotice = () => undefined;
  await observer`drop schema public cascade`;
  await observer`create schema public`;
  await observer`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await observer.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await operator`select set_config('application_name',${application},false)`;
  await observer`insert into organizations(id,name,slug) values(${orgId},'Operator expiry','operator-expiry')`;
});
beforeEach(async () => {
  await observer`truncate sessions,users,audit_logs cascade`;
  await observer`insert into users(id,email,name,mfa_secret,recovery_hashes) values(${userId},'operator-expiry@example.test','Operator expiry',${encrypt(newTotpSecret(), encryptionKey, `mfa:${userId}`)},${observer.json([hashToken('one-use-recovery')])})`;
  await observer`insert into sessions(id,user_id,expires_at,operator_mfa_at) values(${sessionId},${userId},now()+interval '1 hour',now())`;
  await observer`update sending_policies set state='pending_review',revision=0 where org_id=${orgId}`;
});
afterAll(async () => {
  await Promise.all([
    blocker.end({ timeout: 5 }),
    operator.end({ timeout: 5 }),
    observer.end({ timeout: 5 }),
  ]);
});

it.each([
  ['user', 'session', 'mutation'],
  ['session', 'session', 'mutation'],
  ['user', 'MFA', 'mutation'],
  ['session', 'MFA', 'mutation'],
  ['user', 'session', 'step-up'],
  ['session', 'session', 'step-up'],
] as const)('rejects %s-lock-stalled %s expiry during %s', async (lock, window, action) => {
  if (window === 'session')
    await observer`update sessions set expires_at=clock_timestamp()+interval '2 seconds' where id=${sessionId}`;
  else
    await observer`update sessions set operator_mfa_at=clock_timestamp()-interval '15 minutes'+interval '2 seconds' where id=${sessionId}`;
  await expect(
    duringLock(
      async (tx) =>
        lock === 'user'
          ? tx`select id from users where id=${userId} for update`
          : tx`select id from sessions where id=${sessionId} for update`,
      () =>
        action === 'mutation'
          ? operator.begin((tx) => authorizeOperatorMutation(tx, identity, userId))
          : grantOperatorMfa(operator, identity, 'one-use-recovery', encryptionKey),
      async () => {
        // Prove the authorization was valid at BEGIN, then let the unchanged
        // locked row expire. No UPDATE/EPQ recheck can hide a pre-lock predicate.
        const [row] =
          await observer`select a.xact_start<s.expires_at and a.xact_start<s.operator_mfa_at+interval '15 minutes' as started_valid from pg_stat_activity a cross join sessions s where a.application_name=${application} and s.id=${sessionId}`;
        expect(row?.started_valid).toBe(true);
        await expires(window);
      },
    ),
  ).rejects.toMatchObject({ status: action === 'mutation' ? 403 : 401 });
  expect(
    (await observer`select recovery_hashes from users where id=${userId}`)[0]?.recovery_hashes,
  ).toEqual([hashToken('one-use-recovery')]);
});

it.each(['session', 'MFA'] as const)(
  'rolls back a policy update when %s expires after initial authorization',
  async (window) => {
    if (window === 'session')
      await observer`update sessions set expires_at=clock_timestamp()+interval '2 seconds' where id=${sessionId}`;
    else
      await observer`update sessions set operator_mfa_at=clock_timestamp()-interval '15 minutes'+interval '2 seconds' where id=${sessionId}`;
    await expect(
      duringLock(
        (tx) => lockSendingPolicy(tx, orgId),
        () =>
          updateSendingPolicy(operator, actor, orgId, {
            expected_revision: 0,
            state: 'approved',
            reason: 'Approved controlled pilot sending',
          }),
        () => expires(window),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await observer`select state,revision from sending_policies where org_id=${orgId}`)[0],
    ).toEqual({ state: 'pending_review', revision: 0 });
    expect(await observer`select id from audit_logs where org_id=${orgId}`).toHaveLength(0);
  },
);

it('starts the full MFA proof window after a lock-stalled successful step-up', async () => {
  let releasedAt: Date | undefined;
  await duringLock(
    async (tx) => tx`select id from sessions where id=${sessionId} for update`,
    () => grantOperatorMfa(operator, identity, 'one-use-recovery', encryptionKey),
    async () => {
      releasedAt = (await observer`select clock_timestamp() as at`)[0]?.at;
    },
  );
  const [session] = await observer`select operator_mfa_at from sessions where id=${sessionId}`;
  expect(session?.operator_mfa_at.getTime()).toBeGreaterThanOrEqual(releasedAt!.getTime());
});
