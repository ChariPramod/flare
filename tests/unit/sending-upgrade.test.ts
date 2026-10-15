import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('upgrades existing sender history without granting approval, readiness or changing submitted identity', async () => {
  const db = await PGlite.create();
  const migrations = readdirSync('packages/db/migrations')
    .filter((name) => name.endsWith('.sql') && !name.startsWith('0000'))
    .sort();
  const apply = async (name: string) =>
    db.exec(readFileSync(`packages/db/migrations/${name}`, 'utf8'));
  try {
    await db.exec('SET client_min_messages = error');
    for (const name of migrations.filter((name) => name < '0015')) await apply(name);
    const org = randomUUID(),
      env = randomUUID(),
      domain = randomUUID(),
      queued = randomUUID(),
      scheduled = randomUUID(),
      sent = randomUUID(),
      active = randomUUID(),
      key = randomUUID();
    await db.query(
      "insert into organizations(id,name,slug) values($1,'Upgrade sender','upgrade-sender')",
      [org],
    );
    await db.query("insert into environments(id,org_id,name) values($1,$2,'Production')", [
      env,
      org,
    ]);
    await db.query(
      "insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher,checked_at,verified_at,next_check_at) values($1,$2,$3,'example.com','verified','original-selector','original-public','original-cipher',now(),now(),now()+interval '1 day')",
      [domain, org, env],
    );
    await db.query(
      "insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission,domain_id) values($1,$2,$3,'Existing key','fixture-hash','fl_fixture','sending_access',$4)",
      [key, org, env, domain],
    );
    for (const [id, status] of [
      [queued, 'queued'],
      [scheduled, 'scheduled'],
      [sent, 'delivered'],
      [active, 'queued'],
    ]) {
      await db.query(
        "insert into messages(id,org_id,environment_id,domain_id,request,mime_key,envelope_from,status,scheduled_at) values($1,$2,$3,$4,'{}',$5,'sender@example.com',$6,now()+interval '1 hour')",
        [id, org, env, domain, `preserved/${id}`, status],
      );
      await db.query(
        "insert into message_recipients(org_id,environment_id,message_id,address,kind) values($1,$2,$3,'reader@example.net','to')",
        [org, env, id],
      );
    }
    await db.query(
      'update messages set delivery_started_at=now(),delivery_finished_at=now() where id=$1',
      [sent],
    );
    await db.query(
      "update messages set delivery_started_at=now(),claim_id=$2,lease_until=now()+interval '2 minutes' where id=$1",
      [active, randomUUID()],
    );
    await db.query(
      "insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,provider_ids,recipients) values($1,$2,$3,'postal',1,'accepted','{\"reader@example.net\":\"original-provider-token\"}','[\"reader@example.net\"]')",
      [org, env, sent],
    );
    await db.query(
      "insert into suppressions(org_id,address,reason) values($1,'reader@example.net','complaint')",
      [org],
    );
    for (const name of migrations.filter((name) => name >= '0015')) await apply(name);
    expect(
      (
        await db.query(
          'select state,daily_limit,per_minute_limit,route_bindings from sending_policies',
        )
      ).rows,
    ).toEqual([
      { state: 'pending_review', daily_limit: 100, per_minute_limit: 10, route_bindings: {} },
    ]);
    const rows = (
      await db.query<{ id: string; status: string; hold_reason: string; mime_key: string }>(
        'select id,status,hold_reason,mime_key from messages',
      )
    ).rows;
    for (const id of [queued, scheduled])
      expect(rows.find((row) => row.id === id)).toMatchObject({
        status: 'held',
        hold_reason: 'classification_required',
        mime_key: `preserved/${id}`,
      });
    expect(rows.find((row) => row.id === sent)?.status).toBe('delivered');
    expect(rows.find((row) => row.id === active)?.status).toBe('queued');
    expect(
      (await db.query('select instance_id,provider_ids from transport_attempts')).rows,
    ).toEqual([
      { instance_id: 'postal', provider_ids: { 'reader@example.net': 'original-provider-token' } },
    ]);
    expect(
      (
        await db.query(
          'select status,dkim_selector,dkim_private_cipher,dmarc_evidence,next_check_at<=now() as due from domains',
        )
      ).rows,
    ).toEqual([
      {
        status: 'verified',
        dkim_selector: 'original-selector',
        dkim_private_cipher: 'original-cipher',
        dmarc_evidence: {},
        due: true,
      },
    ]);
    expect(
      (await db.query('select domain_id,mail_traffic_class,critical_sending from api_keys')).rows,
    ).toEqual([{ domain_id: domain, mail_traffic_class: null, critical_sending: false }]);
    expect((await db.query('select protected from suppressions')).rows).toEqual([
      { protected: true },
    ]);
    expect((await db.query('select * from domain_transport_readiness')).rows).toHaveLength(0);
    expect((await db.query('select * from sending_quota')).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});
