import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { sql, session, until } from './common.mjs';

// Synthetic content, real pinned Postal serializer/signature/HTTP runtime. This
// does not submit outbound mail or claim external routing/deliverability evidence.
const fixturePath = '/acceptance/postal-native.json';
try {
  const { api, org, env } = await session();
  if (process.argv[2] === 'prepare') {
    const [domain] = (await api('/domains')).filter((item) => item.name === 'acceptance.test');
    assert.equal(domain.status, 'verified');
    const fixture = {
      domainId: domain.id,
      messageId: randomUUID(),
      eventId: randomUUID(),
      recipient: 'postal-native@example.net',
      inboundRecipient: 'postal-native-envelope@acceptance.test',
      raw: 'From: incoming@example.net\r\nTo: visible@acceptance.test\r\nSubject: Native Postal acceptance\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nNative serializer preserves this body.\r\n',
    };
    // A synthetic accepted send isolates provider callbacks from outbound SMTP.
    // Completed timestamps also exclude it from the database recovery sweeper;
    // status='sent' alone still permits unfinished work to be claimed.
    await sql.begin(async (tx) => {
      await tx`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status,delivery_started_at,delivery_finished_at) values(${fixture.messageId},${org.id},${env.id},${domain.id},${sql.json({ subject: 'Native Postal callback fixture' })},'sender@acceptance.test','sent',now(),now())`;
      await tx`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${org.id},${env.id},${fixture.messageId},${fixture.recipient},'to','sent')`;
      await tx`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,recipients,finished_at) values(${org.id},${env.id},${fixture.messageId},'postal',1,'accepted',${sql.json([fixture.recipient])},now())`;
    });
    writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
    console.log('Prepared synthetic Postal callback correlation; no outbound submission.');
  } else if (process.argv[2] === 'verify') {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.equal((await api(`/emails/${fixture.messageId}`)).status, 'delivered');
    const attempts =
      await sql`select provider,status from transport_attempts where message_id=${fixture.messageId}`;
    assert.deepEqual(
      attempts.map(({ provider, status }) => ({ provider, status })),
      [{ provider: 'postal', status: 'accepted' }],
      'Callback fixture must never dispatch an additional transport attempt',
    );
    const events = await sql`select * from delivery_events where message_id=${fixture.messageId}`;
    assert.equal(events.length, 1, 'Native duplicate webhook must produce one delivery event');
    assert.equal(events[0].source, 'postal');
    assert.equal(events[0].source_id, fixture.eventId);
    assert.equal(events[0].recipient, fixture.recipient);
    let inbound;
    await until(async () => {
      [inbound] =
        await sql`select * from inbound_messages where domain_id=${fixture.domainId} and rcpt_to=${fixture.inboundRecipient}`;
      return inbound?.status === 'parsed';
    }, 'native Postal RawMessage durable parsing');
    const receipts =
      await sql`select id from inbound_messages where domain_id=${fixture.domainId} and rcpt_to=${fixture.inboundRecipient}`;
    assert.equal(receipts.length, 1, 'Native RawMessage retries must produce one receipt');
    assert.match(inbound.postal_id, /^\d+$/, 'Real Postal message IDs are numeric');
    assert.equal((await api(`/inbound/${inbound.id}`)).rcpt_to, fixture.inboundRecipient);
    assert.equal(
      Buffer.from((await api(`/inbound/${inbound.id}/raw`)).content, 'base64').toString(),
      fixture.raw,
      'Native Base64 line wrapping must preserve raw MIME bytes',
    );
    assert.equal(
      (
        await sql`select count(*)::int as n from event_outbox where type='email.received' and data->>'inbound_id'=${inbound.id}`
      )[0].n,
      1,
      'One metadata-only received event after native retries',
    );
    console.log(
      'Pinned Postal native RawMessage and delivery callbacks persisted once; envelope/raw MIME preserved. External SMTP/DNS remain unverified.',
    );
  } else {
    throw new Error('Usage: postal-native.mjs prepare|verify');
  }
} finally {
  await sql.end();
}
