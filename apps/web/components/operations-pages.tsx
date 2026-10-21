'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Plus, Webhook, Copy, RefreshCw, Download, Activity, ArrowUpRight } from 'lucide-react';
import { api, useApi, useAction, date, pretty } from '../lib/api';
import {
  PageHeader,
  DataTable,
  Button,
  Badge,
  Modal,
  Field,
  ErrorBox,
  Loading,
  ConfirmButton,
  Empty,
} from './ui';
type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  disabled_reason: string | null;
};
type Delivery = {
  id: string;
  endpoint_name: string;
  event_id: string;
  type: string;
  status: string;
  attempts: number;
  created_at: string;
  error: string | null;
  payload: string;
};
function ServerPages({
  page,
  setPage,
  hasMore,
}: {
  page: number;
  setPage: (page: number) => void;
  hasMore: boolean;
}) {
  return (
    <div className="server-pages">
      <span className="small muted">Page {page}</span>
      <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </Button>
      <Button disabled={!hasMore} onClick={() => setPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}
export function WebhooksPage({ id, writable }: { id?: string; writable: boolean }) {
  const endpoints = useApi<Endpoint[]>('webhooks', 10000),
    alerts = useApi<{ id: string; message: string }[]>('operation-alerts', 10000);
  const [editing, setEditing] = useState<Endpoint | null | undefined>(),
    [secret, setSecret] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [endpoint, setEndpoint] = useState(''),
    [page, setPage] = useState(1);
  const deliveries = useApi<{ data: Delivery[] }>(
    `webhook-deliveries?limit=25&page=${page}${endpoint ? `&endpoint_id=${endpoint}` : ''}`,
    5000,
  );
  if (id?.startsWith('delivery/')) return <WebhookDetail id={id.slice(9)} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Send signed events to your applications. Every attempt has a trail."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setEditing(null)}>
            <Plus size={16} />
            Add endpoint
          </Button>
        }
      />
      <ErrorBox error={error} />
      {alerts.data?.map((alert) => (
        <div className="error-box" key={alert.id}>
          {alert.message}
        </div>
      ))}
      <DataTable
        label="Webhook endpoints"
        searchMode="local"
        loading={endpoints.isPending}
        refreshing={endpoints.isFetching && !endpoints.isPending}
        error={endpoints.error}
        onRetry={() => void endpoints.refetch()}
        onRefresh={() => void endpoints.refetch()}
        data={endpoints.data ?? []}
        columns={[
          {
            accessorKey: 'name',
            header: 'Endpoint',
            cell: ({ row }) => (
              <span className="entity-cell">
                <span className="entity-icon">
                  <Webhook size={18} />
                </span>
                <span>
                  <strong>{row.original.name}</strong>
                  <small>{row.original.url}</small>
                </span>
              </span>
            ),
          },
          {
            accessorKey: 'events',
            header: 'Events',
            cell: ({ row }) => (
              <div className="inline-tags">
                {row.original.events.map((event) => (
                  <Badge key={event}>{event}</Badge>
                ))}
              </div>
            ),
          },
          {
            accessorKey: 'enabled',
            header: 'Status',
            cell: ({ row }) => <Badge>{row.original.enabled ? 'Active' : 'Disabled'}</Badge>,
          },
          {
            id: 'actions',
            cell: ({ row }) => (
              <div className="actions">
                <Button
                  className="compact"
                  disabled={!writable}
                  onClick={() => setEditing(row.original)}
                >
                  Configure
                </Button>
                <Button
                  className="compact"
                  disabled={!writable || !row.original.enabled}
                  onClick={() => {
                    void api(`webhooks/${row.original.id}/test`, 'POST', {}).then(
                      () => deliveries.refetch(),
                      setError,
                    );
                  }}
                >
                  Test
                </Button>
                <ConfirmButton
                  className="compact"
                  disabled={!writable}
                  title="Rotate signing secret?"
                  description="New deliveries include both secrets for 24 hours. Update your receiver during that window."
                  onConfirm={async () => {
                    const result = await api<{ secret: string }>(
                      `webhooks/${row.original.id}/rotate`,
                      'POST',
                      {},
                    );
                    setSecret(result.secret);
                  }}
                >
                  Rotate secret
                </ConfirmButton>
              </div>
            ),
          },
        ]}
      />
      <div className="panel-heading section-title">
        <h2>Delivery attempts</h2>
        <select
          aria-label="Filter webhook endpoint"
          value={endpoint}
          onChange={(e) => {
            setEndpoint(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All endpoints</option>
          {endpoints.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        label="Webhook deliveries"
        searchMode="local"
        loading={deliveries.isPending}
        refreshing={deliveries.isFetching && !deliveries.isPending}
        error={deliveries.error}
        onRetry={() => void deliveries.refetch()}
        onRefresh={() => void deliveries.refetch()}
        paginate={false}
        data={deliveries.data?.data ?? []}
        columns={[
          {
            accessorKey: 'type',
            header: 'Event',
            cell: ({ row }) => (
              <Link className="strong" href={`/webhooks/delivery/${row.original.id}`}>
                {row.original.type}
              </Link>
            ),
          },
          { accessorKey: 'endpoint_name', header: 'Endpoint' },
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
          },
          { accessorKey: 'attempts', header: 'Attempts' },
          {
            accessorKey: 'created_at',
            header: 'Created',
            cell: ({ getValue }) => date(getValue()),
          },
        ]}
      />
      <ServerPages page={page} setPage={setPage} hasMore={deliveries.data?.data.length === 25} />
      <Modal
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        pending={busy}
        title={editing ? 'Configure endpoint' : 'Add a webhook endpoint'}
        description="Flare signs every request using a secret unique to this endpoint."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const form = Object.fromEntries(new FormData(e.currentTarget));
            void api<{ secret?: string }>(
              editing ? `webhooks/${editing.id}` : 'webhooks',
              editing ? 'PATCH' : 'POST',
              {
                name: form.name,
                url: form.url,
                events: String(form.events)
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
                enabled: form.enabled === 'on',
              },
            )
              .then((result) => {
                if (result.secret) setSecret(result.secret);
                setEditing(undefined);
                void endpoints.refetch();
                void alerts.refetch();
              }, setError)
              .finally(() => setBusy(false));
          }}
        >
          <Field label="Endpoint name">
            <input required name="name" defaultValue={editing?.name} />
          </Field>
          <Field label="URL">
            <input
              name="url"
              required
              type="url"
              defaultValue={editing?.url}
              placeholder="https://api.yourcompany.com/events"
            />
          </Field>
          <Field
            label="Events"
            hint="Comma-separated names or category wildcards, such as email.*, domain.verified."
          >
            <input required name="events" defaultValue={editing?.events.join(', ') ?? 'email.*'} />
          </Field>
          <label className="inline-check">
            <input type="checkbox" name="enabled" defaultChecked={editing?.enabled ?? true} />
            Enabled
          </label>
          <ErrorBox error={error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={busy}>
              Save endpoint
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(secret)}
        onOpenChange={(open) => !open && setSecret('')}
        title="Save your signing secret"
        description="Copy this into your receiver. Flare will not return it again."
      >
        <div className="secret-box">
          <code>{secret}</code>
          <button
            className="icon-button"
            aria-label="Copy signing secret"
            onClick={() => void navigator.clipboard.writeText(secret)}
          >
            <Copy size={16} />
          </button>
        </div>
        <div className="dialog-actions">
          <Button onClick={() => setSecret('')}>I’ve saved it</Button>
        </div>
      </Modal>
    </>
  );
}
function WebhookDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<
      Omit<Delivery, 'attempts'> & {
        attempts: {
          ordinal: number;
          url: string;
          status_code: number | null;
          error: string | null;
          response_excerpt: string;
          latency_ms: number;
          started_at: string;
        }[];
      }
    >(`webhook-deliveries/${id}`, 5000),
    replay = useAction(`webhook-deliveries/${id}/replay`, 'POST', false, {
      successMessage: 'Webhook replay requested',
    });
  return (
    <>
      <Link className="back-link" href="/webhooks">
        ← Webhooks
      </Link>
      <PageHeader
        title="Event delivery"
        description={id}
        actions={
          <ConfirmButton
            disabled={!writable || query.data?.status === 'delivering'}
            title="Replay this event?"
            description="Replay uses the same event ID. Your receiver may deduplicate an event it already processed."
            onConfirm={() => replay.mutateAsync({})}
          >
            <RefreshCw size={15} />
            Replay
          </ConfirmButton>
        }
      />
      <ErrorBox error={query.error || replay.error} />
      {query.data && (
        <div className="detail-grid">
          <section className="panel">
            <h2>Attempt history</h2>
            <Badge>{query.data.status}</Badge>
            <ErrorBox error={query.data.error} />
            <div className="timeline">
              {query.data.attempts.map((attempt) => (
                <div key={attempt.ordinal}>
                  <i />
                  <strong>
                    Attempt {attempt.ordinal} · {attempt.status_code ?? 'No response'}
                  </strong>
                  <small>
                    {date(attempt.started_at)} · {attempt.latency_ms ?? '—'} ms
                  </small>
                  <small>{attempt.url}</small>
                  <ErrorBox error={attempt.error} />
                  <pre>{attempt.response_excerpt || 'No response body'}</pre>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Signed payload</h2>
            <pre>{pretty(JSON.parse(query.data.payload))}</pre>
            <p className="muted small">
              The event ID and body remain unchanged across retries. The signature timestamp is
              renewed for each attempt.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
type RequestLog = {
  id: string;
  method: string;
  path: string;
  status: number;
  latency_ms: number;
  key_id: string | null;
  request_body: unknown;
  response_body: unknown;
  created_at: string;
};
export function LogsPage({ id }: { id?: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    setFilters(Object.fromEntries(new URLSearchParams(location.search)));
  }, []);
  const params = new URLSearchParams({ ...filters, limit: '25' }),
    page = Number(filters.page ?? 1),
    query = useApi<{ data: RequestLog[] }>(`logs?${params}`, 10000);
  function update(value: Record<string, string>) {
    const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => Boolean(v)));
    setFilters(clean);
    history.replaceState(null, '', `/logs?${new URLSearchParams(clean)}`);
  }
  if (id) return <LogDetail id={id} />;
  return (
    <>
      <PageHeader
        title="Request logs"
        description="Trace an API request from its ID. Credentials and large bodies are redacted."
        actions={
          <Button
            onClick={() => {
              void fetch(`/api/logs/export?${params}`)
                .then(async (response) => {
                  if (!response.ok) throw new Error('Export failed');
                  const url = URL.createObjectURL(await response.blob()),
                    link = document.createElement('a');
                  link.href = url;
                  link.download = 'flare-requests.csv';
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
                .catch(setError);
            }}
          >
            <Download size={15} />
            Export CSV
          </Button>
        }
      />
      <form
        key={JSON.stringify(filters)}
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          update({
            ...(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>),
            page: '1',
          });
        }}
      >
        <input
          aria-label="Search request ID or path"
          name="q"
          placeholder="Request ID or path…"
          defaultValue={filters.q}
          key={`q-${filters.q ?? ''}`}
        />
        <select
          aria-label="Status class"
          name="status_class"
          defaultValue={filters.status_class ?? ''}
        >
          <option value="">All statuses</option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}xx
            </option>
          ))}
        </select>
        <input
          aria-label="HTTP status code"
          name="status"
          type="number"
          min={100}
          max={599}
          placeholder="Exact code"
          defaultValue={filters.status}
        />
        <Button>Apply filters</Button>
      </form>
      <ErrorBox error={error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          label="Request logs"
          searchMode="none"
          loading={query.isPending}
          refreshing={query.isFetching && !query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRefresh={() => void query.refetch()}
          paginate={false}
          data={query.data?.data ?? []}
          columns={[
            {
              accessorKey: 'method',
              header: 'Method',
              cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
            },
            {
              accessorKey: 'path',
              header: 'Request',
              cell: ({ row }) => (
                <Link className="entity-cell" href={`/logs/${row.original.id}`}>
                  <span>
                    <strong className="mono">{row.original.path}</strong>
                    <small className="mono">{row.original.id}</small>
                  </span>
                </Link>
              ),
            },
            {
              accessorKey: 'status',
              header: 'Status',
              cell: ({ getValue }) => (
                <Badge tone={Number(getValue()) < 400 ? 'active' : 'failed'}>
                  {String(getValue())}
                </Badge>
              ),
            },
            {
              accessorKey: 'latency_ms',
              header: 'Latency',
              cell: ({ getValue }) => `${getValue()} ms`,
            },
            { accessorKey: 'created_at', header: 'Time', cell: ({ getValue }) => date(getValue()) },
          ]}
        />
      )}
      <ServerPages
        page={page}
        setPage={(next) => update({ ...filters, page: String(next) })}
        hasMore={query.data?.data.length === 25}
      />
    </>
  );
}
function LogDetail({ id }: { id: string }) {
  const query = useApi<RequestLog>(`logs/${id}`);
  return (
    <>
      <Link className="back-link" href="/logs">
        ← Request logs
      </Link>
      <PageHeader
        title={`${query.data?.method ?? ''} ${query.data?.path ?? 'Request details'}`}
        description={id}
      />
      <ErrorBox error={query.error} />
      {query.data && (
        <>
          <div className="inline-tags">
            <Badge tone={query.data.status < 400 ? 'active' : 'failed'}>{query.data.status}</Badge>
            <Badge>{query.data.latency_ms} ms</Badge>
            <span className="muted small">
              {date(query.data.created_at)} · key {query.data.key_id ?? 'User session / public'}
            </span>
          </div>
          <div className="detail-grid">
            <section className="panel">
              <h2>Request body</h2>
              <pre>{pretty(query.data.request_body)}</pre>
            </section>
            <section className="panel">
              <h2>Response body</h2>
              <pre>{pretty(query.data.response_body)}</pre>
            </section>
          </div>
        </>
      )}
    </>
  );
}
interface MetricData {
  totals: Record<string, number>;
  rates: {
    delivery: number | null;
    bounce: number | null;
    complaint: number | null;
    open: number | null;
    click: number | null;
  };
  series: Record<string, string | number>[];
  workflows: { workflow_id: string; status: string; count: number }[];
  engine: { type: string; channel: string; count: number }[];
  alerts: string[];
  basis: string;
}
const percent = (value: number | null | undefined) =>
  value == null ? '—' : `${(value * 100).toFixed(2)}%`;
export function MetricsPage() {
  const [filter, setFilter] = useState<Record<string, string>>({ days: '7' });
  useEffect(() => {
    const values = Object.fromEntries(new URLSearchParams(location.search));
    if (Object.keys(values).length) setFilter({ days: '7', ...values });
  }, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const params = new URLSearchParams(
    Object.entries(filter).filter(([key, value]) => key !== 'days' && Boolean(value)),
  );
  const days = [1, 7, 30, 90].includes(Number(filter.days)) ? Number(filter.days) : 7;
  params.set('from', new Date(now - days * 86400000).toISOString());
  params.set('to', new Date(now).toISOString());
  const query = useApi<MetricData>(`metrics?${params}`),
    domains = useApi<{ id: string; name: string }[]>('domains');
  const data = query.data;
  return (
    <>
      <PageHeader
        title="Delivery metrics"
        description="Understand delivery and engagement across your notification workspace."
        actions={
          <Button onClick={() => setNow(Date.now())}>
            <RefreshCw size={15} />
            Refresh
          </Button>
        }
      />
      <form
        key={JSON.stringify(filter)}
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<
            string,
            string
          >;
          setFilter(values);
          history.replaceState(null, '', `/metrics?${new URLSearchParams(values)}`);
        }}
      >
        <select aria-label="Time range" name="days" defaultValue={filter.days}>
          {[1, 7, 30, 90].map((n) => (
            <option key={n} value={n}>
              Last {n} day{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <select aria-label="Metric domain" name="domain_id" defaultValue={filter.domain_id ?? ''}>
          <option value="">All domains</option>
          {domains.data?.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </select>
        <select aria-label="Metric channel" name="channel" defaultValue={filter.channel ?? ''}>
          <option value="">All channels</option>
          {['email', 'in_app', 'sms', 'push', 'chat'].map((channel) => (
            <option key={channel}>{channel}</option>
          ))}
        </select>
        <input
          aria-label="Metric workflow"
          name="workflow"
          placeholder="Workflow identifier"
          defaultValue={filter.workflow}
        />
        <input
          aria-label="Tag name"
          name="tag_name"
          placeholder="Tag name"
          defaultValue={filter.tag_name}
        />
        <input
          aria-label="Tag value"
          name="tag_value"
          placeholder="Tag value"
          defaultValue={filter.tag_value}
        />
        <Button>Apply filters</Button>
      </form>
      <ErrorBox error={query.error} />
      {data?.alerts.map((alert) => (
        <div className="error-box" key={alert}>
          {alert}
        </div>
      ))}
      <div className="metric-grid">
        {[
          ['Accepted messages', data?.totals.sent],
          ['Delivered messages', data?.totals.delivered],
          ['Bounce rate', percent(data?.rates.bounce)],
          ['Complaint rate', percent(data?.rates.complaint)],
          ['Open rate', percent(data?.rates.open)],
          ['Click rate', percent(data?.rates.click)],
        ].map(([label, value]) => (
          <section className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value ?? '—'}</strong>
            <Activity size={17} />
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Email delivery over time</h2>
            <p>Unique messages by creation date, in UTC.</p>
          </div>
          <div className="chart-key">
            <span>● Accepted</span>
            <span>● Delivered</span>
          </div>
        </div>
        {data?.series.length ? (
          <div className="metrics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(value) =>
                    new Date(String(value)).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })
                  }
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(String(value)).toLocaleDateString(undefined, { timeZone: 'UTC' })
                  }
                  contentStyle={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    color: 'var(--text)',
                  }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Area
                  isAnimationActive={false}
                  dataKey="sent"
                  name="Accepted"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.09}
                />
                <Area
                  isAnimationActive={false}
                  dataKey="delivered"
                  name="Delivered"
                  stroke="var(--chart-secondary)"
                  fill="var(--chart-secondary)"
                  fillOpacity={0.09}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty title="No email activity in this range">
            Send an email or change your filters to see delivery data.
          </Empty>
        )}
        <p className="small muted">{data?.basis}</p>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <h2>Workflow triggers</h2>
          <p className="muted small">Engine acceptance is separate from delivery.</p>
          <DataTable
            label="Workflow triggers"
            searchMode="local"
            loading={query.isPending}
            refreshing={query.isFetching && !query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            onRefresh={() => void query.refetch()}
            paginate={false}
            data={data?.workflows ?? []}
            columns={[
              {
                accessorKey: 'workflow_id',
                header: 'Workflow',
                cell: ({ getValue }) => (
                  <Link href={`/workflows/${encodeURIComponent(String(getValue()))}`}>
                    {String(getValue())}
                    <ArrowUpRight size={12} />
                  </Link>
                ),
              },
              { accessorKey: 'status', header: 'Status' },
              { accessorKey: 'count', header: 'Count' },
            ]}
          />
        </section>
        <section className="panel">
          <h2>Native engine events</h2>
          <p className="muted small">
            Requires a configured Novu callback signing secret. Workflow email filters use an
            explicit <code>workflow</code> tag.
          </p>
          <DataTable
            label="Native engine events"
            searchMode="local"
            loading={query.isPending}
            refreshing={query.isFetching && !query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            onRefresh={() => void query.refetch()}
            paginate={false}
            data={data?.engine ?? []}
            columns={[
              { accessorKey: 'type', header: 'Event' },
              { accessorKey: 'channel', header: 'Channel' },
              { accessorKey: 'count', header: 'Count' },
            ]}
          />
        </section>
      </div>
    </>
  );
}
