import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sql } from './common.mjs';

try {
  const fixture = JSON.parse(readFileSync('/acceptance/operator.json', 'utf8'));
  assert.equal(process.env.FLARE_OPERATOR_USER_IDS, fixture.id);
  assert.ok(['expire', 'revoke'].includes(process.argv[2]), 'Known operator interruption phase');
  assert.equal(
    Number((await sql`select count(*) as n from memberships where user_id=${fixture.id}`)[0].n),
    0,
  );
  const rows =
    process.argv[2] === 'expire'
      ? await sql`update sessions set operator_mfa_at=now()-interval '16 minutes' where user_id=${fixture.id} and revoked_at is null returning id`
      : await sql`update sessions set revoked_at=now(),operator_mfa_at=null where user_id=${fixture.id} and revoked_at is null returning id`;
  assert.ok(rows.length > 0, 'An active fixture operator session was interrupted');
  console.log(`Disposable operator session ${process.argv[2]} phase completed.`);
} finally {
  await sql.end();
}
