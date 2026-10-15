import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { sql } from './common.mjs';
import { connectDatabase, withTenant } from '../../packages/db/dist/index.js';
import {
  seedUpgradeFixtures,
  captureUpgradeRows,
  assertPreservedRows,
} from './upgrade-fixtures.mjs';

const mode = process.argv[2];
const database = process.argv[3];
assert.ok(['prepare', 'baseline', 'migrate', 'cleanup'].includes(mode));
assert.ok(['flare_upgrade_test', 'flare_upgrade_restored'].includes(database));
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${database}`;
let client;
let created = false;
try {
  if (mode === 'cleanup') {
    await sql`drop database if exists ${sql(database)}`;
  } else {
    if (mode === 'prepare') {
      await sql`create database ${sql(database)}`;
      created = true;
    }
    client = connectDatabase(url.href).client;
    if (mode === 'prepare') {
      await client`create table flare_migrations(name text primary key, hash text not null, applied_at timestamptz not null default now())`;
      for (const name of readdirSync('/acceptance/baseline')
        .filter((n) => n.endsWith('.sql'))
        .sort()) {
        const source = readFileSync(`/acceptance/baseline/${name}`, 'utf8');
        await client.unsafe(source);
        await client`insert into flare_migrations(name,hash) values(${name},${createHash('sha256').update(source).digest('hex')})`;
      }
      await seedUpgradeFixtures(client);
      writeFileSync(
        '/acceptance/upgrade-baseline.json',
        JSON.stringify(await captureUpgradeRows(client)),
        { mode: 0o600 },
      );
      console.log(
        'Populated 62aaa57 baseline: two organizations, four environments, versioned content and durable pending/terminal work.',
      );
    } else {
      const expected = JSON.parse(readFileSync('/acceptance/upgrade-baseline.json', 'utf8'));
      if (mode === 'migrate') {
        const ledgerBefore = await client`select name,hash from flare_migrations order by name`;
        process.env.DATABASE_URL = url.href;
        await import('../../packages/db/dist/migrate.js');
        const rows = await captureUpgradeRows(client);
        assertPreservedRows(expected, rows, true);
        const ledger = await client`select name,hash from flare_migrations order by name`;
        for (const row of ledgerBefore)
          assert.ok(
            ledger.some((r) => r.name === row.name && r.hash === row.hash),
            'Existing migration hash preserved',
          );
        const migrationFiles = readdirSync('/app/packages/db/migrations')
          .filter((n) => n.endsWith('.sql'))
          .sort();
        assert.deepEqual(
          ledger.map((r) => r.name),
          migrationFiles,
        );
        for (const row of ledger)
          assert.equal(
            row.hash,
            createHash('sha256')
              .update(readFileSync(`/app/packages/db/migrations/${row.name}`))
              .digest('hex'),
          );
        assert.equal(rows.organizations.length, 2);
        assert.equal(rows.environments.length, 4);
        for (const row of rows.workflows) {
          assert.deepEqual(row.source_definition, row.definition);
          assert.deepEqual(row.content_dependencies, {
            layouts: [],
            templates: [],
            translations: [],
          });
        }
        for (const row of rows.sending_policies)
          assert.deepEqual(
            [row.state, row.daily_limit, row.per_minute_limit, row.route_bindings],
            ['pending_review', 100, 10, {}],
          );
        assert.equal(rows.sending_policies.length, 2);
        assert.equal(rows.domain_transport_readiness.length, 0);
        assert.equal(rows.sending_quota.length, 0);
        for (const row of rows.messages.filter((r) => r.status === 'held'))
          assert.equal(row.hold_reason, 'classification_required');
        assert.equal(rows.messages.filter((r) => r.status === 'held').length, 8);
        for (const row of rows.domains) {
          assert.deepEqual(row.dmarc_evidence, {});
          assert.ok(new Date(row.next_check_at).getTime() <= Date.now());
        }
        for (const row of rows.transport_attempts) assert.equal(row.instance_id, row.provider);
        for (const row of rows.suppressions) assert.equal(row.protected, row.reason !== 'manual');
        for (const env of rows.environments) {
          const tenant = { orgId: env.org_id, environmentId: env.id };
          await withTenant(client, tenant, async (tx) => {
            for (const table of [
              'messages',
              'workflows',
              'template_versions',
              'workflow_runs',
              'idempotency',
              'webhook_deliveries',
              'automation_runs',
            ]) {
              const visible = await tx`select org_id,environment_id from ${tx(table)}`;
              assert.ok(visible.length > 0, `Populated RLS probe: ${table}`);
              assert.ok(
                visible.every((row) => row.org_id === env.org_id && row.environment_id === env.id),
                `Tenant isolation after upgrade: ${table}`,
              );
            }
          });
          const foreign = rows.domains.find((d) => d.environment_id !== env.id);
          await assert.rejects(
            client`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(gen_random_uuid(),${env.org_id},${env.id},${foreign.id},'{}','fixture@example.com','queued')`,
            (error) => error.code === '23503',
          );
          await assert.rejects(
            withTenant(client, tenant, (tx) => tx`update template_versions set subject='tampered'`),
            (error) => error.code === '42501',
          );
        }
        const fingerprintPath = `/acceptance/upgrade-${database}.json`;
        const serialized = JSON.stringify(rows);
        // A second process invocation exercises the real migrator's ledger no-op path.
        try {
          const prior = JSON.parse(readFileSync(fingerprintPath, 'utf8'));
          assertPreservedRows(prior, rows, false);
          console.log('Repeated migration preserved all rows and migration timestamps.');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          writeFileSync(fingerprintPath, serialized, { mode: 0o600 });
        }
        console.log(
          'Populated upgrade verified: content versions, durable work/history, safe holds, tenant isolation and composite keys.',
        );
      } else {
        assertPreservedRows(expected, await captureUpgradeRows(client), false);
        assert.equal(
          (await client`select to_regclass('public.sending_policies') as name`)[0].name,
          null,
        );
        console.log(
          'Pre-upgrade pg_dump restored exactly into isolated baseline database; no delivery processes started.',
        );
      }
    }
  }
} catch (error) {
  if (created) {
    if (client) await client.end();
    client = undefined;
    await sql`drop database ${sql(database)}`;
  }
  throw error;
} finally {
  if (client) await client.end();
  await sql.end();
}
