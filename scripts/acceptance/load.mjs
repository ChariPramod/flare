import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { sql, pause, until } from './common.mjs';
const headers = {
  Authorization: `Bearer ${process.env.SEED_API_KEY}`,
  'Content-Type': 'application/json',
};
const metricsHeaders = { Authorization: `Bearer ${process.env.METRICS_TOKEN}` };
async function memory(host) {
  const response = await fetch(`http://${host}/internal/metrics`, { headers: metricsHeaders });
  assert.ok(response.ok);
  const metrics = await response.text();
  const value = Number(
    metrics.match(/^flare_process_resident_memory_bytes(?:\{[^}]*\})? (\d+)/m)?.[1],
  );
  assert.ok(value > 0, 'Resident memory metric is exported');
  assert.ok(
    value < Number(process.env.ACCEPTANCE_MEMORY_MAX_BYTES ?? 805306368),
    'Process exceeds configured memory ceiling',
  );
  return value;
}
try {
  if (process.argv[2] === 'accept') {
    await pause(1200);
    const accepted = new Map();
    let throttled = 0,
      maxMemory = await memory('localhost:4000');
    const send = async (logical) => {
      const response = await fetch('http://localhost:4000/v1/emails', {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': `acceptance-load-${logical}` },
        body: JSON.stringify({
          from: 'sender@acceptance.test',
          to: 'load@example.net',
          subject: `Acceptance load ${logical}`,
          text: 'Durable load submission',
        }),
      });
      assert.ok(response.headers.has('ratelimit-limit'));
      if (response.status === 429) {
        throttled++;
        assert.ok(Number(response.headers.get('retry-after')) >= 1);
        return false;
      }
      assert.ok(response.ok, `Unexpected load response: ${response.status}`);
      const value = await response.json();
      if (accepted.has(logical))
        assert.equal(
          accepted.get(logical),
          value.id,
          'Idempotency returned another logical submission',
        );
      accepted.set(logical, value.id);
      return true;
    };
    // Burst contention exercises the same logical submissions from concurrent clients.
    const start = Date.now();
    const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => send(`burst-${i % 4}`)));
    const elapsed = (Date.now() - start) / 1000;
    assert.ok(burst.filter(Boolean).length <= Math.ceil(10 + 10 * elapsed));
    assert.ok(throttled > 0, 'Burst must be throttled');
    await pause(1200);
    for (let i = 0; i < 100; i++) {
      const started = Date.now();
      await send(`paced-${Math.floor(i / 2)}`);
      if (i % 10 === 0) maxMemory = Math.max(maxMemory, await memory('localhost:4000'));
      await pause(Math.max(0, 100 - (Date.now() - started)));
    }
    assert.ok(accepted.size >= 40, 'Configured 10/s rate made insufficient progress');
    writeFileSync(
      '/acceptance/load.json',
      JSON.stringify({ ids: [...accepted.values()], throttled, maxMemory }),
      { mode: 0o600 },
    );
    console.log(
      `Load accepted ${accepted.size} logical sends with ${throttled} expected throttles; peak sampled API RSS ${maxMemory} bytes.`,
    );
  } else if (process.argv[2] === 'verify') {
    const { ids } = JSON.parse(readFileSync('/acceptance/load.json', 'utf8'));
    await until(
      async () => {
        await memory('flare-worker:4001');
        return (
          (
            await sql`select count(*)::int as n from messages where id in ${sql(ids)} and status='sent'`
          )[0].n === ids.length
        );
      },
      'all accepted sends recovered after worker stop and Redis loss',
      180000,
    );
    const attempts =
      await sql`select message_id,count(*)::int as n from transport_attempts where message_id in ${sql(ids)} group by message_id`;
    assert.equal(attempts.length, ids.length);
    assert.ok(
      attempts.every((r) => r.n === 1),
      'Duplicate provider submission after queue loss',
    );
    const groups =
      await sql`select request->>'subject' as subject,count(*)::int as n from messages where request->>'subject' like 'Acceptance load %' group by request->>'subject'`;
    assert.equal(groups.length, ids.length);
    assert.ok(groups.every((r) => r.n === 1));
    console.log(
      'No accepted sends lost and no duplicate logical/provider submissions after queue loss.',
    );
  } else throw new Error('Choose accept or verify');
} finally {
  await sql.end();
}
