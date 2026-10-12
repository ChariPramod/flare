import { encrypt, hashToken, hashPassword, infrastructureConfig } from '@flare/shared';
import { connectDatabase } from './index.js';
const config = infrastructureConfig.parse(process.env);
const { client: sql } = connectDatabase(config.DATABASE_URL);
if (!process.env.SEED_OWNER_PASSWORD || !process.env.SEED_OWNER_EMAIL)
  throw new Error('Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD');
try {
  const password = await hashPassword(process.env.SEED_OWNER_PASSWORD);
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(71940313)`;
    const [existing] = await tx`select id from organizations where slug = 'pareto-labs'`;
    if (existing) {
      console.log('Pareto Labs already exists. Seed is non-destructive.');
      return;
    }
    const [org] =
      await tx`insert into organizations (name, slug) values ('Pareto Labs', 'pareto-labs') returning id`;
    const [user] =
      await tx`insert into users (email, name, password_hash) values (${process.env.SEED_OWNER_EMAIL!.toLowerCase()}, 'Pareto owner', ${password}) on conflict (email) do update set email = excluded.email returning id`;
    await tx`insert into memberships (org_id, user_id, role) values (${org!.id}, ${user!.id}, 'owner')`;
    for (const name of ['Development', 'Production']) {
      const [environment] =
        await tx`insert into environments (org_id, name, novu_application_id) values (${org!.id}, ${name}, ${process.env.NOVU_APPLICATION_IDENTIFIER || null}) returning id`;
      const novuKey =
        process.env[
          name === 'Development' ? 'NOVU_DEVELOPMENT_API_KEY' : 'NOVU_PRODUCTION_API_KEY'
        ];
      if (novuKey)
        await tx`update environments set novu_key_cipher = ${encrypt(novuKey, config.FLARE_ENCRYPTION_KEY, `${org!.id}/${environment!.id}`)} where id = ${environment!.id}`;
      if (name === 'Development') {
        const token = process.env.SEED_API_KEY;
        if (!token?.startsWith('fl_') || token.length < 40)
          throw new Error('Set a randomly generated SEED_API_KEY');
        await tx`insert into api_keys (org_id, environment_id, name, token_hash, prefix, permission, created_by) values (${org!.id}, ${environment!.id}, 'Development seed key', ${hashToken(token)}, ${token.slice(0, 11)}, 'full_access', ${user!.id})`;
      }
    }
    console.log(
      'Seeded Pareto Labs, owner, Development/Production, and key metadata. Log in with .env credentials to create a key shown once.',
    );
  });
} finally {
  await sql.end();
}
