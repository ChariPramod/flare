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
  process.env.DATABASE_URL = url.href;
  await import('../../packages/db/dist/migrate.js');
  const [row] =
    await old`select definition,source_definition from workflows where identifier='preserved'`;
  assert.deepEqual(row.definition, definition);
  assert.deepEqual(row.source_definition, definition);
  assert.equal((await old`select count(*)::int as count from organizations`)[0].count, 1);
  console.log('Upgrade from 62aaa57 preserved existing workflow content.');
} finally {
  await old.end();
  await sql.unsafe('drop database flare_upgrade_test');
  await sql.end();
}
