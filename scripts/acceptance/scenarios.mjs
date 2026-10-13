import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { sql, session, until, json } from './common.mjs';
import { recordEvent } from '../../packages/mail/dist/index.js';
const requireMail = createRequire(new URL('../../packages/mail/package.json', import.meta.url));
const nodemailer = requireMail('nodemailer');
try {
  const { api, org, env, headers } = await session();
  const [domain] = (await api('/domains')).filter((d) => d.name === 'acceptance.test');
  assert.equal(domain.status, 'verified');
  const welcome = await api('/workflows/welcome');
  assert.ok(welcome.source_definition, 'Repeatable seed retains editable source');
  assert.equal(
    (await sql`select count(*)::int as n from workflows where identifier='welcome'`)[0].n,
    1,
  );
  const schema = { workflowId: 'acceptance-localized', name: 'Acceptance localized', steps: [] };
  await api('/workflows', 'POST', schema);
  await api('/layouts', 'POST', {
    identifier: 'acceptance-layout',
    name: 'Acceptance layout',
    html: '<main><h1>{{t.heading}}</h1>{{{body}}}</main>',
    translations: true,
  });
  await api('/translations/acceptance-localized/en_US', 'PUT', {
    heading: 'Default heading',
    subject: 'Default subject',
  });
  await api('/translations/acceptance-localized/fr_FR', 'PUT', { subject: 'Bonjour acceptance' });
  await api('/workflows/acceptance-localized', 'PUT', {
    ...schema,
    steps: [
      {
        stepId: 'email',
        name: 'Localized email',
        type: 'email',
        controlValues: {
          subject: '{{t.subject}}',
          body: '<p>Acceptance body</p>',
          layoutIdentifier: 'acceptance-layout',
        },
      },
    ],
  });
  await api('/subscribers', 'POST', {
    subscriberId: 'acceptance-french',
    email: 'french@example.net',
    locale: 'fr_FR',
  });
  const run = await api('/events/trigger', 'POST', {
    name: schema.workflowId,
    to: 'acceptance-french',
  });
  await until(async () => {
    const current = await api(`/activity/${run.ids[0]}`);
    if (['failed', 'ambiguous', 'canceled'].includes(current.status)) {
      const httpStatus = String(current.error).match(/\((\d{3})\)/)?.[1] ?? 'unavailable';
      throw new Error(
        `Workflow dispatch ${current.status}; attempts=${Number(current.attempts)}; upstream HTTP=${httpStatus}`,
      );
    }
    return current.status === 'accepted';
  }, 'pinned Novu trigger acceptance');
  await until(
    async () =>
      (await json('http://mailpit:8025/api/v1/messages')).messages.some(
        (m) => m.Subject === 'Bonjour acceptance',
      ),
    'Novu → AUTH/STARTTLS relay → Mailpit',
  );
  const [saved] = await sql`select payload from workflow_runs where id=${run.ids[0]}`;
  assert.equal(saved.payload.payload.__flare_i18n.html_heading, 'Default heading');
  assert.equal(saved.payload.payload.__flare_i18n.text_subject, 'Bonjour acceptance');
  await api('/subscribers/acceptance-french/preferences', 'PUT', { channels: { email: false } });
  assert.equal((await api('/subscribers/acceptance-french/preferences')).global.email, false);
  const diff = await api('/publish/diff');
  const operation = await api('/publish', 'POST', {
    workflows: [schema.workflowId],
    diff_token: diff.diff_token,
  });
  await until(
    async () => (await api(`/publications/${operation.id}`)).status === 'completed',
    'durable content publication verified by Novu',
  );
  const production = org.environments.find((e) => e.name === 'Production');
  const prod = await json(`http://localhost:4000/v1/workflows/${schema.workflowId}`, {
    headers: { ...headers, 'x-environment-id': production.id },
  });
  assert.equal(prod.content_dependencies.layouts[0].identifier, 'acceptance-layout');
  const forbidden = await fetch(`http://localhost:4000/v1/workflows/${schema.workflowId}`, {
    method: 'PUT',
    headers: { ...headers, 'x-environment-id': production.id, 'Content-Type': 'application/json' },
    body: JSON.stringify(schema),
  });
  assert.equal(forbidden.status, 403);
  const automation = await api('/automations', 'POST', {
    identifier: 'acceptance-sequence',
    name: 'Acceptance sequence',
    enabled: true,
    definition: {
      trigger: 'acceptance_signup',
      entry: 'wait',
      steps: [{ id: 'wait', name: 'Durable wait', type: 'wait', seconds: 1, next: null }],
    },
  });
  const promotion = await api('/publish', 'POST', { automations: ['acceptance-sequence'] });
  await until(
    async () => (await api(`/publications/${promotion.id}`)).status === 'completed',
    'automation publication',
  );
  const productionApi = (path, method = 'GET', body) =>
    json(`http://localhost:4000/v1${path}`, {
      method,
      body,
      headers: { ...headers, 'x-environment-id': production.id },
    });
  const promoted = (await productionApi('/automations')).find(
    (a) => a.identifier === 'acceptance-sequence',
  );
  assert.notEqual(promoted.id, automation.id);
  const contact = await productionApi('/contacts', 'POST', {
    email: 'production-contact@example.net',
  });
  await productionApi('/automation-events', 'POST', {
    contact_id: contact.id,
    name: 'acceptance_signup',
    external_id: 'acceptance-production-event',
  });
  await until(
    async () =>
      (await productionApi(`/automation-runs?automation_id=${promoted.id}`)).some(
        (r) => r.status === 'completed',
      ),
    'promoted automation execution in Production',
  );
  // Exercise the authenticated relay separately, including failed authentication and hidden envelope recipients.
  const transport = (password) =>
    nodemailer.createTransport({
      host: 'flare-smtp-relay',
      port: 2525,
      secure: false,
      requireTLS: true,
      auth: { user: 'flare', pass: password },
      tls: { ca: readFileSync('/app/ops/certs/relay.crt'), servername: 'flare-smtp-relay' },
    });
  const valid = transport(process.env.SEED_API_KEY),
    invalid = transport('fl_invalid_acceptance');
  await assert.rejects(invalid.verify(), /auth|credentials/i);
  await valid.sendMail({
    from: 'sender@acceptance.test',
    to: 'visible@example.net',
    bcc: 'hidden@example.net',
    subject: 'SMTP acceptance',
    text: 'Authenticated STARTTLS submission',
  });
  valid.close();
  invalid.close();
  await until(
    async () =>
      (
        await sql`select id from messages where request->>'subject'='SMTP acceptance' and status='sent'`
      ).length === 1,
    'SMTP delivery',
  );
  const [smtp] = await sql`select id from messages where request->>'subject'='SMTP acceptance'`;
  const mime = await api(`/emails/${smtp.id}/source`);
  assert.match(mime.source, /DKIM-Signature:/);
  assert.ok(!mime.source.includes('hidden@example.net'));
  const event = {
    source: 'acceptance-simulated-delivery',
    sourceId: randomUUID(),
    messageId: smtp.id,
    recipient: 'visible@example.net',
    type: 'delivered',
  };
  await recordEvent(sql, { orgId: org.id, environmentId: env.id }, event);
  await recordEvent(sql, { orgId: org.id, environmentId: env.id }, event);
  assert.equal(
    (await sql`select count(*)::int as n from delivery_events where message_id=${smtp.id}`)[0].n,
    1,
  );
  await api('/suppressions', 'POST', { email: 'suppressed@example.net' });
  const suppressed = await api('/emails', 'POST', {
    from: 'sender@acceptance.test',
    to: 'suppressed@example.net',
    subject: 'Suppression acceptance',
    text: 'Never submitted',
  });
  await until(
    async () => (await api(`/emails/${suppressed.id}`)).status === 'suppressed',
    'organization suppression',
  );
  // Signed Postal-shaped input is a simulation; real Postal routing remains an external-provider check.
  const raw = Buffer.from(
    'From: incoming@example.net\r\nTo: visible@acceptance.test\r\nSubject: Acceptance incoming\r\nMIME-Version: 1.0\r\nContent-Type: text/html\r\n\r\n<p>Safe incoming body</p><script>alert(1)</script><img src="https://remote.invalid/tracker">',
  );
  const body = JSON.stringify({
    id: 'acceptance-inbound',
    mail_from: 'incoming@example.net',
    rcpt_to: 'hidden@acceptance.test',
    message: raw.toString('base64'),
    base64: true,
    size: raw.length,
  });
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(body),
    readFileSync('/acceptance-postal.key'),
  ).toString('base64');
  const post = (payload) =>
    fetch(`http://localhost:4000/v1/inbound/postal/${domain.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-postal-signature-256': signature },
      body: payload,
    });
  assert.equal((await post(body + ' ')).status, 401);
  const receipts = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const response = await post(body);
      assert.ok(response.ok);
      return response.json();
    }),
  );
  assert.equal(new Set(receipts.map((r) => r.id)).size, 1);
  const inbound = receipts[0].id;
  await until(
    async () => (await api(`/inbound/${inbound}`)).status === 'parsed',
    'durable inbound parsing',
  );
  assert.equal((await api(`/inbound/${inbound}`)).rcpt_to, 'hidden@acceptance.test');
  assert.equal(
    Buffer.from((await api(`/inbound/${inbound}/raw`)).content, 'base64').toString(),
    raw.toString(),
  );
  assert.equal(
    (
      await sql`select count(*)::int as n from event_outbox where type='email.received' and data->>'inbound_id'=${inbound}`
    )[0].n,
    1,
  );
  // A known, definitive failure fixture gives the browser a safe operation to redrive.
  const redrive = randomUUID();
  await sql`insert into workflow_runs(id,org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload,status,error) values(${redrive},${org.id},${env.id},'welcome',${redrive},${redrive},${sql.json({ name: 'welcome', to: ['demo-subscriber'], payload: {}, transactionId: redrive })},'failed','Acceptance definitive failure')`;
  writeFileSync('/acceptance/fixtures.json', JSON.stringify({ inbound, redrive }), { mode: 0o600 });
  console.log(
    'Real API, pinned Novu, SMTP, locale fallback, publication, suppression and simulated signed inbound checks passed.',
  );
} finally {
  await sql.end();
}
