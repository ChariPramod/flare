import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { decrypt } from '../../packages/shared/dist/index.js';
import { sql } from './common.mjs';

// Called only by the host's real Chromium SDK test. Print no keys, tokens or profiles.
const [phase, orgId, environmentId, sessionId, ...bindingHashes] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let redis;
try {
  assert.ok(['timezone', 'cleanup'].includes(phase), 'Known Inbox SDK fixture operation');
  assert.ok(uuid.test(orgId ?? '') && uuid.test(environmentId ?? ''), 'Valid fixture tenant');
  const [environment] = await sql`
    select e.novu_key_cipher from environments e
    where e.id=${environmentId} and e.org_id=${orgId} and e.name='Development'
      and exists(select 1 from memberships m join users u on u.id=m.user_id
        where m.org_id=e.org_id and u.email=${process.env.SEED_OWNER_EMAIL})`;
  assert.ok(environment?.novu_key_cipher, 'Disposable owner environment exists');
  if (phase === 'timezone') {
    const key = decrypt(
      environment.novu_key_cipher,
      process.env.FLARE_ENCRYPTION_KEY,
      `${orgId}/${environmentId}`,
    );
    const response = await fetch(
      `${process.env.NOVU_API_URL}/v2/subscribers/acceptance-inbox-reader`,
      {
        headers: { Authorization: `ApiKey ${key}` },
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(15000),
      },
    );
    assert.equal(response.status, 200, 'Read disposable native subscriber metadata');
    const payload = await response.json();
    const profile = payload.data ?? payload;
    assert.equal(profile.subscriberId, 'acceptance-inbox-reader');
    assert.ok(profile.timezone == null || typeof profile.timezone === 'string');
    console.log(JSON.stringify({ timezone: profile.timezone ?? null }));
  } else {
    assert.ok(uuid.test(sessionId ?? ''), 'Valid owned SDK session');
    assert.ok(
      bindingHashes.length <= 10 && bindingHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)),
      'Bounded owned native token hashes',
    );
    const rows = await sql`update sessions set revoked_at=coalesce(revoked_at,now())
      where id=${sessionId} and user_id in
        (select id from users where email=${process.env.SEED_OWNER_EMAIL}) returning id`;
    assert.equal(rows.length, 1, 'Only the fixture owner session is revoked');
    const { Redis } = createRequire(new URL('../../apps/api/package.json', import.meta.url))(
      'ioredis',
    );
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });
    redis.on('error', () => undefined);
    await redis.connect();
    if (bindingHashes.length)
      await redis.del(...bindingHashes.map((hash) => `dashboard-inbox:v1:${sessionId}:${hash}`));
    console.log('Owned browser SDK session and native bindings cleaned up.');
  }
} catch {
  throw new Error('Disposable Inbox SDK fixture operation failed');
} finally {
  redis?.disconnect();
  await sql.end({ timeout: 5 });
}
