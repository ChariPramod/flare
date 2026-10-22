/** Isolated browser-contract fixture. Never imported by or deployed with a Flare service. */
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { webhookSecret } from '../../packages/shared/src/webhooks.js';
import { contactSchema, renderText, templateSchema } from '../../packages/shared/src/audience.js';
import { parseContactFile } from '../../packages/platform/src/contact-import.js';
import { automationSchema } from '../../packages/shared/src/automations.js';
import { workflowSchema } from '../../packages/shared/src/workflows.js';
const org = '00000000-0000-4000-8000-000000000001',
  dev = '00000000-0000-4000-8000-000000000002',
  prod = '00000000-0000-4000-8000-000000000003';
const organizations = [
  {
    id: org,
    name: 'Browser test workspace',
    role: 'owner',
    environments: [
      { id: dev, name: 'Development' },
      { id: prod, name: 'Production' },
    ],
  },
];
const user = {
  id: randomUUID(),
  name: 'Browser Tester',
  email: 'tester@example.test',
  mfa_enabled: false,
};
const token = 'browser-contract-session';
const mfaRecovery = new Set<string>();
let operatorAllowed = false,
  operatorRevoked = false,
  operatorUntil = 0;
let fixtureRole: 'owner' | 'viewer' = 'owner';
const operatorAudit: Record<string, unknown>[] = [];
const operatorRoutes = new Map<string, Record<string, unknown>>();
const operatorEvidenceDomain = '00000000-0000-4000-8000-000000000099';
let operatorEvidence: Record<string, unknown> | null = null;
let operatorEvidenceRevoked: string | null = null;
const operatorPolicy = {
  org_id: org,
  name: 'Browser test workspace',
  state: 'pending_review',
  revision: 0,
  suspension_reason: null as string | null,
  daily_limit: 100,
  per_minute_limit: 10,
  complaint_threshold: 1,
  hard_bounce_rate: 0.05,
  hard_bounce_min: 100,
  marketing_enabled: false,
  default_traffic_class: null,
  trust_tier: 'customer',
  route_bindings: {},
  usage: { reserved: 0, sent_24h: 0 },
  feedback: { recipients_24h: 0, hard_bounces: 0, complaints: 0, unknown: 0, latest_at: null },
};
const workflows = new Map<string, Record<string, unknown>>(),
  domains = new Map<string, Record<string, unknown>>(),
  emails = new Map<string, Record<string, unknown>>(),
  runs = new Map<string, Record<string, unknown>>();
const inboundMessages = new Map<string, Record<string, unknown>>();
const inboundBodies = new Map<string, { text: string; html: string }>();
const inboundRaw = new Map<string, Buffer>();
const inboundFiles = new Map<string, { filename: string; bytes: Buffer }>();
const emailSources = new Map<string, string>();
const emailSubmissions = new Map<string, { id: string; hash: string }>();
const transferGrants = new Map<
  string,
  {
    path: string;
    method: string;
    input: Record<string, unknown>;
    environment: string;
    expires: number;
  }
>();
const transferEvents: Record<string, unknown>[] = [];
let expireNextTransfer = false;
const forwardingRules = new Map<string, Record<string, unknown>>();
const emailCapabilities = {
  attachment_max_bytes: 10 * 1024 * 1024,
  attachment_max_count: 50,
  mime_max_bytes: 25 * 1024 * 1024,
};
const endpoints = new Map<string, Record<string, unknown>>(),
  deliveries = new Map<string, Record<string, unknown>>();
const contacts = new Map<string, Record<string, unknown>>(),
  templates = new Map<string, Record<string, unknown>>(),
  broadcasts = new Map<string, Record<string, unknown>>();
const contactLists = new Map<string, { id: string; name: string; members: Set<string> }>();
const campaignRequests = new Map<string, { body: string; id: string }>();
const automations = new Map<string, Record<string, unknown>>(),
  automationRuns = new Map<string, Record<string, unknown>>();
let deadLetterRedriven = false;
const publications = new Map<string, Record<string, unknown>>();
const layouts = new Map<string, Record<string, unknown>>(),
  dictionaries = new Map<string, Record<string, string>>();
const logId = '00000000-0000-4000-8000-000000000099';
const server = createServer(async (req, res) => {
  if (req.headers.origin === 'http://localhost:4310') {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4310');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,idempotency-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const reply = (value: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  try {
    const url = new URL(req.url!, 'http://127.0.0.1'),
      path = url.pathname.replace(/^\/v1\//, ''),
      method = req.method;
    if (path === '/health') return reply({ status: 'ok' });
    if (path === '/reset') {
      operatorAllowed = false;
      operatorRevoked = false;
      fixtureRole = 'owner';
      operatorUntil = 0;
      operatorAudit.length = 0;
      operatorRoutes.clear();
      operatorEvidence = null;
      operatorEvidenceRevoked = null;
      Object.assign(operatorPolicy, {
        state: 'pending_review',
        suspension_reason: null,
        revision: 0,
        daily_limit: 100,
        per_minute_limit: 10,
        marketing_enabled: false,
        route_bindings: {},
        feedback: {
          recipients_24h: 0,
          hard_bounces: 0,
          complaints: 0,
          unknown: 0,
          latest_at: null,
        },
      });
      user.mfa_enabled = false;
      mfaRecovery.clear();
      workflows.clear();
      layouts.clear();
      publications.clear();
      deadLetterRedriven = false;
      dictionaries.clear();
      domains.clear();
      emails.clear();
      inboundMessages.clear();
      inboundBodies.clear();
      inboundRaw.clear();
      inboundFiles.clear();
      emailSources.clear();
      emailSubmissions.clear();
      transferGrants.clear();
      transferEvents.length = 0;
      expireNextTransfer = false;
      forwardingRules.clear();
      Object.assign(emailCapabilities, {
        attachment_max_bytes: 10 * 1024 * 1024,
        attachment_max_count: 50,
        mime_max_bytes: 25 * 1024 * 1024,
      });
      operatorPolicy.usage = { reserved: 0, sent_24h: 0 };
      runs.clear();
      endpoints.clear();
      deliveries.clear();
      contacts.clear();
      contactLists.clear();
      campaignRequests.clear();
      templates.clear();
      broadcasts.clear();
      automations.clear();
      automationRuns.clear();
      return reply({ reset: true });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    const body = text ? JSON.parse(text) : {};
    if (path === '/fixtures/transfer-events') return reply(transferEvents);
    if (path === '/fixtures/transfer-behavior' && method === 'POST') {
      expireNextTransfer = Boolean(body.expire_next);
      return reply({ updated: true });
    }
    if (path === '/fixtures/large-transfers' && method === 'POST') {
      const id = '00000000-0000-4000-8000-000000000188',
        attachment = '00000000-0000-4000-8000-000000000189';
      const bytes = Buffer.alloc(5 * 1024 * 1024, 97);
      inboundMessages.set(id, {
        id,
        domain_id: '00000000-0000-4000-8000-000000000087',
        mail_from: 'sender@example.test',
        rcpt_to: 'support@example.test',
        subject: 'Large incoming message',
        status: 'parsed',
        size: bytes.length,
        created_at: new Date().toISOString(),
        headers: [],
        attempts: [{ ordinal: 1, status: 'parsed' }],
        forwards: [],
        error: null,
        attachments: [{ id: attachment, filename: 'large-report.bin', size: bytes.length }],
      });
      inboundBodies.set(id, {
        text: `Large incoming body\n${'x'.repeat(5 * 1024 * 1024)}`,
        html: `<h1>Large incoming body</h1><img src="https://remote-image.invalid/pixel"><script>window.parent.compromised=true</script><p>${'x'.repeat(5 * 1024 * 1024)}</p>`,
      });
      inboundRaw.set(id, bytes);
      inboundFiles.set(attachment, { filename: 'large-report.bin', bytes });
      return reply({ id, attachment_id: attachment, size: bytes.length });
    }
    if (path === '/fixtures/email-capabilities' && method === 'POST') {
      Object.assign(emailCapabilities, body);
      return reply(emailCapabilities);
    }
    if (path === '/fixtures/inbound-pagination' && method === 'POST') {
      for (let ordinal = 1; ordinal <= 61; ordinal++) {
        const id = randomUUID();
        inboundMessages.set(id, {
          id,
          domain_id: '00000000-0000-4000-8000-000000000087',
          mail_from: `sender-${ordinal}@example.test`,
          rcpt_to: 'support@example.test',
          subject: `Received ${String(ordinal).padStart(3, '0')}`,
          status: 'parsed',
          size: 250,
          error: null,
          created_at: new Date(Date.now() - ordinal * 1000).toISOString(),
          headers: [],
          attachments: [],
          attempts: [{ ordinal: 1, status: 'parsed' }],
          forwards: [],
        });
      }
      for (let ordinal = 1; ordinal <= 31; ordinal++) {
        const id = randomUUID();
        forwardingRules.set(id, {
          id,
          domain_id: '00000000-0000-4000-8000-000000000087',
          recipient: `forward-${String(ordinal).padStart(2, '0')}@example.test`,
          sender: 'forwarding@example.test',
          destinations: ['team@example.test'],
          enabled: true,
        });
      }
      return reply({ messages: inboundMessages.size, rules: forwardingRules.size });
    }
    if (path === '/fixtures/email-outcomes' && method === 'POST') {
      const id = randomUUID(),
        at = new Date().toISOString();
      emails.set(id, {
        id,
        domain_id: randomUUID(),
        from: 'sender@example.test',
        subject: 'Uncertain provider acceptance',
        status: body.mixed ? 'bounced' : 'failed',
        delivery_started_at: at,
        scheduled_at: at,
        created_at: at,
        error: 'Provider outcome is ambiguous after worker interruption',
        request: {
          from: 'sender@example.test',
          to: body.mixed
            ? ['bounced@example.test', 'reader@example.test']
            : ['reader@example.test'],
          subject: 'Uncertain provider acceptance',
          text: 'This send must not be retried automatically.',
          attachments: [],
        },
        recipients: [
          ...(body.mixed
            ? [{ address: 'bounced@example.test', kind: 'to', status: 'bounced' }]
            : []),
          { address: 'reader@example.test', kind: 'to', status: 'failed' },
        ],
        events: [],
        attempts: [{ provider: 'postal', ordinal: 1, status: 'ambiguous', started_at: at }],
      });
      return reply({ id });
    }
    if (path === '/fixtures/email-pagination' && method === 'POST') {
      emails.clear();
      for (let ordinal = 1; ordinal <= Number(body.count ?? 26); ordinal++) {
        const id = randomUUID();
        emails.set(id, {
          id,
          domain_id: randomUUID(),
          from: 'sender@example.test',
          subject: `Page fixture ${String(ordinal).padStart(2, '0')}`,
          status: 'queued',
          created_at: new Date().toISOString(),
          scheduled_at: new Date().toISOString(),
        });
      }
      return reply({ count: emails.size });
    }
    if (path === '/fixtures/domain-readiness' && method === 'POST') {
      fixtureRole = 'viewer';
      const id = body.id ?? randomUUID();
      domains.set(id, {
        id,
        name: 'readiness.example.test',
        region: 'us-east-1',
        status: 'verified',
        ownership_status: 'verified',
        sending: true,
        receiving: false,
        open_tracking: false,
        click_tracking: false,
        tracking_subdomain: 'track',
        enforce_tls: false,
        created_at: new Date().toISOString(),
        checked_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        records: [],
        readiness: {
          environment: 'Production',
          blockers: body.route ? [] : ['approved_route_unavailable'],
          transports: body.route
            ? [
                {
                  transport_instance: 'fixture-postal',
                  provider: 'postal',
                  ready: false,
                  blockers: ['dns_evidence_stale', 'transport_evidence_missing'],
                  dkim_aligned: false,
                  spf_aligned: null,
                },
              ]
            : [],
        },
      });
      return reply({ id });
    }
    if (path === '/fixtures/sending-policy' && method === 'POST') {
      fixtureRole = body.viewer ? 'viewer' : 'owner';
      if (body.usage) operatorPolicy.usage = body.usage;
      operatorPolicy.state = body.state ?? 'suspended';
      operatorPolicy.feedback = {
        recipients_24h: 20,
        hard_bounces: 1,
        complaints: 1,
        unknown: 2,
        latest_at: null,
      };
      operatorPolicy.suspension_reason = 'Recipient feedback requires review';
      const id = randomUUID(),
        at = new Date().toISOString();
      emails.set(id, {
        id,
        domain_id: randomUUID(),
        from: 'sender@example.test',
        subject: 'Held policy fixture',
        status: 'held',
        hold_reason: 'sending_not_approved',
        next_attempt_at: at,
        scheduled_at: at,
        created_at: at,
        traffic_class: 'transactional',
        route_snapshot: { id: randomUUID(), revision: 2 },
        request: {
          from: 'sender@example.test',
          to: ['reader@example.test'],
          subject: 'Held policy fixture',
          text: 'Retained accepted message.',
          attachments: [],
        },
        recipients: [{ address: 'reader@example.test', kind: 'to', status: 'queued' }],
        events: [],
        attempts: [],
      });
      return reply({ id });
    }
    if (path === '/fixtures/operator' && method === 'POST') {
      operatorAllowed = Boolean(body.allowed);
      if (body.revoked) operatorRevoked = true;
      if (body.expired) operatorUntil = 0;
      if (body.stale) operatorPolicy.revision++;
      if (body.disabled_binding) {
        const id = randomUUID();
        operatorPolicy.state = 'approved';
        operatorPolicy.route_bindings = { transactional: { id, revision: 1 } };
        operatorRoutes.set(`${id}/1`, {
          id,
          revision: 1,
          name: 'Previously approved route',
          traffic_class: 'transactional',
          trust_tier: 'customer',
          critical: false,
          transport_instances: ['fixture-postal'],
          physical_ips: ['8.8.8.8'],
          verified_at: new Date().toISOString(),
          disabled_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }
      return reply({ org_id: org, domain_id: operatorEvidenceDomain });
    }
    if (path === '/fixtures/activity' && method === 'POST') {
      const parent = randomUUID();
      const queued = randomUUID();
      const accepted = randomUUID();
      const timestamps = {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      runs.set(queued, {
        id: queued,
        workflow_id: 'fanout-fixture',
        transaction_id: `${parent}-1`,
        parent_transaction_id: parent,
        status: 'queued',
        attempts: 1,
        cancellation_status: 'none',
        engine: null,
        engine_observation: { status: 'not_requested', checked_at: null },
        payload: { message: 'Queued child payload' },
        ...timestamps,
      });
      runs.set(accepted, {
        id: accepted,
        workflow_id: 'engine-outage-fixture',
        transaction_id: randomUUID(),
        status: 'accepted',
        attempts: 1,
        cancellation_status: 'none',
        engine: null,
        engine_observation: { status: 'unavailable', checked_at: timestamps.updated_at },
        payload: { message: 'Saved payload survives engine outage' },
        ...timestamps,
      });
      const delayed = randomUUID(),
        completed = randomUUID(),
        missing = randomUUID(),
        partial = randomUUID();
      for (const [id, state, partialEvidence] of [
        [delayed, 'pending', false],
        [completed, 'completed', false],
        [missing, 'not_found', false],
        [partial, 'pending', true],
      ] as const) {
        runs.set(id, {
          id,
          workflow_id: 'native-progress-fixture',
          transaction_id: `${parent}-${id}`,
          parent_transaction_id: parent,
          status: 'accepted',
          attempts: 1,
          cancellation_status: 'none',
          engine: [],
          payload: {},
          ...timestamps,
          engine_observation: {
            status: state === 'not_found' ? 'not_found' : 'available',
            checked_at: timestamps.updated_at,
            partial: partialEvidence,
            notifications:
              state === 'not_found'
                ? []
                : [
                    {
                      id: `native-${id}`,
                      status: state,
                      created_at: timestamps.created_at,
                      updated_at: timestamps.updated_at,
                      jobs: [
                        {
                          id: 'job',
                          type: 'delay',
                          status: state === 'pending' ? 'delayed' : 'completed',
                          created_at: timestamps.created_at,
                          updated_at: timestamps.updated_at,
                        },
                      ],
                    },
                  ],
          },
          cancellation: {
            eligible: state === 'pending' && !partialEvidence,
            transaction_id: parent,
            scope: 'trigger',
            reason: state === 'pending' && !partialEvidence ? 'pending_action' : 'unknown',
          },
        });
      }
      return reply({ queued, accepted, parent, delayed, completed, missing, partial });
    }
    if (path === 'auth/config') return reply({ oidc_url: null });
    if (path === 'auth/login') {
      if (body.email !== user.email || body.password !== 'browser-test-password')
        return reply({ message: 'Invalid credentials' }, 401);
      if (user.mfa_enabled && !mfaRecovery.delete(body.code))
        return reply({ message: 'Authenticator or recovery code required' }, 401);
      return reply({ token, user, organizations });
    }
    if (path === 'preferences/browser-fixture-link') {
      const contact = [...contacts.values()][0];
      if (!contact) return reply({ message: 'Not found' }, 404);
      if (method === 'PATCH') contact.unsubscribed = body.unsubscribed;
      return reply({ email: contact.email, unsubscribed: contact.unsubscribed, topics: [] });
    }
    const transfer = transferGrants.get(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    if (transfer) {
      if (req.headers.origin !== 'http://localhost:4310')
        return reply({ message: 'Invalid transfer origin' }, 403);
      transferEvents.push({
        kind: 'execution',
        operation: transfer.input.operation,
        body_bytes: Buffer.byteLength(text),
        idempotency_key: req.headers['idempotency-key'],
        expired: transfer.expires <= Date.now(),
      });
      if (transfer.expires <= Date.now())
        return reply({ message: 'Browser transfer expired. Retry to authorize again.' }, 401);
      if (transfer.path !== path || transfer.method !== method)
        return reply({ message: 'Transfer scope mismatch' }, 403);
      if (
        method === 'POST' &&
        (transfer.input.body_sha256 !== createHash('sha256').update(text).digest('hex') ||
          transfer.input.body_bytes !== Buffer.byteLength(text) ||
          transfer.input.idempotency_key !== req.headers['idempotency-key'])
      )
        return reply({ message: 'Transfer payload mismatch' }, 403);
      req.headers.authorization = `Bearer ${token}`;
      req.headers['x-org-id'] = org;
      req.headers['x-environment-id'] = transfer.environment;
    }
    if (req.headers.authorization !== `Bearer ${token}`)
      return reply({ message: 'Session expired' }, 401);
    if (path.startsWith('operator/')) {
      if (operatorRevoked) return reply({ message: 'Session is no longer valid' }, 401);
      if (!operatorAllowed) return reply({ message: 'Platform operator access is required' }, 403);
      if (path === 'operator/session')
        return reply({
          user,
          step_up_required: operatorUntil <= Date.now(),
          verified_until: operatorUntil > Date.now() ? new Date(operatorUntil).toISOString() : null,
        });
      if (path === 'operator/step-up') {
        if (body.code !== '654321')
          return reply({ message: 'A fresh authenticator or recovery code is required' }, 403);
        operatorUntil = Date.now() + 15 * 60000;
        return reply({ verified_until: new Date(operatorUntil).toISOString() }, 201);
      }
      if (path === 'operator/logout') {
        operatorUntil = 0;
        return reply({ success: true });
      }
      if (operatorUntil <= Date.now())
        return reply({ message: 'Recent operator MFA verification is required' }, 403);
      const evidencePath = `operator/organizations/${org}/domains/${operatorEvidenceDomain}/evidence`;
      if (path === evidencePath || path === `${evidencePath}/fixture-postal/revoke`) {
        if (method === 'POST') {
          if (body.expected_revision !== operatorPolicy.revision)
            return reply(
              { message: 'Sending policy changed; refresh before recording evidence' },
              409,
            );
          if (path.endsWith('/revoke')) operatorEvidenceRevoked = new Date().toISOString();
          else {
            if (body.evidence.header_from_domain !== 'example.test' || body.evidence.ses)
              return reply({ message: 'Invalid receiver evidence' }, 422);
            operatorEvidence = body.evidence;
            operatorEvidenceRevoked = null;
          }
          operatorPolicy.revision++;
        }
        return reply({
          domain: { id: operatorEvidenceDomain, name: 'example.test', environment: 'Development' },
          policy_revision: operatorPolicy.revision,
          evidence: [
            {
              transport_instance: 'fixture-postal',
              instance: { id: 'fixture-postal', kind: 'postal' },
              evidence: operatorEvidence,
              checked_at: operatorEvidence?.checked_at ?? null,
              revoked_at: operatorEvidenceRevoked,
              readiness: {
                ready: false,
                blockers: operatorEvidenceRevoked
                  ? ['transport_evidence_revoked']
                  : operatorEvidence
                    ? ['dns_evidence_stale']
                    : ['transport_evidence_missing'],
                dkim_aligned: operatorEvidence ? true : null,
                spf_aligned: operatorEvidence ? true : null,
              },
            },
          ],
        });
      }
      if (path === 'operator/mail-routes') {
        if (method === 'GET') return reply([...operatorRoutes.values()]);
        if (body.verified && (!body.physical_ips?.length || !body.proof_reference))
          return reply(
            { message: 'Verified routes require physical IP evidence and a proof reference' },
            403,
          );
        if (body.transport_instances.some((id: string) => id !== 'fixture-postal'))
          return reply({ message: 'Route references an unavailable real transport instance' }, 403);
        const id = body.id ?? randomUUID();
        const latest = Math.max(
          0,
          ...[...operatorRoutes.values()]
            .filter((row) => row.id === id)
            .map((row) => Number(row.revision)),
        );
        if (body.expected_revision !== latest)
          return reply({ message: 'Mail route changed; refresh before editing' }, 409);
        const row = {
          ...body,
          id,
          revision: latest + 1,
          verified_at: body.verified ? new Date().toISOString() : null,
          disabled_at: null,
          created_at: new Date().toISOString(),
        };
        operatorRoutes.set(`${id}/${row.revision}`, row);
        return reply(row, 201);
      }
      if (/^operator\/mail-routes\/[^/]+\/\d+\/disable$/.test(path)) {
        const [, , id, revision] = path.split('/');
        const row = operatorRoutes.get(`${id}/${revision}`);
        if (!row) return reply({ message: 'Mail route revision not found' }, 404);
        row.disabled_at = new Date().toISOString();
        return reply(row, 201);
      }
      if (path === 'operator/sending-policies') return reply([operatorPolicy]);
      if (path === `operator/sending-policies/${org}/audit`) return reply(operatorAudit);
      if (path === `operator/sending-policies/${org}`) {
        if (method === 'GET') return reply(operatorPolicy);
        if (body.expected_revision !== operatorPolicy.revision)
          return reply(
            { message: 'Sending policy revision changed; refresh before retrying' },
            409,
          );
        if (body.route_bindings || body.trust_tier) {
          const bindings = (body.route_bindings ?? operatorPolicy.route_bindings) as Record<
            string,
            { id: string; revision: number }
          >;
          for (const [purpose, binding] of Object.entries(bindings)) {
            const route = operatorRoutes.get(`${binding.id}/${binding.revision}`);
            if (
              !route ||
              route.disabled_at ||
              !route.verified_at ||
              route.trust_tier !== (body.trust_tier ?? operatorPolicy.trust_tier) ||
              route.traffic_class !== (purpose === 'marketing' ? 'marketing' : 'transactional') ||
              route.critical !== (purpose === 'critical')
            )
              return reply(
                {
                  message:
                    'Route binding must reference an active verified revision within the approved purpose and trust boundary',
                },
                422,
              );
          }
        }
        const { expected_revision: _revision, reason, ...updates } = body;
        Object.assign(operatorPolicy, updates, { revision: operatorPolicy.revision + 1 });
        operatorAudit.push({ action: 'sending_policy.updated', reason });
        return reply(operatorPolicy);
      }
      if (
        path === `operator/sending-policies/${org}/restore-suppression` ||
        path.startsWith(`operator/organizations/${org}/credentials/`)
      ) {
        if (body.expected_revision !== operatorPolicy.revision)
          return reply(
            { message: 'Sending policy revision changed; refresh before retrying' },
            409,
          );
        operatorPolicy.revision++;
        operatorAudit.push({
          action: path.includes('credentials')
            ? 'sending_credential.updated'
            : 'suppression.restored',
          reason: body.reason,
        });
        return reply({ success: true });
      }
      return reply({ message: 'Not found' }, 404);
    }
    if (
      req.headers['x-org-id'] !== org ||
      ![dev, prod].includes(String(req.headers['x-environment-id']))
    )
      return reply({ message: 'No tenant access' }, 403);
    const production = req.headers['x-environment-id'] === prod;
    if (path === 'browser-transfers' && method === 'POST') {
      const routes: Record<string, string> = {
        'email.send': 'emails',
        'email.detail': `emails/${body.message_id}`,
        'email.source': `emails/${body.message_id}/source`,
        'inbound.body': `inbound/${body.message_id}/body`,
        'inbound.raw': `inbound/${body.message_id}/raw`,
        'inbound.attachment': `inbound/${body.message_id}/attachments/${body.attachment_id}`,
      };
      const target = routes[body.operation];
      if (!target) return reply({ message: 'Unsupported browser transfer' }, 400);
      if (body.operation === 'email.send' && fixtureRole === 'viewer')
        return reply({ message: 'Sending is forbidden' }, 403);
      const transferToken = `fixture-transfer-${randomUUID()}`;
      const expires = Date.now() + (expireNextTransfer ? -1000 : 60000);
      expireNextTransfer = false;
      const transferMethod = body.operation === 'email.send' ? 'POST' : 'GET';
      transferGrants.set(transferToken, {
        path: target,
        method: transferMethod,
        input: body,
        environment: String(req.headers['x-environment-id']),
        expires,
      });
      transferEvents.push({ kind: 'grant', ...body });
      const binary = ['inbound.raw', 'inbound.attachment'].includes(body.operation);
      return reply({
        url: `http://127.0.0.1:4311/v1/${target}${binary ? '?format=binary' : ''}`,
        method: transferMethod,
        token: transferToken,
        expires_at: new Date(expires).toISOString(),
      });
    }
    if (path === 'auth/mfa/setup')
      return reply({ secret: 'BROWSER-CONTRACT-SETUP-KEY', uri: 'otpauth://totp/fixture' });
    if (path === 'auth/mfa/enable') {
      if (body.code !== '123456') return reply({ message: 'Invalid authenticator code' }, 400);
      user.mfa_enabled = true;
      mfaRecovery.add('browser-recovery-one');
      mfaRecovery.add('browser-recovery-two');
      return reply({ recovery_codes: [...mfaRecovery] });
    }
    if (path === 'auth/mfa/disable') {
      if (body.password !== 'browser-test-password' || !mfaRecovery.delete(body.code))
        return reply({ message: 'Invalid authenticator or recovery code' }, 400);
      user.mfa_enabled = false;
      mfaRecovery.clear();
      return reply({ disabled: true });
    }
    if (path === 'api-keys')
      return reply(
        method === 'POST'
          ? { id: randomUUID(), ...body, token: 'fl_browser_contract_key_only' }
          : [],
      );
    if (path === 'auth/me')
      return reply({
        user,
        organizations,
        principal: {
          orgId: org,
          environmentId: req.headers['x-environment-id'],
          role: fixtureRole,
          production,
        },
      });
    if (path === 'layouts') {
      if (method === 'GET') return reply([...layouts.values()]);
      const row = {
        ...body,
        id: randomUUID(),
        current_version: 1,
        versions: [{ version: 1, html: body.html, translations: body.translations }],
      };
      layouts.set(body.identifier, row);
      return reply(row);
    }
    if (path.startsWith('layouts/')) {
      const id = path.split('/')[1]!,
        row = layouts.get(id);
      if (!row) return reply({ message: 'Layout not found' }, 404);
      if (method === 'PUT') {
        const version = Number(row.current_version) + 1;
        Object.assign(row, body, {
          current_version: version,
          versions: [
            { version, html: body.html, translations: body.translations },
            ...(row.versions as unknown[]),
          ],
        });
      }
      return reply(row);
    }
    if (path.startsWith('translations/')) {
      const [, workflow, locale] = path.split('/');
      if (method === 'PUT') {
        dictionaries.set(`${workflow}/${locale}`, body);
        return reply({ locale, version: 1, entries: body });
      }
      return reply(
        [...dictionaries]
          .filter(([key]) => key.startsWith(`${workflow}/`))
          .map(([key, entries]) => ({ locale: key.split('/')[1], current_version: 1, entries })),
      );
    }
    if (path === 'content/preview')
      return reply({
        definition: body.workflow,
        resolved: {},
        dependencies: { layouts: [], templates: [], translations: [] },
      });
    if (path === 'dead-letters')
      return reply({
        data: deadLetterRedriven
          ? []
          : [
              {
                id: '00000000-0000-4000-8000-000000000088',
                kind: 'workflow',
                status: 'failed',
                error: 'Novu is not configured',
                attempts: 1,
                created_at: new Date().toISOString(),
                redrivable: true,
              },
            ],
      });
    if (path.startsWith('dead-letters/') && method === 'POST') {
      deadLetterRedriven = true;
      return reply({ status: 'pending' });
    }
    if (path === 'inbound' || path.startsWith('inbound/')) {
      const inbound = {
        id: '00000000-0000-4000-8000-000000000088',
        domain_id: '00000000-0000-4000-8000-000000000087',
        mail_from: 'sender@example.test',
        rcpt_to: 'support@example.test',
        subject: 'Support request',
        status: 'parsed',
        size: 250,
        created_at: new Date().toISOString(),
        headers: [{ key: 'subject', line: 'Subject: Support request' }],
        attachments: [
          { id: '00000000-0000-4000-8000-000000000089', filename: 'note.txt', size: 4 },
        ],
        attempts: [{ ordinal: 1, status: 'parsed' }],
        forwards: [],
        error: null,
      };
      if (path === 'layouts') {
        if (method === 'GET') return reply([...layouts.values()]);
        const row = {
          ...body,
          id: randomUUID(),
          current_version: 1,
          versions: [{ version: 1, html: body.html, translations: body.translations }],
        };
        layouts.set(body.identifier, row);
        return reply(row);
      }
      if (path.startsWith('layouts/')) {
        const id = path.split('/')[1]!,
          row = layouts.get(id);
        if (!row) return reply({ message: 'Layout not found' }, 404);
        if (method === 'PUT') {
          const version = Number(row.current_version) + 1;
          Object.assign(row, body, {
            current_version: version,
            versions: [
              { version, html: body.html, translations: body.translations },
              ...(row.versions as unknown[]),
            ],
          });
        }
        return reply(row);
      }
      if (path.startsWith('translations/')) {
        const [, workflow, locale] = path.split('/');
        if (method === 'PUT') {
          dictionaries.set(`${workflow}/${locale}`, body);
          return reply({ locale, version: 1, entries: body });
        }
        return reply(
          [...dictionaries]
            .filter(([key]) => key.startsWith(`${workflow}/`))
            .map(([key, entries]) => ({ locale: key.split('/')[1], current_version: 1, entries })),
        );
      }
      if (path === 'content/preview')
        return reply({
          definition: body.workflow,
          resolved: {},
          dependencies: { layouts: [], templates: [], translations: [] },
        });
      if (path === 'inbound') {
        const page = Number(url.searchParams.get('page') ?? 1);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const rows = inboundMessages.size ? [...inboundMessages.values()] : [inbound];
        return reply({ data: rows.slice((page - 1) * limit, page * limit) });
      }
      if (path.endsWith('/body'))
        return reply(
          inboundBodies.get(path.split('/')[1]!) ?? {
            text: 'Please help with my account.',
            html: '<h1>Support request</h1><img src="https://remote-image.invalid/pixel"><script>window.parent.compromised=true</script>',
          },
        );
      if (path.endsWith('/raw') || path.includes('/attachments/')) {
        const raw = path.endsWith('/raw');
        const file = raw
          ? {
              filename: inboundRaw.has(path.split('/')[1]!)
                ? `${path.split('/')[1]}.eml`
                : 'support.eml',
              bytes: inboundRaw.get(path.split('/')[1]!) ?? Buffer.from('note'),
            }
          : (inboundFiles.get(path.split('/')[3]!) ?? {
              filename: 'note.txt',
              bytes: Buffer.from('note'),
            });
        if (url.searchParams.get('format') === 'binary') {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          });
          res.end(file.bytes);
          return;
        }
        return reply({
          filename: file.filename,
          content_type: 'text/plain',
          content: file.bytes.toString('base64'),
        });
      }
      return reply(inboundMessages.get(path.split('/')[1]!) ?? inbound);
    }
    if (path === 'forwarding-rules') return reply([...forwardingRules.values()]);
    if (path === 'auth/logout') return reply({ success: true });
    if (path === 'environments')
      return reply(
        organizations[0]!.environments.map((e) => ({
          ...e,
          novu_configured: true,
          novu_application_id: 'browser-test-app',
          bridge_url: null,
        })),
      );
    if (path === 'workflows' && method === 'POST') {
      if (production) return reply({ message: 'Production is read-only' }, 403);
      const definition = workflowSchema.parse(body),
        row = {
          id: randomUUID(),
          identifier: definition.workflowId,
          definition,
          revision: 1,
          updated_at: new Date().toISOString(),
        };
      workflows.set(definition.workflowId, row);
      return reply(row, 201);
    }
    if (path === 'workflows') return reply({ data: [...workflows.values()], page: 1, limit: 100 });
    if (path.startsWith('workflows/')) {
      const id = decodeURIComponent(path.slice(10)),
        row = workflows.get(id);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (method === 'PUT') {
        if (production) return reply({ message: 'Production is read-only' }, 403);
        row.definition = workflowSchema.parse(body);
        row.revision = Number(row.revision) + 1;
      }
      return reply(row);
    }
    if (path === 'events/trigger') {
      const id = randomUUID(),
        transactionId = randomUUID();
      runs.set(id, {
        id,
        workflow_id: body.name,
        transaction_id: transactionId,
        status: 'accepted',
        attempts: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payload: body.payload,
        engine: { fixture: true },
      });
      return reply({ ids: [id], transactionId, status: 'queued', recipients: 1 }, 201);
    }
    if (path.startsWith('events/trigger/') && method === 'DELETE') {
      const parent = decodeURIComponent(path.slice('events/trigger/'.length));
      const matching = [...runs.values()].filter(
        (run) => (run.parent_transaction_id ?? run.transaction_id) === parent,
      );
      if (!matching.length) return reply({ message: 'Unknown parent trigger' }, 404);
      for (const run of matching) {
        run.status = 'canceled';
        if (run.cancellation) (run.cancellation as { eligible: boolean }).eligible = false;
        run.cancellation_status = 'pending';
        run.updated_at = new Date().toISOString();
      }
      return reply({ transactionId: parent, canceled: matching.length });
    }
    if (path === 'activity')
      return reply({
        data: [...runs.values()].filter(
          (r) =>
            !url.searchParams.get('transactionId') ||
            r.transaction_id === url.searchParams.get('transactionId'),
        ),
      });
    if (path.startsWith('activity/')) return reply(runs.get(path.slice(9)));
    if (path === 'domains' && method === 'POST') {
      const id = randomUUID();
      const domain = {
        id,
        ...body,
        status: 'not_started',
        sending: true,
        receiving: false,
        open_tracking: false,
        click_tracking: false,
        enforce_tls: false,
        tracking_subdomain: 'track',
        created_at: new Date().toISOString(),
        records: [
          {
            type: 'TXT',
            name: `flare._domainkey.${body.name}`,
            value: 'v=DKIM1; k=rsa; p=browser-test-fixture',
            purpose: 'dkim',
            required: true,
            status: 'pending',
          },
          {
            type: 'TXT',
            name: body.name,
            value: 'v=spf1 include:spf.example.test ~all',
            purpose: 'spf',
            required: true,
            status: 'pending',
          },
        ],
      };
      domains.set(id, domain);
      return reply(domain, 201);
    }
    if (path === 'domains') return reply([...domains.values()]);
    if (path.startsWith('domains/')) {
      const [, id, action] = path.split('/'),
        domain = domains.get(id!);
      if (!domain) return reply({ message: 'Domain not found' }, 404);
      // Verification is deterministic only in this test fixture. Live tests require real DNS.
      if (action === 'verify') {
        domain.status = 'verified';
        (domain.records as { status: string }[]).forEach((r) => (r.status = 'verified'));
      }
      if (method === 'PATCH') Object.assign(domain, body);
      return reply(domain);
    }
    if (path === 'sending-policy') return reply(operatorPolicy);
    if (path === 'email-capabilities') return reply(emailCapabilities);
    if (path === 'emails' && method === 'POST') {
      const domain = [...domains.values()].find((d) => String(body.from).endsWith(`@${d.name}`));
      if (domain?.status !== 'verified')
        return reply({ message: 'Sender domain is not verified' }, 403);
      if (!req.headers['idempotency-key'])
        return reply({ message: 'Browser should supply an idempotency key' }, 422);
      const submissionKey = `${req.headers['x-environment-id']}/${req.headers['idempotency-key']}`;
      const hash = createHash('sha256').update(text).digest('hex');
      const previous = emailSubmissions.get(submissionKey);
      if (previous)
        return previous.hash === hash
          ? reply({ id: previous.id }, 201)
          : reply({ message: 'Idempotency key conflicts with another message' }, 409);
      const id = randomUUID(),
        created_at = new Date().toISOString();
      const row = {
        id,
        domain_id: domain.id,
        from: body.from,
        subject: body.subject,
        request: {
          ...body,
          attachments: (body.attachments ?? []).map(
            (file: { filename: string; content_type: string; content?: string }) => ({
              filename: file.filename,
              content_type: file.content_type,
              size: Buffer.from(file.content ?? '', 'base64').length,
            }),
          ),
        },
        status: body.scheduled_at ? 'scheduled' : 'sent',
        scheduled_at: body.scheduled_at ?? created_at,
        created_at,
        recipients: body.to.map((address: string) => ({ address, kind: 'to', status: 'sent' })),
        events: [],
        attempts: body.scheduled_at
          ? []
          : [{ provider: 'smtp', ordinal: 1, status: 'accepted', started_at: created_at }],
      };
      emails.set(id, row);
      emailSubmissions.set(submissionKey, { id, hash });
      emailSources.set(
        id,
        `From: ${row.from}\r\nSubject: ${row.subject}\r\n\r\nBrowser fixture MIME\r\n${body.text ?? body.html ?? ''}\r\n${(body.attachments ?? []).map((file: { content?: string }) => file.content ?? '').join('\r\n')}`,
      );
      return reply({ id }, 201);
    }
    if (path === 'emails')
      return reply(
        [...emails.values()].map(
          ({
            request: _request,
            recipients: _recipients,
            events: _events,
            attempts: _attempts,
            ...metadata
          }) => metadata,
        ),
      );
    if (path.startsWith('emails/')) {
      const [, id, action] = path.split('/'),
        row = emails.get(id!);
      if (!row) return reply({ message: 'Email not found' }, 404);
      if (action === 'source')
        return reply({
          source:
            emailSources.get(id!) ??
            `From: ${row.from}\r\nSubject: ${row.subject}\r\n\r\nBrowser fixture MIME`,
        });
      if (action === 'cancel') row.status = 'canceled';
      if (row.cancellation) (row.cancellation as { eligible: boolean }).eligible = false;
      if (method === 'PATCH') row.scheduled_at = body.scheduled_at;
      return reply(row);
    }
    if (['audience-segments', 'audience-topics', 'contact-properties'].includes(path))
      return reply([]);
    if (path === 'contact-lists')
      return reply(
        [...contactLists.values()].map(({ id, name, members }) => ({
          id,
          name,
          contact_count: [...members].filter((id) => !contacts.get(id)?.deleted_at).length,
        })),
      );
    if (path === 'contacts/import' || path === 'contacts/import/preview') {
      const parsed = await parseContactFile(body.source ?? { format: 'csv', data: body.csv });
      const preview = {
        headers: parsed.headers,
        sample: parsed.rows.slice(0, 5),
        rows: parsed.rows.length,
        ...(parsed.sheets ? { sheets: parsed.sheets, sheet: parsed.sheet } : {}),
      };
      if (!body.mapping && path.endsWith('/preview')) return reply(preview);
      const mapping = body.mapping as Record<string, string>;
      if (
        !mapping ||
        !Object.values(mapping).includes('email') ||
        new Set(Object.values(mapping)).size !== Object.values(mapping).length ||
        Object.keys(mapping).some((header) => !parsed.headers.includes(header))
      )
        return reply({ message: 'Map one email column and distinct contact fields' }, 422);
      const errors: { row: number; message: string }[] = [];
      const mapped = new Map<string, ReturnType<typeof contactSchema.parse>>();
      let valid = 0,
        duplicates = 0;
      for (const [i, cells] of parsed.rows.entries()) {
        const value: Record<string, unknown> = {};
        for (const [header, target] of Object.entries(mapping)) {
          const cell = cells[parsed.headers.indexOf(header)]!.trim();
          if (target === 'unsubscribed') {
            if (cell.toLowerCase() === 'true') value.unsubscribed = true;
          } else value[target] = cell;
        }
        const result = contactSchema.safeParse(value);
        if (!result.success) {
          errors.push({
            row: parsed.rowNumbers[i]!,
            message: result.error.issues.map((issue) => issue.message).join('; '),
          });
          continue;
        }
        valid++;
        const previous = mapped.get(result.data.email);
        if (previous) {
          duplicates++;
          if (previous.unsubscribed) result.data.unsubscribed = true;
        }
        mapped.set(result.data.email, result.data);
      }
      const old = [...contacts.values()].filter((contact) => mapped.has(String(contact.email)));
      const validation = {
        valid,
        duplicates,
        errors: errors.slice(0, 50),
        error_count: errors.length,
        existing: old.filter((contact) => !contact.deleted_at).length,
        skipped_deleted: old.filter((contact) => contact.deleted_at).length,
      };
      if (path.endsWith('/preview')) return reply({ ...preview, validation });
      if (errors.length)
        return reply(
          { message: `Row ${errors[0]!.row}: ${errors[0]!.message}; no contacts imported` },
          422,
        );
      let list = body.list_id ? contactLists.get(body.list_id) : undefined;
      if (body.list_id && !list) return reply({ message: 'Contact list not found' }, 404);
      if (body.list_name) {
        list = [...contactLists.values()].find((entry) => entry.name === body.list_name);
        if (!list) {
          list = { id: randomUUID(), name: body.list_name, members: new Set() };
          contactLists.set(list.id, list);
        }
      }
      let created = 0,
        updated = 0,
        skipped_deleted = 0;
      for (const value of mapped.values()) {
        const existing = [...contacts.values()].find((contact) => contact.email === value.email);
        if (existing?.deleted_at) {
          skipped_deleted++;
          continue;
        }
        const row = {
          ...existing,
          ...value,
          id: String(existing?.id ?? randomUUID()),
          unsubscribed: Boolean(existing?.unsubscribed || value.unsubscribed),
          created_at: existing?.created_at ?? new Date().toISOString(),
          topics: [],
        };
        if (existing) updated++;
        else created++;
        contacts.set(row.id, row);
        list?.members.add(row.id);
      }
      return reply({
        imported: created + updated,
        duplicates,
        created,
        updated,
        skipped_deleted,
        list_id: list?.id ?? null,
        list_name: list?.name ?? null,
      });
    }
    if (path === 'contacts' && method === 'POST') {
      const row = {
        id: randomUUID(),
        ...body,
        properties: {},
        unsubscribed: body.unsubscribed ?? false,
        created_at: new Date().toISOString(),
        topics: [],
      };
      contacts.set(row.id, row);
      return reply(row);
    }
    if (path === 'contacts') {
      const search = (url.searchParams.get('q') ?? '').toLowerCase();
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 25)));
      const matching = [...contacts.values()]
        .filter(
          (contact) =>
            !contact.deleted_at &&
            (!url.searchParams.get('list_id') ||
              contactLists.get(url.searchParams.get('list_id')!)?.members.has(String(contact.id))),
        )
        .filter(
          (contact) =>
            String(contact.email).toLowerCase().includes(search) ||
            String(contact.first_name ?? '')
              .toLowerCase()
              .includes(search),
        )
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
      return reply({ data: matching.slice((page - 1) * limit, page * limit) });
    }
    if (path.startsWith('contacts/')) {
      const [, id, action] = path.split('/'),
        row = contacts.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (action === 'preference-link')
        return reply({ url: 'http://localhost:4310/preferences/browser-fixture-link' });
      if (method === 'PATCH') Object.assign(row, body);
      if (method === 'DELETE') {
        row.deleted_at = new Date().toISOString();
        row.unsubscribed = true;
      }
      return reply(row);
    }
    if (path === 'templates' && method === 'POST') {
      const row = {
        id: randomUUID(),
        name: body.name,
        identifier: body.identifier,
        current_version: 1,
        version: 1,
        ...templateSchema.parse(body.content),
        versions: [{ version: 1, created_at: new Date().toISOString() }],
      };
      templates.set(row.id, row);
      return reply(row);
    }
    if (path === 'templates') return reply([...templates.values()]);
    if (path === 'template-preview')
      return reply({
        subject: renderText(body.content.subject, body.variables),
        html: renderText(body.content.html, body.variables, true),
      });
    if (path.startsWith('templates/')) {
      const [, id, action] = path.split('/'),
        row = templates.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (action === 'versions') {
        Object.assign(row, body);
        row.current_version = Number(row.current_version) + 1;
        row.version = row.current_version;
        (row.versions as unknown[]).push({
          version: row.version,
          created_at: new Date().toISOString(),
        });
      }
      return reply(row);
    }
    if (path === 'broadcasts' && method === 'POST') {
      const key = String(req.headers['idempotency-key'] ?? '');
      const previous = key ? campaignRequests.get(key) : undefined;
      if (previous)
        return previous.body === text
          ? reply(broadcasts.get(previous.id))
          : reply({ message: 'Idempotency key conflicts with another campaign' }, 409);
      const campaignId = randomUUID();
      let templateId = body.template_id;
      if (body.content) {
        if (req.headers['x-environment-id'] === prod)
          return reply({ message: 'Compose campaign content in Development' }, 403);
        const template = {
          id: randomUUID(),
          name: body.name,
          identifier: `campaign-${campaignId}`,
          current_version: 1,
          version: 1,
          ...templateSchema.parse(body.content),
          text_body: body.content.text ?? null,
          versions: [{ version: 1, created_at: new Date().toISOString() }],
        };
        templates.set(template.id, template);
        templateId = template.id;
      }
      const row = {
        id: campaignId,
        ...body,
        template_id: templateId,
        template_version: body.template_version ?? 1,
        list_id: body.list_id ?? null,
        segment_id: body.segment_id ?? null,
        topic_id: body.topic_id ?? null,
        status: 'draft',
        error: null,
        stats: { recipients: [], messages: [], events: [] },
      };
      broadcasts.set(row.id, row);
      if (key) campaignRequests.set(key, { body: text, id: row.id });
      return reply(row);
    }
    if (path === 'broadcasts') return reply([...broadcasts.values()]);
    if (path.startsWith('broadcasts/')) {
      const [, id, action] = path.split('/'),
        row = broadcasts.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      const matching = [...contacts.values()].filter(
        (contact) =>
          !row.list_id || contactLists.get(String(row.list_id))?.members.has(String(contact.id)),
      );
      const eligible = matching.filter((contact) => !contact.deleted_at && !contact.unsubscribed);
      if (action === 'audience-preview')
        return reply({
          total: matching.length,
          eligible: eligible.length,
          excluded: {
            unsubscribed: matching.filter((contact) => contact.unsubscribed && !contact.deleted_at)
              .length,
            suppressed: 0,
            topic_opt_out: 0,
            deleted: matching.filter((contact) => contact.deleted_at).length,
          },
          sample: eligible.slice(0, 5).map((contact) => ({
            id: contact.id,
            email: contact.email,
            first_name: contact.first_name ?? '',
            last_name: contact.last_name ?? '',
          })),
          snapshot: row.status !== 'draft',
        });
      if (method === 'PATCH') {
        if (row.status !== 'draft') return reply({ message: 'Only drafts can be edited' }, 409);
        if (body.content) {
          const template = templates.get(String(row.template_id))!;
          Object.assign(template, templateSchema.parse(body.content), {
            text_body: body.content.text ?? null,
            version: Number(template.current_version) + 1,
            current_version: Number(template.current_version) + 1,
          });
          Object.assign(row, body, { template_version: template.current_version });
        } else Object.assign(row, body);
      }
      if (action === 'schedule') {
        if (!eligible.length)
          return reply({ message: 'No eligible contacts in this audience' }, 422);
        row.status = 'scheduled';
        row.scheduled_at = body.scheduled_at ?? new Date().toISOString();
      }
      if (action === 'cancel') row.status = 'canceled';
      if (row.cancellation) (row.cancellation as { eligible: boolean }).eligible = false;
      return reply(row);
    }
    if (path === 'automations' && method === 'POST') {
      const row = {
        id: randomUUID(),
        ...body,
        definition: automationSchema.parse(body.definition),
        revision: 1,
      };
      automations.set(row.id, row);
      return reply(row);
    }
    if (path === 'automations') return reply([...automations.values()]);
    if (path.startsWith('automations/')) {
      const row = automations.get(path.split('/')[1]!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (method === 'PUT')
        Object.assign(row, body, {
          definition: automationSchema.parse(body.definition),
          revision: Number(row.revision) + 1,
        });
      return reply(row);
    }
    if (path === 'automation-events') {
      for (const a of automations.values()) {
        const definition = automationSchema.parse(a.definition);
        if (!a.enabled || definition.trigger !== body.name) continue;
        const step = definition.steps.find((s) => s.id === definition.entry)!;
        const row = {
          id: randomUUID(),
          automation_id: a.id,
          contact_id: body.contact_id,
          email: 'test@example.test',
          revision: a.revision,
          current_step: step.id,
          status: 'waiting',
          next_step_at: new Date(Date.now() + 60000).toISOString(),
          steps: [
            {
              step_id: step.id,
              type: step.type,
              status: 'waiting',
              started_at: new Date().toISOString(),
              wake_at: new Date(Date.now() + 60000).toISOString(),
            },
          ],
        };
        automationRuns.set(row.id, row);
      }
      return reply({ id: randomUUID() });
    }
    if (path === 'automation-runs')
      return reply(
        [...automationRuns.values()].filter(
          (r) =>
            !url.searchParams.get('automation_id') ||
            r.automation_id === url.searchParams.get('automation_id'),
        ),
      );
    if (path.startsWith('automation-runs/')) {
      const [, id, action] = path.split('/'),
        row = automationRuns.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (action === 'cancel') row.status = 'canceled';
      if (row.cancellation) (row.cancellation as { eligible: boolean }).eligible = false;
      return reply(row);
    }
    if (path === 'operation-alerts') return reply([]);
    if (path === 'webhooks' && method === 'POST') {
      const row = { id: randomUUID(), ...body, disabled_reason: null };
      endpoints.set(row.id, row);
      return reply({ ...row, secret: webhookSecret() }, 201);
    }
    if (path === 'webhooks') return reply([...endpoints.values()]);
    if (path.startsWith('webhooks/')) {
      const [, id, action] = path.split('/'),
        row = endpoints.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (method === 'PATCH') Object.assign(row, body);
      if (action === 'rotate') return reply({ secret: webhookSecret() });
      if (action === 'test') {
        const event = randomUUID(),
          delivery = randomUUID(),
          created_at = new Date().toISOString();
        deliveries.set(delivery, {
          id: delivery,
          endpoint_id: id,
          endpoint_name: row.name,
          event_id: event,
          type: 'webhook.test',
          status: 'delivered',
          attempts: 1,
          replays: 0,
          created_at,
          payload: JSON.stringify({
            id: event,
            type: 'webhook.test',
            data: { message: 'Browser fixture delivery' },
          }),
          history: [
            {
              ordinal: 1,
              url: row.url,
              status_code: 204,
              response_excerpt: '',
              latency_ms: 12,
              started_at: created_at,
            },
          ],
        });
        return reply({ id: event });
      }
      return reply(row);
    }
    if (path === 'webhook-deliveries') return reply({ data: [...deliveries.values()] });
    if (path.startsWith('webhook-deliveries/')) {
      const [, id, action] = path.split('/'),
        row = deliveries.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (action === 'replay') {
        row.replays = Number(row.replays) + 1;
        return reply({ id, replayed: true });
      }
      return reply({ ...row, attempts: row.history });
    }
    const log = {
      id: logId,
      method: 'POST',
      path: '/v1/webhooks',
      status: 201,
      latency_ms: 9,
      key_id: null,
      created_at: new Date().toISOString(),
      request_body: { body: { name: 'Production receiver' } },
      response_body: { secret: '[REDACTED]' },
    };
    if (path === 'logs/export') {
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      return res.end('id,method,path,status\r\n' + logId + ',POST,/v1/webhooks,201');
    }
    if (path === 'logs')
      return reply({
        data:
          (!url.searchParams.get('status') || url.searchParams.get('status') === '201') &&
          (!url.searchParams.get('q') || log.path.includes(url.searchParams.get('q')!))
            ? [log]
            : [],
      });
    if (path.startsWith('logs/')) return reply(log);
    if (path === 'metrics')
      return reply({
        totals: { sent: 12, delivered: 11 },
        rates: { bounce: 1 / 12, complaint: 0, open: 0.5, click: 0.25 },
        alerts: ['Bounce rate exceeds 4%.'],
        series: [
          { day: '2026-10-11', sent: 5, delivered: 5 },
          { day: '2026-10-12', sent: 7, delivered: 6 },
        ],
        workflows: [],
        engine: [],
        basis: 'Browser contract fixture; production computes from stored delivery events.',
      });
    if (path === 'publish/diff')
      return reply({
        diff_token: 'a'.repeat(64),
        workflows: [...workflows.values()].map((w) => ({
          identifier: w.identifier,
          development: w.definition,
          production: null,
          dependencies: { layouts: [], templates: [], translations: [] },
        })),
        layouts: [...layouts.values()].map((l) => ({
          identifier: l.identifier,
          development: l,
          production: null,
        })),
        translations: [],
        automations: [...automations.values()].map((a) => ({
          identifier: a.identifier,
          development: a,
          production: null,
          dependencies: { layouts: [], templates: [], translations: [] },
        })),
      });
    if (path === 'publish') {
      const id = randomUUID(),
        items = ['workflows', 'layouts', 'translations', 'automations'].flatMap((kind) =>
          (body[kind] ?? []).map((identifier: string) => ({
            id: randomUUID(),
            kind:
              kind === 'workflows'
                ? 'workflow'
                : kind === 'layouts'
                  ? 'layout'
                  : kind === 'automations'
                    ? 'automation'
                    : 'translation',
            identifier,
            status: 'completed',
            attempts: 1,
            error: null,
          })),
        );
      publications.set(id, {
        id,
        status: 'completed',
        items,
        created_at: new Date().toISOString(),
        error: null,
      });
      return reply({ id, status: 'pending' });
    }
    if (path === 'publications') return reply([...publications.values()]);
    if (path.startsWith('publications/'))
      return reply(
        publications.get(path.split('/')[1]!) ?? {},
        publications.has(path.split('/')[1]!) ? 200 : 404,
      );
    return reply({ message: `No browser fixture for ${method} ${path}` }, 404);
  } catch (error) {
    reply({ message: error instanceof Error ? error.message : String(error) }, 400);
  }
});
server.listen(4311, '127.0.0.1', () =>
  process.stdout.write('Browser API contract fixture: http://127.0.0.1:4311\n'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => server.close(() => process.exit(0)));
