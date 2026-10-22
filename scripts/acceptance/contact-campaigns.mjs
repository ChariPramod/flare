import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { sql, session, until, json } from './common.mjs';

const requirePlatform = createRequire(
  new URL('../../packages/platform/package.json', import.meta.url),
);
const { Workbook } = requirePlatform('exceljs');

try {
  const { api, org, env, headers } = await session();
  const prefix = `campaign-${randomUUID()}`;
  const email = (suffix) => `${prefix}-${suffix}@example.net`;
  const request = (path, body, extra = {}) =>
    fetch(`http://localhost:4000/v1${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(body),
      signal: globalThis.AbortSignal.timeout(30000),
    });
  const mapping = { address: 'email', given: 'first_name', opted_out: 'unsubscribed' };
  await api('/contacts', 'POST', { email: email('outside') });
  await api('/contacts', 'POST', { email: email('optout'), unsubscribed: true });
  const source = {
    format: 'json',
    data: JSON.stringify([
      { address: email('eligible'), given: 'One', opted_out: false },
      { address: email('optout'), given: 'Two', opted_out: false },
      { address: email('suppressed'), given: 'Three', opted_out: false },
      { address: email('eligible').toUpperCase(), given: 'Updated', opted_out: false },
    ]),
  };
  const preview = await api('/contacts/import/preview', 'POST', { source, mapping });
  assert.equal(preview.validation.error_count, 0);
  assert.equal(preview.validation.duplicates, 1);
  const imported = await api('/contacts/import', 'POST', { source, mapping, list_name: prefix });
  assert.equal(imported.imported, 3);
  assert.equal(imported.duplicates, 1);
  assert.ok(imported.list_id);
  const replay = await api('/contacts/import', 'POST', { source, mapping, list_name: prefix });
  assert.equal(replay.list_id, imported.list_id, 'Import retries reuse the named cohort');
  const list = (await api('/contact-lists')).find((item) => item.id === imported.list_id);
  assert.equal(list.contact_count, 3);
  // json() unwraps the contact page envelope's data field.
  const contacts = await api(`/contacts?list_id=${imported.list_id}`);
  assert.equal(contacts.length, 3);
  assert.equal(contacts.find((item) => item.email === email('optout')).unsubscribed, true);

  const bad = await request('/contacts/import', {
    source: { format: 'csv', data: `email\n${email('rollback')}\ninvalid-address` },
    mapping: { email: 'email' },
    list_name: `${prefix}-invalid`,
  });
  assert.equal(bad.status, 422);
  assert.equal((await api(`/contacts?q=${encodeURIComponent(email('rollback'))}`)).length, 0);
  assert.equal(
    (await api('/contact-lists')).some((item) => item.name === `${prefix}-invalid`),
    false,
  );
  const tsv = await api('/contacts/import', 'POST', {
    source: { format: 'tsv', data: `email\tfirst_name\n${email('tsv')}\tTab` },
    mapping: { email: 'email', first_name: 'first_name' },
  });
  assert.equal(tsv.created, 1);
  const workbook = new Workbook();
  workbook.addWorksheet('Ignore').addRows([['email'], [email('ignored-sheet')]]);
  workbook.addWorksheet('Selected').addRows([['email'], [email('xlsx')]]);
  const xlsx = await api('/contacts/import', 'POST', {
    source: {
      format: 'xlsx',
      data: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'),
      sheet: 'Selected',
    },
    mapping: { email: 'email' },
  });
  assert.equal(xlsx.created, 1);
  assert.equal((await api(`/contacts?q=${encodeURIComponent(email('ignored-sheet'))}`)).length, 0);
  assert.deepEqual(
    await api('/contacts/import', 'POST', {
      csv: `email\n${email('legacy')}`,
      mapping: { email: 'email' },
    }),
    { imported: 1, duplicates: 0 },
  );

  await api('/suppressions', 'POST', { email: email('suppressed') });
  const subject = `Contact campaign acceptance ${prefix}`;
  const draft = {
    name: prefix,
    sender: 'sender@acceptance.test',
    list_id: imported.list_id,
    content: {
      subject,
      html: '<p>Hello {{first_name}}</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Unsubscribe</a>',
      text: 'Hello {{first_name}}',
      variables: {},
    },
    rate_per_second: 1,
  };
  const previewContact = contacts.find((item) => item.email === email('eligible'));
  const contentPreview = await api('/template-preview', 'POST', {
    content: draft.content,
    contact_id: previewContact.id,
  });
  assert.equal(contentPreview.text, 'Hello Updated');
  assert.ok(contentPreview.html.includes('https://example.test/preferences/preview'));
  assert.deepEqual(contentPreview.missing_variables, []);
  const missingPreview = await request('/template-preview', {
    content: draft.content,
    contact_id: randomUUID(),
  });
  assert.equal(missingPreview.status, 404);
  const mixedPreview = await request('/template-preview', {
    content: draft.content,
    contact_id: previewContact.id,
    variables: { first_name: 'forged' },
  });
  assert.equal(mixedPreview.status, 400);
  assert.deepEqual((await mixedPreview.json()).errors.formErrors, [
    'Choose a contact or sample variables, not both',
  ]);
  const key = randomUUID();
  const created = await Promise.all(
    Array.from({ length: 3 }, () =>
      json('http://localhost:4000/v1/broadcasts', {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': key },
        body: draft,
      }),
    ),
  );
  assert.equal(
    new Set(created.map((item) => item.id)).size,
    1,
    'Concurrent retries create one campaign',
  );
  assert.equal(
    (
      await request(
        '/broadcasts',
        { ...draft, name: `${prefix}-changed` },
        { 'Idempotency-Key': key },
      )
    ).status,
    409,
  );
  const campaign = created[0];
  const checklist = await api(`/broadcasts/${campaign.id}/preflight`);
  assert.equal(checklist.sandbox, true);
  assert.equal(checklist.can_test, true);
  const testKey = randomUUID();
  const testInput = {
    revision: checklist.revision,
    sandbox: true,
    recipients: [email('test-only')],
  };
  const tests = await Promise.all(
    Array.from({ length: 2 }, () =>
      json(`http://localhost:4000/v1/broadcasts/${campaign.id}/test`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': testKey },
        body: testInput,
      }),
    ),
  );
  assert.deepEqual(tests[0], tests[1]);
  // common.json unwraps data envelopes; retain the accepted message ID.
  const testId = tests[0][0].id;
  await until(async () => {
    const [message] =
      await sql`select status,broadcast_id,request from messages where id=${testId}`;
    if (message.status !== 'sent') return false;
    assert.equal(message.broadcast_id, null);
    assert.equal(message.request.subject, `[TEST] ${subject}`);
    assert.ok(message.request.html.includes('https://example.test/preferences/test-email'));
    assert.ok(!message.request.html.includes('Hello Updated'));
    return true;
  }, 'Controlled test transport acceptance');
  await until(
    async () =>
      (await json('http://mailpit:8025/api/v1/messages')).messages.some(
        (item) => item.Subject === `[TEST] ${subject}`,
      ),
    'Controlled test Mailpit receipt',
  );
  const rawMessage = await api(`/emails/${testId}`);
  assert.equal(rawMessage.request.to[0], email('test-only'));
  assert.equal((await api(`/broadcasts/${campaign.id}`)).status, 'draft');
  assert.equal((await request(`/broadcasts/${campaign.id}/test`, testInput)).status, 400);
  assert.equal(
    (
      await request(
        `/broadcasts/${campaign.id}/test`,
        { ...testInput, sandbox: false },
        { 'Idempotency-Key': randomUUID() },
      )
    ).status,
    409,
  );
  const audience = await api(`/broadcasts/${campaign.id}/audience-preview`);
  assert.equal(audience.total, 3);
  assert.equal(audience.eligible, 1);
  assert.deepEqual(audience.excluded, {
    unsubscribed: 1,
    suppressed: 1,
    topic_opt_out: 0,
    deleted: 0,
  });
  const production = org.environments.find((item) => item.name === 'Production');
  assert.equal(
    (
      await request(
        '/broadcasts',
        { ...draft, list_id: null },
        { 'x-environment-id': production.id },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request('/broadcasts', draft, { 'x-environment-id': production.id })).status,
    422,
  );

  const cancellation = await api('/broadcasts', 'POST', { ...draft, name: `${prefix}-cancel` });
  await api(`/broadcasts/${cancellation.id}/schedule`, 'POST', {
    scheduled_at: new Date(Date.now() + 3600000).toISOString(),
  });
  await api(`/broadcasts/${cancellation.id}/cancel`, 'POST');
  assert.equal((await api(`/broadcasts/${cancellation.id}`)).status, 'canceled');
  await api(`/broadcasts/${campaign.id}/schedule`, 'POST', {});
  await until(
    async () => (await api(`/broadcasts/${campaign.id}`)).status === 'sent',
    'Campaign audience submission',
  );
  await until(
    async () =>
      (await json('http://mailpit:8025/api/v1/messages')).messages.some(
        (item) => item.Subject === subject,
      ),
    'Campaign → Mailpit receipt',
  );
  await until(async () => {
    const rows = await sql`select status from messages where broadcast_id=${campaign.id}`;
    return rows.length === 1 && rows[0].status === 'sent';
  }, 'Campaign transport acceptance committed');
  const messages =
    await sql`select m.id,m.status,r.address from messages m join message_recipients r on r.message_id=m.id and r.org_id=m.org_id and r.environment_id=m.environment_id where m.broadcast_id=${campaign.id}`;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].address, email('eligible'));
  assert.equal(messages[0].status, 'sent');
  const receipts = (await json('http://mailpit:8025/api/v1/messages')).messages.filter(
    (item) => item.Subject === subject,
  );
  assert.equal(receipts.length, 1, 'Exactly one eligible recipient is submitted to SMTP');
  const detail = await api(`/broadcasts/${campaign.id}`);
  assert.equal(detail.stats.recipients.find((item) => item.status === 'skipped').count, 2);
  await until(async () => {
    const rows =
      await sql`select request_body,response_body from request_logs where org_id=${org.id} and environment_id=${env.id} and path='/v1/contacts/import' order by created_at desc limit 1`;
    return rows.length > 0 && JSON.stringify(rows).includes('CONTACT IMPORT CONTENT REDACTED');
  }, 'Import logs redact source content');
  console.log(
    'CSV/TSV/JSON/XLSX imports, atomic errors, cohort targeting, opt-outs, campaign idempotency, scheduling/cancellation and Mailpit delivery passed.',
  );
} finally {
  await sql.end({ timeout: 5 });
}
