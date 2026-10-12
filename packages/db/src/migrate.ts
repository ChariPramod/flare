import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { connectDatabase } from './index.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const { client } = connectDatabase(process.env.DATABASE_URL);
try {
  await client.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(71940312)`;
    await tx`create table if not exists flare_migrations (name text primary key, hash text not null, applied_at timestamptz not null default now())`;
    const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
      const sql = await readFile(`${directory}/${name}`, 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const [previous] = await tx`select hash from flare_migrations where name = ${name}`;
      if (previous && previous.hash !== hash) throw new Error(`Previously applied migration changed: ${name}`);
      if (previous) continue;
      await tx.unsafe(sql);
      await tx`insert into flare_migrations (name, hash) values (${name}, ${hash})`;
      console.log(`Applied ${name}`);
    }
  });
} finally { await client.end(); }
