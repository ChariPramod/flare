import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '@flare/db';
import { generateDomain, deliverEmail } from '@flare/mail';
import type { PipelineOptions, TransportAdapter } from '@flare/mail';
import { configureMarketingFixture } from '../../../tests/unit/helpers/sending-policy.js';
import {
  campaignDraftSchema,
  createCampaign,
  previewCampaignAudience,
  scheduleBroadcast,
  updateCampaign,
  campaignPreflight,
  sendCampaignTest,
} from '@flare/platform';
import type { Principal } from '@flare/shared';
import { integrationTargets } from './targets.mjs';

const { databaseUrl } = integrationTargets();
const first = connectDatabase(databaseUrl, { max: 1 }).client;
const second = connectDatabase(databaseUrl, { max: 1 }).client;
const blocker = connectDatabase(databaseUrl, { max: 1 }).client;
const observer = connectDatabase(databaseUrl, { max: 1 }).client;
const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID();
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'session',
  role: 'owner',
  production: false,
};
const foreign = { ...principal, orgId: otherOrg, environmentId: otherEnv };
const encryptionKey = randomBytes(32).toString('base64');
const objects = new Map<string, Buffer>();
const testTransport: TransportAdapter = {
  name: 'test',
  sandbox: true,
  supportsRequiredTls: async () => true,
  send: async () => {
    throw new Error('An opted-out test must not dispatch');
  },
};
const testOptions: PipelineOptions = {
  sql: first,
  encryptionKey,
  trackingKey: encryptionKey,
  transports: [testTransport],
  store: {
    put: async (k, b) => {
      objects.set(k, b);
    },
    get: async (k) => objects.get(k)!,
    remove: async (k) => {
      objects.delete(k);
    },
  },
};
const content = {
  subject: 'Campaign update',
  html: '<p>Latest news.</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Unsubscribe</a>',
  variables: {},
};
const draft = (overrides: Record<string, unknown> = {}) =>
  campaignDraftSchema.parse({
    name: 'Imported contacts campaign',
    sender: 'news@example.com',
    content,
    ...overrides,
  });

function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}
async function waiting(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [state] =
      await observer`select wait_event_type='Lock' as waiting from pg_stat_activity where pid=${pid}`;
    if (state?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Competing campaign transaction did not reach its database lock');
}
async function simultaneousCreates(key: string, names: [string, string]) {
  const [one] = await first`select pg_backend_pid() as pid`;
  const [two] = await second`select pg_backend_pid() as pid`;
  const locked = gate(),
    release = gate();
  const lock = blocker.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${org}/${env}/campaign.create/${key}`},0))`;
    locked.release();
    await release.promise;
  });
  await Promise.race([locked.promise, lock]);
  const oneCreate = outcome(createCampaign(first, principal, draft({ name: names[0] }), key));
  const twoCreate = outcome(createCampaign(second, principal, draft({ name: names[1] }), key));
  try {
    // Both independent connections must reach the same lock before it is released.
    await waiting(Number(one!.pid));
    await waiting(Number(two!.pid));
  } finally {
    release.release();
    await lock;
    await Promise.all([oneCreate, twoCreate]);
  }
  return Promise.all([oneCreate, twoCreate]);
}

beforeAll(async () => {
  for (const sql of [first, second, blocker, observer]) sql.options.onnotice = () => undefined;
  await first`drop schema public cascade`;
  await first`create schema public`;
  await first`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await first.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await first`insert into organizations(id,name,slug) values(${org},'Campaign concurrency','campaign-concurrency'),(${otherOrg},'Other campaign tenant','other-campaign-tenant')`;
  await first`insert into environments(id,org_id,name) values(${env},${org},'Development'),(${otherEnv},${otherOrg},'Development')`;
  const keys = generateDomain('example.com', `${org}/${env}`, encryptionKey);
  await first`insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${org},${env},'example.com','verified',${keys.selector},${keys.publicKey},${keys.cipher})`;
});
beforeEach(async () => {
  await first`truncate contacts,contact_lists,email_templates,broadcasts,suppressions,event_outbox,audit_logs,messages,idempotency,mail_routes cascade`;
  await first`delete from sending_policies`;
  await first`insert into sending_policies(org_id) select id from organizations`;
  testOptions.transports = [testTransport];
  objects.clear();
});
afterAll(async () => {
  await Promise.all([first, second, blocker, observer].map((sql) => sql.end({ timeout: 5 })));
});

it('serializes concurrent identical creation keys without duplicate drafts, versions or events', async () => {
  const results = await simultaneousCreates('concurrent-create', ['Same draft', 'Same draft']);
  expect(results.map((result) => result.error)).toEqual([undefined, undefined]);
  expect(results[0]!.value!.id).toBe(results[1]!.value!.id);
  expect(await observer`select * from broadcasts`).toHaveLength(1);
  expect(await observer`select * from template_versions`).toHaveLength(1);
  expect(await observer`select * from event_outbox where type='broadcast.created'`).toHaveLength(1);
  expect(await observer`select * from audit_logs where action='broadcast.created'`).toHaveLength(1);
  expect(await observer`select * from messages`).toHaveLength(0);
});

it('commits one winner and rejects a concurrent conflicting payload for the same creation key', async () => {
  const results = await simultaneousCreates('conflicting-create', [
    'First request',
    'Changed request',
  ]);
  expect(results.filter((result) => result.value)).toHaveLength(1);
  expect(results.find((result) => result.error)?.error).toMatchObject({ status: 409 });
  expect(await observer`select * from broadcasts`).toHaveLength(1);
  expect(await observer`select * from template_versions`).toHaveLength(1);
  expect(await observer`select * from event_outbox where type='broadcast.created'`).toHaveLength(1);
});

it('keeps creation keys, list membership and campaign resources within the tenant boundary', async () => {
  const [own, other] = await Promise.all([
    createCampaign(first, principal, draft(), 'shared-client-key'),
    createCampaign(second, foreign, draft(), 'shared-client-key'),
  ]);
  expect(own.id).not.toBe(other.id);
  const [list] =
    await observer`insert into contact_lists(org_id,environment_id,name) values(${otherOrg},${otherEnv},'Foreign list') returning id`;
  await expect(
    createCampaign(first, principal, draft({ list_id: list!.id })),
  ).rejects.toMatchObject({ status: 422 });
  await expect(previewCampaignAudience(first, principal, String(other.id))).rejects.toMatchObject({
    status: 404,
  });
  await expect(updateCampaign(first, principal, String(other.id), draft())).rejects.toMatchObject({
    status: 404,
  });
  const [contact] =
    await observer`insert into contacts(org_id,environment_id,email) values(${org},${env},'own@example.net') returning id`;
  await expect(
    observer`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${org},${env},${list!.id},${contact!.id})`,
  ).rejects.toMatchObject({ code: '23503' });
  expect(await observer`select * from broadcasts`).toHaveLength(2);
});

it('freezes only the selected list when scheduled and keeps later opt-outs visible', async () => {
  const [list] =
    await observer`insert into contact_lists(org_id,environment_id,name) values(${org},${env},'Imported list') returning id`;
  const rows =
    await observer`insert into contacts(org_id,environment_id,email) values(${org},${env},'first@example.net'),(${org},${env},'outside@example.net') returning id,email`;
  const included = rows.find((row) => row.email === 'first@example.net')!;
  const outside = rows.find((row) => row.email === 'outside@example.net')!;
  await observer`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${org},${env},${list!.id},${included.id})`;
  const created = await createCampaign(first, principal, draft({ list_id: list!.id }));
  expect(await previewCampaignAudience(first, principal, String(created.id))).toMatchObject({
    total: 1,
    eligible: 1,
    snapshot: false,
  });
  await scheduleBroadcast(first, principal, String(created.id));
  await observer`delete from contact_list_members where contact_id=${included.id}`;
  await observer`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${org},${env},${list!.id},${outside.id})`;
  await observer`update contacts set unsubscribed=true where id=${included.id}`;
  expect(await previewCampaignAudience(first, principal, String(created.id))).toMatchObject({
    total: 1,
    eligible: 0,
    excluded: { unsubscribed: 1 },
    snapshot: true,
    sample: [],
  });
  expect(
    await observer`select contact_id from broadcast_recipients where broadcast_id=${created.id}`,
  ).toEqual([{ contact_id: included.id }]);
  await expect(updateCampaign(first, principal, String(created.id), draft())).rejects.toMatchObject(
    {
      status: 409,
    },
  );
});

it('rejects a draft edit that waits behind scheduling without changing its pinned version', async () => {
  await observer`insert into contacts(org_id,environment_id,email) values(${org},${env},'race@example.net')`;
  const created = await createCampaign(first, principal, draft());
  const [one] = await first`select pg_backend_pid() as pid`;
  const [two] = await second`select pg_backend_pid() as pid`;
  const locked = gate(),
    release = gate();
  const lock = blocker.begin(async (tx) => {
    await tx`select id from broadcasts where id=${created.id} for update`;
    locked.release();
    await release.promise;
  });
  await Promise.race([locked.promise, lock]);
  const scheduled = outcome(scheduleBroadcast(first, principal, String(created.id)));
  let edited: ReturnType<typeof outcome> | undefined;
  try {
    await waiting(Number(one!.pid));
    edited = outcome(
      updateCampaign(
        second,
        principal,
        String(created.id),
        draft({
          content: { ...content, subject: 'Must not replace scheduled content' },
        }),
      ),
    );
    await waiting(Number(two!.pid));
  } finally {
    release.release();
    await lock;
    await scheduled;
    await edited;
  }
  expect((await scheduled).value).toMatchObject({ status: 'scheduled' });
  expect((await edited)?.error).toMatchObject({ status: 409 });
  expect(await observer`select version,subject from template_versions`).toEqual([
    { version: 1, subject: content.subject },
  ]);
  expect(await observer`select * from broadcast_recipients`).toHaveLength(1);
});

it('rolls back scheduling an empty or fully suppressed list', async () => {
  const [list] =
    await observer`insert into contact_lists(org_id,environment_id,name) values(${org},${env},'Empty list') returning id`;
  const created = await createCampaign(first, principal, draft({ list_id: list!.id }));
  await expect(scheduleBroadcast(first, principal, String(created.id))).rejects.toMatchObject({
    status: 422,
  });
  const [contact] =
    await observer`insert into contacts(org_id,environment_id,email) values(${org},${env},'suppressed@example.net') returning id`;
  await observer`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${org},${env},${list!.id},${contact!.id})`;
  await observer`insert into suppressions(org_id,address,reason) values(${org},'suppressed@example.net','manual')`;
  await expect(scheduleBroadcast(first, principal, String(created.id))).rejects.toMatchObject({
    status: 422,
  });
  expect((await observer`select status from broadcasts where id=${created.id}`)[0]?.status).toBe(
    'draft',
  );
  expect(await observer`select * from broadcast_recipients`).toHaveLength(0);
  expect(await observer`select * from event_outbox where type='broadcast.scheduled'`).toHaveLength(
    0,
  );
});

async function simultaneousTests(sameKey: boolean) {
  const campaign = await createCampaign(first, principal, draft());
  const id = String(campaign.id);
  const preflight = await campaignPreflight(testOptions, principal, id);
  const input = {
    revision: preflight.revision,
    sandbox: preflight.sandbox,
    recipients: ['reviewer@example.net'],
  };
  const [one] = await first`select pg_backend_pid() as pid`;
  const [two] = await second`select pg_backend_pid() as pid`;
  const locked = gate(),
    release = gate();
  const lock = blocker.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${org}/sending-policy`},0))`;
    locked.release();
    await release.promise;
  });
  await Promise.race([locked.promise, lock]);
  const oneSend = outcome(sendCampaignTest(testOptions, principal, id, input, 'test-one'));
  const twoSend = outcome(
    sendCampaignTest(
      { ...testOptions, sql: second },
      principal,
      id,
      input,
      sameKey ? 'test-one' : 'test-two',
    ),
  );
  try {
    await waiting(Number(one!.pid));
    await waiting(Number(two!.pid));
  } finally {
    release.release();
    await lock;
    await Promise.all([oneSend, twoSend]);
  }
  return Promise.all([oneSend, twoSend]);
}
it('deduplicates actual concurrent campaign-test admissions across independent connections', async () => {
  const results = await simultaneousTests(true);
  expect(results.map((r) => r.error)).toEqual([undefined, undefined]);
  expect(results[0]!.value).toEqual(results[1]!.value);
  expect(await observer`select * from messages`).toHaveLength(1);
  expect(await observer`select * from broadcast_recipients`).toHaveLength(0);
  expect(
    await observer`select * from audit_logs where action='broadcast.test_accepted'`,
  ).toHaveLength(1);
});
it('serializes separate test intents against the shared real-mail quota', async () => {
  await configureMarketingFixture(testOptions, principal);
  const results = await simultaneousTests(false);
  expect(results.filter((r) => r.value)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error).toMatchObject({
    status: 429,
    code: 'recipient_quota_exhausted',
  });
  expect(await observer`select * from messages`).toHaveLength(1);
  expect(await observer`select * from sending_quota where state='reserved'`).toHaveLength(1);
});
it('rechecks a known test recipient opt-out at dispatch without attaching it to campaign execution', async () => {
  const [contact] =
    await first`insert into contacts(org_id,environment_id,email) values(${org},${env},'reviewer@example.net') returning id`;
  const campaign = await createCampaign(first, principal, draft());
  const id = String(campaign.id);
  const preflight = await campaignPreflight(testOptions, principal, id);
  const result = await sendCampaignTest(
    testOptions,
    principal,
    id,
    { revision: preflight.revision, sandbox: true, recipients: ['reviewer@example.net'] },
    'later-optout',
  );
  await second`update contacts set unsubscribed=true where id=${contact!.id}`;
  await deliverEmail(testOptions, result.data[0]!.id);
  expect(
    (await observer`select status,broadcast_id from messages where id=${result.data[0]!.id}`)[0],
  ).toMatchObject({ status: 'suppressed', broadcast_id: null });
  expect(await observer`select * from transport_attempts`).toHaveLength(0);
});
