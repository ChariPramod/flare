import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sql } from './common.mjs';
import { connectDatabase } from '../../packages/db/dist/index.js';
await sql.unsafe('create database flare_upgrade_test');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/flare_upgrade_test';
const { client: old } = connectDatabase(url.href);
try {
  await old`create table flare_migrations(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
  for (const name of readdirSync('/acceptance/baseline').sort()) {
    const source = readFileSync(`/acceptance/baseline/${name}`, 'utf8');
    await old.unsafe(source);
    await old`insert into flare_migrations(name,hash) values(${name},${createHash('sha256').update(source).digest('hex')})`;
  }
  const org = randomUUID(),
    env = randomUUID();
  await old`insert into organizations(id,name,slug) values(${org},'Upgrade preservation','upgrade')`;
  await old`insert into environments(id,org_id,name) values(${env},${org},'Development')`;
  const definition = { workflowId: 'preserved', name: 'Preserved', steps: [] };
  await old`insert into workflows(org_id,environment_id,identifier,definition) values(${org},${env},'preserved',${old.json(definition)})`;
  const domain = randomUUID(),
    queued = randomUUID(),
    delivered = randomUUID();
  await old`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${domain},${org},${env},'upgrade.example.com','verified','old-selector','old-public','old-encrypted-key')`;
  await old`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(${queued},${org},${env},${domain},'{}','sender@upgrade.example.com','queued'),(${delivered},${org},${env},${domain},'{}','sender@upgrade.example.com','delivered')`;
  await old`update messages set delivery_started_at=now(),delivery_finished_at=now() where id=${delivered}`;
  process.env.DATABASE_URL = url.href;
  await import('../../packages/db/dist/migrate.js');
  const [row] =
    await old`select definition,source_definition from workflows where identifier='preserved'`;
  assert.deepEqual(row.definition, definition);
  assert.deepEqual(row.source_definition, definition);
  assert.equal((await old`select count(*)::int as count from organizations`)[0].count, 1);
  assert.deepEqual(
    (
      await old`select state,daily_limit,per_minute_limit from sending_policies where org_id=${org}`
    )[0],
    { state: 'pending_review', daily_limit: 100, per_minute_limit: 10 },
  );
  assert.deepEqual((await old`select status,hold_reason from messages where id=${queued}`)[0], {
    status: 'held',
    hold_reason: 'classification_required',
  });
  assert.equal(
    (await old`select status from messages where id=${delivered}`)[0].status,
    'delivered',
  );
  assert.deepEqual(
    (
      await old`select status,dkim_private_cipher,dmarc_evidence from domains where id=${domain}`
    )[0],
    { status: 'verified', dkim_private_cipher: 'old-encrypted-key', dmarc_evidence: {} },
  );
  assert.equal(
    (await old`select count(*)::int as count from domain_transport_readiness`)[0].count,
    0,
  );
  console.log(
    'Upgrade from 62aaa57 preserved workflow/sender history and held unreviewed pending mail.',
  );
} finally {
  await old.end();
  await sql.unsafe('drop database flare_upgrade_test');
  await sql.end();
}
