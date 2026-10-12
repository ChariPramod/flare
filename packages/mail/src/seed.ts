import { connectDatabase, toJson } from '@flare/db';
import { infrastructureConfig, subscriberSchema, workflowSchema, decrypt } from '@flare/shared';
import { domainRecords, domainSchema, generateDomain } from './domains.js';
const config = infrastructureConfig.parse(process.env);
const { client: sql } = connectDatabase(config.DATABASE_URL);
try {
  const [environment] =
    await sql`select e.* from environments e join organizations o on o.id=e.org_id where o.slug='pareto-labs' and e.name='Development'`;
  if (!environment) throw new Error('Run the identity seed first');
  const org = String(environment.org_id),
    env = String(environment.id);
  const settings = domainSchema.parse({
    name: process.env.SEED_DOMAIN ?? 'notifications.example.com',
  });
  const keys = generateDomain(settings.name, `${org}/${env}`, config.FLARE_ENCRYPTION_KEY);
  const records = domainRecords({
    ...settings,
    dkim_selector: keys.selector,
    dkim_public: keys.publicKey,
  });
  await sql`insert into domains(org_id,environment_id,name,dkim_selector,dkim_public,dkim_private_cipher,records) values(${org},${env},${settings.name},${keys.selector},${keys.publicKey},${keys.cipher},${sql.json(toJson(records))}) on conflict(org_id,environment_id,name) do nothing`;
  const profile = subscriberSchema.parse({
    subscriberId: 'demo-subscriber',
    firstName: 'Alex',
    lastName: 'Morgan',
    email: process.env.SEED_SUBSCRIBER_EMAIL ?? 'demo@example.com',
  });
  await sql`insert into subscribers(org_id,environment_id,subscriber_id,profile) values(${org},${env},${profile.subscriberId},${sql.json(toJson(profile))}) on conflict(org_id,environment_id,subscriber_id) do nothing`;
  if (environment.novu_key_cipher) {
    const definition = workflowSchema.parse({
      workflowId: 'welcome',
      name: 'Welcome',
      description: 'A first notification for a new subscriber.',
      steps: [
        {
          stepId: 'inbox',
          name: 'Welcome to Pareto',
          type: 'in_app',
          controlValues: { body: 'Welcome, {{subscriber.firstName}}!' },
        },
      ],
    });
    const headers = {
      Authorization: `ApiKey ${decrypt(String(environment.novu_key_cipher), config.FLARE_ENCRYPTION_KEY, `${org}/${env}`)}`,
      'Content-Type': 'application/json',
    };
    const url = `${process.env.NOVU_API_URL ?? 'http://novu-api:3000'}/v2/workflows`;
    const existing = await fetch(`${url}/welcome`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (existing.status === 404) {
      const result = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workflowId: definition.workflowId,
          name: definition.name,
          description: definition.description,
          steps: definition.steps,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!result.ok) throw new Error(`Novu demo workflow creation failed (${result.status})`);
      await sql`insert into workflows(org_id,environment_id,identifier,definition) values(${org},${env},'welcome',${sql.json(toJson(definition))}) on conflict do nothing`;
    } else if (!existing.ok)
      throw new Error(`Novu demo workflow lookup failed (${existing.status})`);
  } else
    console.log(
      'Novu demo workflow pending: configure the Development Novu API key and run seed again.',
    );
  console.log(
    'Demo subscriber and sender domain seeded. Publish and verify the domain DNS records before sending.',
  );
} finally {
  await sql.end();
}
