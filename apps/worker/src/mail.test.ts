import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../../packages/db/src/index.js';
import type { Sql } from '../../../packages/db/src/index.js';
import { evaluateSendingReadiness } from '../../../packages/mail/src/readiness.js';
import { transportInstanceIdentity } from '../../../packages/mail/src/routes.js';
import type { NamedTransportConfig } from '../../../packages/mail/src/routes.js';
import { refreshSesReadiness, sweepSendingFeedback, verifyDueMailDomains } from './mail.js';

const orgId = randomUUID(),
  environmentId = randomUUID(),
  domainId = randomUUID(),
  operatorId = randomUUID();
const named: Extract<NamedTransportConfig, { kind: 'ses' }> = {
  id: 'ses-a',
  kind: 'ses',
  server_id: 'aws-fixture',
  pool_id: 'customer',
  credential_version: 'v1',
  region: 'us-east-1',
  configuration_set: 'customer',
  access_key_id_env: 'SES_FIXTURE_ACCESS',
  secret_access_key_env: 'SES_FIXTURE_SECRET',
  sns_topic_arn: 'arn:aws:sns:us-east-1:123456789012:fixture',
};
const environment = {
  FLARE_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  SES_FIXTURE_ACCESS: 'fixture-access',
  SES_FIXTURE_SECRET: 'fixture-secret',
};
const fingerprint = transportInstanceIdentity(named, environment).config_fingerprint;
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
const dns = () => ({
  resolveTxt: vi.fn(async (name: string) =>
    name.startsWith('fixture._domainkey.')
      ? [['v=DKIM1; k=rsa; p=existing-public-key']]
      : name.startsWith('_dmarc.')
        ? [['v=DMARC1; p=reject; ', 'adkim=r; aspf=r']]
        : [['v=spf1 include:postal.example.net ~all']],
  ),
  resolveMx: vi.fn(async () => [{ exchange: 'postal.example.net', priority: 10 }]),
  resolveCname: vi.fn(async () => ['postal.example.net']),
});
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
  await sql`insert into organizations(id,name,slug) values(${orgId},'Polling','polling')`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Production')`;
  await sql`insert into users(id,email,name) values(${operatorId},'polling@example.test','Polling operator')`;
}, 30000);
beforeEach(async () => {
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  vi.stubEnv('MAIL_TRANSPORTS', '');
  vi.stubEnv('TRANSPORT', 'postal');
  vi.stubEnv('TRANSPORT_PRIORITY', '');
  vi.stubEnv('POSTAL_HOSTNAME', 'postal.example.net');
  vi.stubEnv('POSTAL_SPF_HOST', 'postal.example.net');
  vi.stubEnv('POSTAL_RETURN_PATH', 'postal.example.net');
  vi.stubEnv('POSTAL_RETURN_PATH_PREFIX', 'psrp');
  await sql`truncate domains,event_outbox cascade`;
  await sql`delete from sending_policies where org_id<>${orgId}`;
  await sql`update sending_policies set state='pending_review' where org_id=${orgId}`;
  await sql`insert into domains(id,org_id,environment_id,name,status,sending,receiving,dkim_selector,dkim_public,dkim_private_cipher,records,checked_at) values(${domainId},${orgId},${environmentId},'example.com','verified',true,true,'fixture','existing-public-key','existing-encrypted-private-key',${sql.json([{ type: 'MX', name: 'rp.example.com', value: 'old-postal.example.net', purpose: 'return_path', required: true, status: 'verified' }])},now())`;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
it('regenerates obsolete Postal instructions without changing DKIM keys, stores parsed DMARC and polls hourly', async () => {
  const resolver = dns();
  expect(await verifyDueMailDomains(sql, resolver)).toBe(1);
  const [domain] =
    await sql`select *,next_check_at-now() between interval '59 minutes' and interval '61 minutes' as hourly from domains where id=${domainId}`;
  expect(domain).toMatchObject({
    status: 'verified',
    dkim_selector: 'fixture',
    dkim_public: 'existing-public-key',
    dkim_private_cipher: 'existing-encrypted-private-key',
    hourly: true,
    dmarc_evidence: { status: 'verified', policy: 'reject' },
  });
  expect(domain!.records).toContainEqual(
    expect.objectContaining({
      type: 'CNAME',
      name: 'psrp.example.com',
      purpose: 'return_path',
      status: 'verified',
      required: false,
    }),
  );
  expect(domain!.records).not.toContainEqual(expect.objectContaining({ name: 'rp.example.com' }));
  expect(
    resolver.resolveTxt.mock.calls.filter(([name]) => name.startsWith('_dmarc.')),
  ).toHaveLength(1);
  expect(await verifyDueMailDomains(sql, resolver)).toBe(0);
});
it('preserves PostgreSQL microsecond precision when completing a DNS claim', async () => {
  await sql`update domains set status='pending',checked_at=null where id=${domainId}`;
  // PGlite's clock is millisecond-aligned; native PostgreSQL now() is not.
  // Give the real claim query a sub-millisecond value before it returns.
  await sql`create function test_dns_microseconds() returns trigger language plpgsql as $$
    begin
      new.next_check_at := date_trunc('milliseconds',new.next_check_at)+interval '123 microseconds';
      return new;
    end
  $$`;
  await sql`create trigger test_dns_microseconds before update on domains for each row execute function test_dns_microseconds()`;
  try {
    expect(await verifyDueMailDomains(sql, dns())).toBe(1);
    const [domain] =
      await sql`select status,records,checked_at,next_check_at-now()>interval '59 minutes' as hourly from domains where id=${domainId}`;
    expect(domain).toMatchObject({ status: 'verified', hourly: true });
    expect(domain!.records).toContainEqual(
      expect.objectContaining({ purpose: 'dkim', status: 'verified' }),
    );
    expect(await verifyDueMailDomains(sql, dns())).toBe(0);
  } finally {
    await sql`drop trigger test_dns_microseconds on domains`;
    await sql`drop function test_dns_microseconds()`;
  }
});
it('keeps ownership separate from provider/DMARC drift and fails ownership closed on DKIM loss', async () => {
  const resolver = dns();
  resolver.resolveTxt.mockImplementation(async (name) =>
    name.startsWith('fixture._domainkey.') ? [['v=DKIM1; p=existing-public-key']] : [],
  );
  resolver.resolveCname.mockResolvedValue([]);
  await verifyDueMailDomains(sql, resolver);
  const [domain] = await sql`select * from domains where id=${domainId}`;
  expect(domain!.status).toBe('verified');
  expect(domain!.dmarc_evidence.status).toBe('missing');
  const readiness = evaluateSendingReadiness(domain as never, {
    production: true,
    provider: 'postal',
    transportInstance: 'postal-a',
    evidence: {
      kind: 'received_headers',
      provenance: 'operator_attested_receiver_headers',
      transport_instance: 'postal-a',
      proof_reference: 'evidence/received',
      checked_at: new Date(Date.now() - 1000).toISOString(),
      header_from_domain: 'example.com',
      dkim_domain: 'example.com',
      dkim_pass: true,
      mail_from_domain: 'psrp.example.com',
      spf_pass: true,
      dmarc_pass: true,
    },
  });
  expect(readiness.blockers).toEqual(
    expect.arrayContaining([
      'dmarc_unverified',
      'postal_spf_unverified',
      'postal_return_path_unverified',
    ]),
  );
  await sql`update domains set next_check_at=now()`;
  resolver.resolveTxt.mockResolvedValue([]);
  await verifyDueMailDomains(sql, resolver);
  expect((await sql`select status from domains where id=${domainId}`)[0]?.status).toBe('failed');
});
it('requires ownership DKIM even for receiving-only domains and ignores Postal DNS for a named SES-only configuration', async () => {
  vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([named]));
  await sql`update domains set sending=false`;
  const resolver = dns();
  resolver.resolveTxt.mockResolvedValue([]);
  await verifyDueMailDomains(sql, resolver);
  const [domain] = await sql`select * from domains where id=${domainId}`;
  expect(domain!.status).toBe('failed');
  expect(domain!.records).toContainEqual(
    expect.objectContaining({ purpose: 'dkim', required: true }),
  );
  expect(domain!.records).not.toContainEqual(expect.objectContaining({ purpose: 'return_path' }));
  expect(domain!.records).toContainEqual(
    expect.objectContaining({ purpose: 'receiving', status: 'verified' }),
  );
});
async function proof() {
  vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([named]));
  const evidence = {
    kind: 'received_headers',
    provenance: 'operator_attested_receiver_headers',
    transport_instance: named.id,
    proof_reference: 'evidence/received',
    checked_at: new Date(Date.now() - 3600000).toISOString(),
    header_from_domain: 'example.com',
    dkim_domain: 'example.com',
    dkim_pass: true,
    mail_from_domain: 'bounce.example.com',
    spf_pass: true,
    dmarc_pass: true,
    ses: {
      identity_verified: true,
      mail_from_domain: 'bounce.example.com',
      status: 'SUCCESS',
      behavior_on_mx_failure: 'REJECT_MESSAGE',
      checked_at: new Date(Date.now() - 3600000).toISOString(),
    },
  };
  await sql`insert into domain_transport_readiness(org_id,environment_id,domain_id,transport_instance,evidence,config_fingerprint,actor_id,checked_at) values(${orgId},${environmentId},${domainId},${named.id},${sql.json(evidence)},${fingerprint},${operatorId},${new Date(evidence.checked_at)})`;
  return evidence;
}
it('refreshes SES configuration hourly without renewing received-header proof, and removes success immediately on outage', async () => {
  const original = await proof();
  const probe = vi.fn(async () => ({
    status: 'verified' as const,
    checked_at: new Date().toISOString(),
    evidence: {
      ...original.ses,
      status: 'SUCCESS' as const,
      behavior_on_mx_failure: 'REJECT_MESSAGE' as const,
      checked_at: new Date().toISOString(),
    },
  }));
  expect(await refreshSesReadiness(sql, probe)).toBe(1);
  const [current] =
    await sql`select *,provider_check_after-now() between interval '59 minutes' and interval '61 minutes' as hourly from domain_transport_readiness`;
  expect(current!.hourly).toBe(true);
  expect(current!.config_fingerprint).toBe(fingerprint);
  expect(current!.evidence.checked_at).toBe(original.checked_at);
  expect(new Date(current!.checked_at).toISOString()).toBe(original.checked_at);
  expect(current!.evidence.ses.checked_at).not.toBe(original.ses.checked_at);
  expect(await refreshSesReadiness(sql, probe)).toBe(0);
  await sql`update domain_transport_readiness set provider_check_after=now()`;
  await refreshSesReadiness(sql, async () => ({
    status: 'temporary_failure',
    checked_at: new Date().toISOString(),
    evidence: null,
  }));
  const [failed] = await sql`select * from domain_transport_readiness`;
  expect(failed!.evidence.ses).toBeUndefined();
  expect(failed!.evidence.checked_at).toBe(original.checked_at);
});
it('preserves PostgreSQL microsecond precision when completing an SES readiness claim', async () => {
  const original = await proof();
  await sql`create function test_ses_microseconds() returns trigger language plpgsql as $$
    begin
      new.provider_check_after := date_trunc('milliseconds',new.provider_check_after)+interval '123 microseconds';
      return new;
    end
  $$`;
  await sql`create trigger test_ses_microseconds before update on domain_transport_readiness for each row execute function test_ses_microseconds()`;
  try {
    expect(
      await refreshSesReadiness(sql, async () => ({
        status: 'temporary_failure',
        checked_at: new Date().toISOString(),
        evidence: null,
      })),
    ).toBe(1);
    const [row] =
      await sql`select evidence,provider_checked_at,provider_check_after-now()>interval '59 minutes' as hourly from domain_transport_readiness`;
    expect(row!.hourly).toBe(true);
    expect(row!.provider_checked_at).not.toBeNull();
    expect(row!.evidence.ses).toBeUndefined();
    expect(row!.evidence.checked_at).toBe(original.checked_at);
  } finally {
    await sql`drop trigger test_ses_microseconds on domain_transport_readiness`;
    await sql`drop function test_ses_microseconds()`;
  }
});
it('does not overwrite concurrent operator refresh or revocation during an SES probe', async () => {
  const original = await proof();
  await refreshSesReadiness(sql, async () => {
    await sql`update domain_transport_readiness set evidence=${sql.json({ ...original, proof_reference: 'evidence/new-operator-review' })},provider_check_after=now()`;
    return { status: 'temporary_failure', checked_at: new Date().toISOString(), evidence: null };
  });
  expect(
    (await sql`select evidence from domain_transport_readiness`)[0]!.evidence.proof_reference,
  ).toBe('evidence/new-operator-review');
  await refreshSesReadiness(sql, async () => {
    await sql`update domain_transport_readiness set revoked_at=now()`;
    return { status: 'temporary_failure', checked_at: new Date().toISOString(), evidence: null };
  });
  expect((await sql`select evidence from domain_transport_readiness`)[0]!.evidence.ses).toEqual(
    original.ses,
  );
});
it('never probes changed credentials against an old evidence fingerprint', async () => {
  await proof();
  vi.stubEnv('SES_FIXTURE_SECRET', 'rotated-fixture-secret');
  const probe = vi.fn();
  await refreshSesReadiness(sql, probe);
  expect(probe).not.toHaveBeenCalled();
  const [current] = await sql`select * from domain_transport_readiness`;
  expect(current!.evidence.ses).toBeUndefined();
  expect(current!.config_fingerprint).toBe(fingerprint);
});
it('keyset feedback recovery reaches all approved organizations in bounded batches despite one broken evaluation', async () => {
  const ids = Array.from({ length: 205 }, () => randomUUID()).sort();
  for (const id of ids)
    await sql`insert into organizations(id,name,slug) values(${id},'Sweep fixture',${id})`;
  await sql`update sending_policies set state='approved' where org_id<>${orgId}`;
  const visited: string[] = [];
  const evaluate = async (_sql: Sql, id: string) => {
    visited.push(id);
    if (id === ids[0]) throw new Error('Failure isolated to one organization');
  };
  const first = await sweepSendingFeedback(sql, undefined, evaluate);
  expect(first).toMatchObject({ processed: 100, failed: 1 });
  const second = await sweepSendingFeedback(sql, first.cursor, evaluate);
  expect(second.processed).toBe(100);
  const third = await sweepSendingFeedback(sql, second.cursor, evaluate);
  expect(third).toEqual({ processed: 5, failed: 0, cursor: undefined });
  expect(visited).toEqual(ids);
});
