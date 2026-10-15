import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../../packages/db/src/index.js';
import type { Sql } from '../../../packages/db/src/index.js';
import { snsCanonical } from '../../../packages/mail/src/events.js';

const state = vi.hoisted(() => ({ sql: undefined as unknown as Sql }));
vi.mock('./context.js', () => ({
  get sql() {
    return state.sql;
  },
  config: {},
  parse: (schema: z.ZodTypeAny, value: unknown) => schema.parse(value),
}));
vi.mock('./auth.js', () => ({ Public: () => () => undefined }));
vi.mock('@flare/mail', async () => import('../../../packages/mail/src/index.js'));
import { MailEventController } from './mail-events.js';

const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { format: 'pem', type: 'spki' },
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
});
const orgId = randomUUID(),
  environmentId = randomUUID(),
  domainId = randomUUID();
const recipient = 'reader@example.test';
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
const controller = new MailEventController();
const postal = {
  id: 'postal-a',
  kind: 'postal',
  server_id: 'server-a',
  pool_id: 'pool-a',
  credential_version: 'v1',
  url: 'https://postal.example.test',
  api_key_env: 'POSTAL_FIXTURE',
  webhook_public_key_env: 'POSTAL_FIXTURE_PUBLIC',
};
const ses = {
  id: 'ses-a',
  kind: 'ses',
  server_id: 'account-a',
  pool_id: 'ses-pool-a',
  credential_version: 'v1',
  region: 'us-east-1',
  configuration_set: 'fixture-set',
  access_key_id_env: 'SES_FIXTURE_ACCESS',
  secret_access_key_env: 'SES_FIXTURE_SECRET',
  sns_topic_arn: 'arn:aws:sns:us-east-1:123456789012:ses-a',
};
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
  state.sql = sql;
  await sql`insert into organizations(id,name,slug) values(${orgId},'Callback test','callback-test')`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Development')`;
  await sql`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${domainId},${orgId},${environmentId},'example.test','verified','fixture','fixture','fixture')`;
}, 30000);
beforeEach(async () => {
  await sql`truncate messages,event_outbox,suppressions cascade`;
  vi.stubEnv(
    'MAIL_TRANSPORTS',
    JSON.stringify([
      postal,
      { ...postal, id: 'postal-b', server_id: 'server-b' },
      ses,
      {
        ...ses,
        id: 'ses-b',
        server_id: 'account-b',
        sns_topic_arn: 'arn:aws:sns:us-east-1:123456789012:ses-b',
      },
    ]),
  );
  vi.stubEnv('POSTAL_FIXTURE_PUBLIC', pair.publicKey);
  vi.stubEnv('POSTAL_WEBHOOK_PUBLIC_KEY', '');
  vi.stubEnv('POSTAL_WEBHOOK_PUBLIC_KEY_FILE', '');
  vi.stubEnv('POSTAL_WEBHOOK_KEY_ID', '');
  vi.stubEnv('SES_SNS_TOPIC_ARNS', '');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(pair.publicKey)),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function message(provider: string, instance: string, providerId = 'same-provider-id') {
  const id = randomUUID();
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(${id},${orgId},${environmentId},${domainId},'{}','sender@example.test','sent')`;
  await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${orgId},${environmentId},${id},${recipient},'to','sent')`;
  await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,instance_id,ordinal,status,recipients,provider_ids) values(${orgId},${environmentId},${id},${provider},${instance},1,'accepted',${sql.json([recipient])},${sql.json({ [recipient]: providerId })})`;
  return id;
}
function postalRequest(body: unknown) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = sign('RSA-SHA256', rawBody, pair.privateKey).toString('base64');
  return {
    rawBody,
    get: (name: string) => (name === 'x-postal-signature-256' ? signature : undefined),
  } as RawBodyRequest<Request>;
}
function snsEvent(topic = ses.sns_topic_arn, messageId = 'sns-callback-id') {
  const event = {
    Type: 'Notification' as const,
    Message: JSON.stringify({
      eventType: 'Delivery',
      mail: { messageId: 'same-provider-id', destination: [recipient] },
      delivery: { recipients: [recipient] },
    }),
    MessageId: messageId,
    TopicArn: topic,
    Timestamp: new Date().toISOString(),
    SignatureVersion: '2' as const,
    Signature: '',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-fixture.pem',
  };
  return {
    ...event,
    Signature: sign('RSA-SHA256', Buffer.from(snsCanonical(event)), pair.privateKey).toString(
      'base64',
    ),
  };
}
it('correlates a signed Postal token only inside its named instance and namespaces duplicate event IDs', async () => {
  const first = await message('postal', 'postal-a'),
    second = await message('postal', 'postal-b');
  const body = {
    uuid: 'same-callback-id',
    event: 'MessageSent',
    payload: { message: { token: 'same-provider-id', to: recipient } },
  };
  await controller.postal(postalRequest(body), body, 'postal-b');
  expect((await sql`select status from messages where id=${first}`)[0]?.status).toBe('sent');
  expect((await sql`select status from messages where id=${second}`)[0]?.status).toBe('delivered');
  await controller.postal(postalRequest(body), body, 'postal-a');
  await controller.postal(postalRequest(body), body, 'postal-a');
  expect(
    (await sql`select source from delivery_events order by source`).map((row) => row.source),
  ).toEqual(['postal:postal-a', 'postal:postal-b']);
  expect(await sql`select * from event_outbox where type='email.delivered'`).toHaveLength(2);
});
it('rejects unconfigured legacy Postal callbacks and tampering, and never falls back to RFC-ID for named instances', async () => {
  const id = await message('postal', 'postal-a');
  const body = {
    uuid: 'callback',
    event: 'MessageSent',
    payload: { message: { message_id: `<${id}@example.test>`, to: 'outsider@example.test' } },
  };
  await expect(controller.postal(postalRequest(body), body)).rejects.toMatchObject({ status: 503 });
  await expect(controller.postal(postalRequest(body), body, 'postal-a')).rejects.toMatchObject({
    status: 503,
  });
  const sameRecipient = {
    ...body,
    payload: { message: { ...body.payload.message, to: recipient } },
  };
  await expect(
    controller.postal(postalRequest(sameRecipient), sameRecipient, 'postal-a'),
  ).rejects.toMatchObject({ status: 503 });
  const wrongToken = {
    ...sameRecipient,
    payload: { message: { ...sameRecipient.payload.message, token: 'other-instance-token' } },
  };
  await expect(
    controller.postal(postalRequest(wrongToken), wrongToken, 'postal-a'),
  ).rejects.toMatchObject({ status: 503 });
  const request = postalRequest(body);
  request.rawBody = Buffer.from('{}');
  await expect(controller.postal(request, body, 'postal-a')).rejects.toMatchObject({ status: 401 });
  expect(await sql`select * from delivery_events`).toHaveLength(0);
});
it('binds signed SNS topic and provider message ID to one instance', async () => {
  const first = await message('ses', 'ses-a'),
    second = await message('ses', 'ses-b');
  const event = snsEvent();
  await expect(controller.sns(event, 'ses-b')).rejects.toMatchObject({ status: 401 });
  await expect(controller.sns(event)).rejects.toMatchObject({ status: 401 });
  await controller.sns(event, 'ses-a');
  expect((await sql`select status from messages where id=${first}`)[0]?.status).toBe('delivered');
  expect((await sql`select status from messages where id=${second}`)[0]?.status).toBe('sent');
  await controller.sns(snsEvent('arn:aws:sns:us-east-1:123456789012:ses-b'), 'ses-b');
  expect(
    (await sql`select source from delivery_events order by source`).map((row) => row.source),
  ).toEqual(['sns:ses-a', 'sns:ses-b']);
});
it('returns retryable 503 until named acceptance IDs persist, then records each callback once', async () => {
  for (const provider of ['postal', 'ses']) {
    const id = await message(provider, `${provider}-a`);
    await sql`update transport_attempts set status='started',provider_ids='{}' where message_id=${id}`;
    const body = {
      uuid: 'early-callback',
      event: 'MessageSent',
      payload: { message: { token: 'same-provider-id', to: recipient } },
    };
    const event = snsEvent();
    const callback = () =>
      provider === 'postal'
        ? controller.postal(postalRequest(body), body, 'postal-a')
        : controller.sns(event, 'ses-a');
    await expect(callback()).rejects.toMatchObject({ status: 503 });
    expect((await sql`select status from messages where id=${id}`)[0]?.status).toBe('sent');
    await sql`update transport_attempts set status='accepted',provider_ids=${sql.json({ [recipient]: 'same-provider-id' })} where message_id=${id}`;
    await callback();
    await callback();
    expect(await sql`select * from delivery_events where message_id=${id}`).toHaveLength(1);
    expect((await sql`select status from messages where id=${id}`)[0]?.status).toBe('delivered');
  }
});
it('keeps authenticated legacy callbacks working after named transport configuration without matching named attempts', async () => {
  vi.stubEnv('POSTAL_WEBHOOK_PUBLIC_KEY', pair.publicKey);
  vi.stubEnv('SES_SNS_TOPIC_ARNS', ses.sns_topic_arn);
  const namedPostal = await message('postal', 'postal-a'),
    namedSes = await message('ses', 'ses-a');
  const legacyPostal = await message('postal', 'postal'),
    legacySes = await message('ses', 'ses');
  const body = {
    uuid: 'legacy-callback',
    event: 'MessageSent',
    payload: { message: { token: 'same-provider-id', to: recipient } },
  };
  await controller.postal(postalRequest(body), body);
  await controller.sns(snsEvent());
  for (const id of [legacyPostal, legacySes])
    expect((await sql`select status from messages where id=${id}`)[0]?.status).toBe('delivered');
  for (const id of [namedPostal, namedSes])
    expect((await sql`select status from messages where id=${id}`)[0]?.status).toBe('sent');
  const misleading = {
    ...body,
    uuid: 'legacy-callback-named-rfc',
    payload: { message: { message_id: `<${namedPostal}@example.test>`, to: recipient } },
  };
  await expect(controller.postal(postalRequest(misleading), misleading)).rejects.toMatchObject({
    status: 503,
  });
  expect((await sql`select status from messages where id=${namedPostal}`)[0]?.status).toBe('sent');
});
