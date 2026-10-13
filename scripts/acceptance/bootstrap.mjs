import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { sql, json, session, until } from './common.mjs';
import { encrypt } from '../../packages/shared/dist/index.js';
try {
  const registration = await json('http://novu-api:3000/v1/auth/register', {
    method: 'POST',
    body: {
      email: 'acceptance@example.test',
      password: `Aa1!${randomBytes(20).toString('hex')}`,
      firstName: 'Flare',
      lastName: 'Acceptance',
      organizationName: 'Flare acceptance',
    },
  });
  assert.ok(registration.token, 'Novu registration returns a session token');
  const environments = await json(`${process.env.NOVU_API_URL}/v1/environments`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  for (const name of ['Development', 'Production']) {
    const remote = environments.find((e) => e.name.toLowerCase() === name.toLowerCase());
    assert.ok(remote?.apiKeys?.[0]?.key, `Pinned Novu exposes ${name} API key to its owner`);
    const [local] =
      await sql`select e.* from environments e join organizations o on o.id=e.org_id where o.slug='pareto-labs' and e.name=${name}`;
    await sql`update environments set novu_key_cipher=${encrypt(remote.apiKeys[0].key, process.env.FLARE_ENCRYPTION_KEY, `${local.org_id}/${local.id}`)},novu_application_id=${remote.identifier} where id=${local.id}`;
  }
  const { api } = await session();
  const domain = await api('/domains', 'POST', { name: 'acceptance.test', receiving: true });
  const zone = [
    '$ORIGIN acceptance.test.',
    '@ 2 IN SOA ns.acceptance.test. hostmaster.acceptance.test. (2 2 2 60 2)',
    '@ 2 IN NS ns.acceptance.test.',
    'ns 2 IN A 172.29.250.53',
  ];
  for (const record of domain.records) {
    const value =
      record.type === 'TXT'
        ? (record.value.match(/.{1,200}/g) ?? []).map((chunk) => JSON.stringify(chunk)).join(' ')
        : `${record.type === 'MX' ? '10 ' : ''}${record.value}.`;
    zone.push(`${record.name}. 2 IN ${record.type} ${value}`);
  }
  writeFileSync('/acceptance/dns/acceptance.test', zone.join('\n') + '\n');
  await api(`/domains/${domain.id}/verify`, 'POST');
  await until(
    async () => (await api(`/domains/${domain.id}`)).status === 'verified',
    'local authoritative DNS verification',
  );
  await api('/integrations', 'POST', {
    identifier: 'acceptance-smtp',
    name: 'Acceptance relay',
    provider: 'smtp',
    channel: 'email',
    primary: true,
    credentials: { from: 'sender@acceptance.test' },
  });
  await api('/integrations', 'POST', {
    identifier: 'acceptance-inbox',
    name: 'Acceptance inbox',
    provider: 'novu',
    channel: 'in_app',
    primary: true,
  });
  console.log(
    'Pinned Novu environments and integrations configured; local DNS verification passed.',
  );
} finally {
  await sql.end();
}
