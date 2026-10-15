import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { expect, it } from 'vitest';
import { connectDatabase } from '../../packages/db/src/index.js';
import {
  seedUpgradeFixtures,
  captureUpgradeRows,
  assertPreservedRows,
} from '../../scripts/acceptance/upgrade-fixtures.mjs';

it('preserves a populated four-environment baseline through current migrations and detects lost durable work', async () => {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  try {
    await db.exec('SET client_min_messages = error');
    const files = readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql') && !n.startsWith('0000'))
      .sort();
    for (const file of files.filter((n) => n < '0008'))
      await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
    await seedUpgradeFixtures(sql);
    const baseline = await captureUpgradeRows(sql);
    expect(baseline.organizations).toHaveLength(2);
    expect(baseline.environments).toHaveLength(4);
    expect(baseline.template_versions).toHaveLength(8);
    expect(baseline.messages).toHaveLength(24);
    expect(baseline.message_recipients.filter((row) => row.status === 'queued')).toHaveLength(12);
    expect(
      baseline.message_recipients.every((row) =>
        ['queued', 'delivered', 'failed', 'canceled'].includes(String(row.status)),
      ),
    ).toBe(true);
    expect(baseline.workflow_runs).toHaveLength(16);
    expect(baseline.automation_runs).toHaveLength(4);
    for (const file of files.filter((n) => n >= '0008'))
      await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
    const upgraded = await captureUpgradeRows(sql);
    expect(() => assertPreservedRows(baseline, upgraded, true)).not.toThrow();
    const lost = structuredClone(upgraded);
    lost.webhook_deliveries.pop();
    expect(() => assertPreservedRows(baseline, lost, true)).toThrow(
      'Preserved row count: webhook_deliveries',
    );
    const changed = structuredClone(upgraded);
    changed.template_versions[0].html = '<p>changed pinned version</p>';
    expect(() => assertPreservedRows(baseline, changed, true)).toThrow(
      'Preserved original values: template_versions',
    );
    const changedStatus = structuredClone(upgraded);
    changedStatus.messages.find((row) => row.status === 'delivered')!.status = 'queued';
    expect(() => assertPreservedRows(baseline, changedStatus, true)).toThrow(
      'Preserved original values: messages',
    );
    expect(() => assertPreservedRows(upgraded, structuredClone(upgraded), false)).not.toThrow();
  } finally {
    await sql.end();
    await server.stop();
    await db.close();
  }
}, 30000);
