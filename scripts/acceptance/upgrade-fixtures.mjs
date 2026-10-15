import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Deliberately shares stable identifiers across tenants/environments; only composite scope differs.
export async function seedUpgradeFixtures(sql) {
  for (const slug of ['upgrade-a', 'upgrade-b']) {
    const org = randomUUID();
    await sql`insert into organizations(id,name,slug) values(${org},${slug},${slug})`;
    await sql`insert into suppressions(org_id,address,reason) values(${org},'complaint@example.net','complaint'),(${org},'manual@example.net','manual')`;
    for (const name of ['Development', 'Production']) {
      const env = randomUUID(),
        domain = randomUUID(),
        template = randomUUID(),
        contact = randomUUID();
      const workflow = { workflowId: 'preserved', name: `${slug}/${name}`, steps: [] };
      await sql`insert into environments(id,org_id,name) values(${env},${org},${name})`;
      await sql`insert into workflows(org_id,environment_id,identifier,definition,revision) values(${org},${env},'preserved',${sql.json(workflow)},3)`;
      await sql`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher,next_check_at) values(${domain},${org},${env},'upgrade.example.com','verified','old-selector','old-public','old-encrypted-key',now()+interval '1 day')`;
      await sql`insert into api_keys(org_id,environment_id,name,token_hash,prefix,permission,domain_id) values(${org},${env},'Scoped legacy key',${randomUUID()},'fixture','sending_access',${domain})`;
      await sql`insert into contacts(id,org_id,environment_id,email,properties) values(${contact},${org},${env},'reader@example.net','{"locale":"fr_FR","plan":"pilot"}')`;
      await sql`insert into subscribers(org_id,environment_id,subscriber_id,profile,preferences) values(${org},${env},'same-subscriber','{"locale":"fr_FR"}','{"email":false}')`;
      await sql`insert into email_templates(id,org_id,environment_id,name,identifier,current_version) values(${template},${org},${env},'Preserved template','preserved',2)`;
      for (const version of [1, 2])
        await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html,text_body) values(${org},${env},${template},${version},${`Version ${version}`},${`<p>${slug}/${name}/${version}</p>`},${`Text ${version}`})`;
      const broadcast = randomUUID();
      await sql`insert into broadcasts(id,org_id,environment_id,name,sender,template_id,template_version,status,scheduled_at,next_dispatch_at) values(${broadcast},${org},${env},'Pinned old template','sender@upgrade.example.com',${template},1,'scheduled',now()+interval '1 day',now()+interval '1 day')`;
      await sql`insert into broadcast_recipients(org_id,environment_id,broadcast_id,contact_id) values(${org},${env},${broadcast},${contact})`;
      for (const status of ['queued', 'scheduled', 'delivered', 'failed', 'canceled', 'active']) {
        const message = randomUUID();
        const terminal = ['delivered', 'failed', 'canceled'].includes(status);
        await sql`insert into messages(id,org_id,environment_id,domain_id,request,mime_key,envelope_from,status,scheduled_at,delivery_started_at,delivery_finished_at) values(${message},${org},${env},${domain},${sql.json({ subject: `Preserve ${status}`, to: ['reader@example.net'] })},${`legacy/${message}`},'sender@upgrade.example.com',${status === 'active' ? 'queued' : status},'2030-01-01T00:00:00Z',${terminal ? new Date('2025-01-01') : null},${terminal ? new Date('2025-01-01') : null})`;
        await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${org},${env},${message},'reader@example.net','bcc',${terminal ? status : 'queued'})`;
        await sql`insert into idempotency(org_id,environment_id,operation,key,body_hash,response,expires_at) values(${org},${env},'email.send',${status},'original-request-hash',${sql.json({ id: message })},'2030-01-02T00:00:00Z')`;
        if (status === 'active') {
          await sql`update messages set delivery_started_at=now(),claim_id=${randomUUID()},lease_until=now()+interval '2 minutes' where id=${message}`;
          await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,provider_ids,recipients) values(${org},${env},${message},'postal',1,'started','{}','["reader@example.net"]')`;
        }
        if (status === 'delivered') {
          await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,provider_ids,recipients,finished_at) values(${org},${env},${message},'postal',1,'accepted',${sql.json({ 'reader@example.net': `postal-${message}` })},'["reader@example.net"]',now())`;
          await sql`insert into delivery_events(org_id,environment_id,message_id,source,source_id,type,recipient,data) values(${org},${env},${message},'postal',${message},'delivered','reader@example.net','{"code":"250"}')`;
        }
      }
      for (const status of ['queued', 'accepted', 'failed', 'canceled'])
        await sql`insert into workflow_runs(org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload,status,attempts) values(${org},${env},'preserved',${`run-${status}`},'parent',${sql.json({ locale: 'fr_FR', content: `${slug}/${name}` })},${status},${status === 'queued' ? 0 : 2})`;
      const event = randomUUID(),
        endpoint = randomUUID();
      await sql`insert into event_outbox(id,org_id,environment_id,type,data) values(${event},${org},${env},'email.delivered','{"metadata_only":true}')`;
      await sql`insert into webhook_endpoints(id,org_id,environment_id,name,url,secret_cipher) values(${endpoint},${org},${env},'Preserved webhook','https://example.invalid/hooks','legacy-secret-cipher')`;
      await sql`insert into webhook_deliveries(org_id,environment_id,endpoint_id,event_id,payload,attempts,next_attempt_at) values(${org},${env},${endpoint},${event},'{"metadata_only":true}',2,'2030-01-01T00:00:00Z')`;
      const automation = randomUUID(),
        automationEvent = randomUUID(),
        run = randomUUID();
      const definition = { steps: [{ id: 'wait', type: 'delay', duration: '1d' }] };
      await sql`insert into automations(id,org_id,environment_id,identifier,name,definition,revision) values(${automation},${org},${env},'preserved','Preserved',${sql.json(definition)},2)`;
      await sql`insert into automation_events(id,org_id,environment_id,contact_id,name,external_id) values(${automationEvent},${org},${env},${contact},'signup','same-event')`;
      await sql`insert into automation_runs(id,org_id,environment_id,automation_id,contact_id,event_id,definition,revision,current_step,status,next_step_at) values(${run},${org},${env},${automation},${contact},${automationEvent},${sql.json(definition)},2,'wait','waiting','2030-01-01T00:00:00Z')`;
      await sql`insert into automation_steps(org_id,environment_id,run_id,step_id,type,status,wake_at) values(${org},${env},${run},'wait','delay','waiting','2030-01-01T00:00:00Z')`;
    }
  }
}

export async function captureUpgradeRows(sql) {
  const result = {};
  for (const {
    tablename,
  } of await sql`select tablename from pg_tables where schemaname='public' order by tablename`) {
    result[tablename] = [
      ...(await sql`select to_jsonb(t) as value from public.${sql(tablename)} t`),
    ].map((r) => r.value);
  }
  return result;
}

// Compare every original column, including IDs, ciphertext, pinned versions, leases and payloads.
export function assertPreservedRows(expected, actual, migrated) {
  for (const [table, rows] of Object.entries(expected)) {
    if (table === 'flare_migrations' && migrated) continue;
    assert.equal(actual[table]?.length, rows.length, `Preserved row count: ${table}`);
    const columns = Object.keys(rows[0] ?? {}).filter(
      (column) => !(migrated && table === 'domains' && column === 'next_check_at'),
    );
    const canonical = (source, before) =>
      source
        .map((row) =>
          JSON.stringify(
            Object.fromEntries(
              columns
                .sort()
                .map((key) => [
                  key,
                  migrated &&
                  before &&
                  table === 'messages' &&
                  key === 'status' &&
                  ['queued', 'scheduled'].includes(row.status) &&
                  row.delivery_started_at === null &&
                  row.delivery_finished_at === null
                    ? 'held'
                    : row[key],
                ]),
            ),
          ),
        )
        .sort();
    // Do not print database rows or payloads on failure.
    assert.ok(
      JSON.stringify(canonical(rows, true)) === JSON.stringify(canonical(actual[table], false)),
      `Preserved original values: ${table}`,
    );
  }
}
