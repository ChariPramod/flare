/** Isolated browser-contract fixture. Never imported by or deployed with a Flare service. */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { webhookSecret } from '../../packages/shared/src/webhooks.js';
import { renderText, templateSchema } from '../../packages/shared/src/audience.js';
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
const workflows = new Map<string, Record<string, unknown>>(),
  domains = new Map<string, Record<string, unknown>>(),
  emails = new Map<string, Record<string, unknown>>(),
  runs = new Map<string, Record<string, unknown>>();
const endpoints = new Map<string, Record<string, unknown>>(),
  deliveries = new Map<string, Record<string, unknown>>();
const contacts = new Map<string, Record<string, unknown>>(),
  templates = new Map<string, Record<string, unknown>>(),
  broadcasts = new Map<string, Record<string, unknown>>();
const automations = new Map<string, Record<string, unknown>>(),
  automationRuns = new Map<string, Record<string, unknown>>();
const logId = '00000000-0000-4000-8000-000000000099';
const server = createServer(async (req, res) => {
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
      workflows.clear();
      domains.clear();
      emails.clear();
      runs.clear();
      endpoints.clear();
      deliveries.clear();
      contacts.clear();
      templates.clear();
      broadcasts.clear();
      automations.clear();
      automationRuns.clear();
      return reply({ reset: true });
    }
    let text = '';
    for await (const chunk of req) text += String(chunk);
    const body = text ? JSON.parse(text) : {};
    if (path === 'auth/config') return reply({ oidc_url: null });
    if (path === 'auth/login')
      return body.email === user.email && body.password === 'browser-test-password'
        ? reply({ token, user, organizations })
        : reply({ message: 'Invalid credentials' }, 401);
    if (path === 'preferences/browser-fixture-link') {
      const contact = [...contacts.values()][0];
      if (!contact) return reply({ message: 'Not found' }, 404);
      if (method === 'PATCH') contact.unsubscribed = body.unsubscribed;
      return reply({ email: contact.email, unsubscribed: contact.unsubscribed, topics: [] });
    }
    if (req.headers.authorization !== `Bearer ${token}`)
      return reply({ message: 'Session expired' }, 401);
    if (
      req.headers['x-org-id'] !== org ||
      ![dev, prod].includes(String(req.headers['x-environment-id']))
    )
      return reply({ message: 'No tenant access' }, 403);
    const production = req.headers['x-environment-id'] === prod;
    if (path === 'auth/me')
      return reply({
        user,
        organizations,
        principal: {
          orgId: org,
          environmentId: req.headers['x-environment-id'],
          role: 'owner',
          production,
        },
      });
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
    if (path === 'emails' && method === 'POST') {
      const domain = [...domains.values()].find((d) => String(body.from).endsWith(`@${d.name}`));
      if (domain?.status !== 'verified')
        return reply({ message: 'Sender domain is not verified' }, 403);
      if (!req.headers['idempotency-key'])
        return reply({ message: 'Browser should supply an idempotency key' }, 422);
      const id = randomUUID(),
        created_at = new Date().toISOString();
      const row = {
        id,
        domain_id: domain.id,
        from: body.from,
        subject: body.subject,
        request: body,
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
      return reply({ id }, 201);
    }
    if (path === 'emails') return reply([...emails.values()]);
    if (path.startsWith('emails/')) {
      const [, id, action] = path.split('/'),
        row = emails.get(id!);
      if (!row) return reply({ message: 'Email not found' }, 404);
      if (action === 'source')
        return reply({
          source: `From: ${row.from}\r\nSubject: ${row.subject}\r\n\r\nBrowser fixture MIME`,
        });
      if (action === 'cancel') row.status = 'canceled';
      if (method === 'PATCH') row.scheduled_at = body.scheduled_at;
      return reply(row);
    }
    if (['audience-segments', 'audience-topics', 'contact-properties'].includes(path))
      return reply([]);
    if (path === 'contacts' && method === 'POST') {
      const row = {
        id: randomUUID(),
        ...body,
        properties: {},
        unsubscribed: false,
        created_at: new Date().toISOString(),
        topics: [],
      };
      contacts.set(row.id, row);
      return reply(row);
    }
    if (path === 'contacts') return reply({ data: [...contacts.values()] });
    if (path.startsWith('contacts/')) {
      const [, id, action] = path.split('/'),
        row = contacts.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (action === 'preference-link')
        return reply({ url: 'http://localhost:4310/preferences/browser-fixture-link' });
      if (method === 'PATCH') Object.assign(row, body);
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
      const row = {
        id: randomUUID(),
        ...body,
        status: 'draft',
        error: null,
        stats: { recipients: [], messages: [], events: [] },
      };
      broadcasts.set(row.id, row);
      return reply(row);
    }
    if (path === 'broadcasts') return reply([...broadcasts.values()]);
    if (path.startsWith('broadcasts/')) {
      const [, id, action] = path.split('/'),
        row = broadcasts.get(id!);
      if (!row) return reply({ message: 'Not found' }, 404);
      if (action === 'schedule') {
        row.status = 'scheduled';
        row.scheduled_at = new Date(Date.now() + 7200000).toISOString();
      }
      if (action === 'cancel') row.status = 'canceled';
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
    if (path === 'publish/diff') return reply({ workflows: [] });
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
