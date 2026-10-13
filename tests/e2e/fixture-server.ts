/** Isolated browser-contract fixture. Never imported by or deployed with a Flare service. */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
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
