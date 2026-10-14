'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Plus,
  Workflow as WorkflowIcon,
  ArrowUpRight,
  Mail,
  Bell,
  MessageSquare,
  Smartphone,
  Clock,
  Users,
  RefreshCw,
} from 'lucide-react';
import { api, useApi, useAction, date, pretty } from '../lib/api';
import type { WorkflowRow } from '../lib/api';
import { PageHeader, DataTable, Button, Badge, Modal, Field, ErrorBox, Loading, Empty } from './ui';
import { SubscriberInbox } from './subscriber-inbox';
import { JsonEditor } from './json-editor';
const icons: Record<string, typeof Mail> = {
  email: Mail,
  in_app: Bell,
  sms: MessageSquare,
  push: Smartphone,
  chat: MessageSquare,
  delay: Clock,
  digest: Clock,
  throttle: Clock,
};
export function ChannelIcon({ type }: { type: string }) {
  const Icon = icons[type] ?? WorkflowIcon;
  return (
    <span className={`channel-icon ${type}`} title={type}>
      <Icon size={15} />
    </span>
  );
}
export function Workflows({ editable }: { editable: boolean }) {
  const query = useApi<{ data: WorkflowRow[] }>('workflows?limit=100'),
    create = useAction<WorkflowRow>('workflows'),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [identifier, setIdentifier] = useState('');
  return (
    <>
      <PageHeader
        title="Workflows"
        description="Bring every notification together. Build once, reach every channel."
        actions={
          <Button className="primary" disabled={!editable} onClick={() => setOpen(true)}>
            <Plus size={16} />
            Create workflow
          </Button>
        }
      />
      <div className="section-tabs">
        <span className="selected">
          All workflows <b>{query.data?.data.length ?? 0}</b>
        </span>
        <span className="muted small">Your product’s notification logic, in one place</span>
      </div>
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          data={query.data?.data ?? []}
          searchPlaceholder="Search workflows…"
          columns={[
            {
              accessorKey: 'definition.name',
              header: 'Workflow',
              cell: ({ row }) => (
                <Link className="entity-cell" href={`/workflows/${row.original.identifier}`}>
                  <span className="entity-icon">
                    <WorkflowIcon size={19} />
                  </span>
                  <span>
                    <strong>{row.original.definition.name}</strong>
                    <small className="mono">{row.original.identifier}</small>
                  </span>
                </Link>
              ),
            },
            {
              accessorKey: 'definition.tags',
              header: 'Tags',
              cell: ({ row }) => (
                <div className="inline-tags">
                  {row.original.definition.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                  {!row.original.definition.tags.length && <span className="muted">—</span>}
                </div>
              ),
            },
            {
              header: 'Channels',
              cell: ({ row }) => (
                <div className="channel-list">
                  {[...new Set(row.original.definition.steps.map((s) => s.type))].map((type) => (
                    <ChannelIcon key={type} type={type} />
                  ))}
                  {!row.original.definition.steps.length && (
                    <span className="muted small">No steps yet</span>
                  )}
                </div>
              ),
            },
            {
              accessorKey: 'definition.active',
              header: 'Status',
              cell: ({ row }) => (
                <Badge tone={row.original.definition.active ? 'active' : 'inactive'}>
                  {row.original.definition.active ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
            {
              accessorKey: 'updated_at',
              header: 'Last updated',
              cell: ({ getValue }) => <span className="muted">{date(getValue())}</span>,
            },
            {
              id: 'open',
              cell: ({ row }) => (
                <Link
                  className="icon-button"
                  aria-label={`Open ${row.original.definition.name}`}
                  href={`/workflows/${row.original.identifier}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              ),
            },
          ]}
        />
      )}
      <div className="page-footnote">
        <WorkflowIcon size={14} />
        <span>
          A failed channel step continues the workflow. A failed action step cancels the remaining
          steps.
        </span>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Create workflow"
        description="Start with a name. You can add channels and logic in the editor."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { workflowId: identifier, name, steps: [] },
              { onSuccess: (row) => router.push(`/workflows/${row.identifier}`) },
            );
          }}
        >
          <Field label="Workflow name">
            <input
              required
              placeholder="Welcome new users"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIdentifier(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
                );
              }}
            />
          </Field>
          <Field
            label="Identifier"
            hint="Use this identifier to trigger the workflow. It cannot be changed later."
          >
            <input
              className="mono"
              required
              pattern="[a-z][a-z0-9_-]{1,99}"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </Field>
          <ErrorBox error={create.error} />
          <div className="dialog-actions">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="primary" disabled={create.isPending}>
              Create workflow
              <ArrowUpRight size={15} />
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
type Subscriber = {
  id: string;
  subscriber_id: string;
  profile: {
    firstName?: string;
    lastName?: string;
    email?: string;
    locale?: string;
    timezone?: string;
    data?: Record<string, unknown>;
  };
  created_at: string;
};
type Preferences = {
  global: Record<string, boolean>;
  workflows: {
    workflowId: string;
    name: string;
    resolved: Record<string, { enabled: boolean; why: string }>;
  }[];
};
export function Subscribers({ id, writable }: { id?: string; writable: boolean }) {
  const query = useApi<{ data: Subscriber[] }>('subscribers?limit=100'),
    create = useAction('subscribers');
  const [open, setOpen] = useState(false),
    [error, setError] = useState<unknown>();
  if (id) return <SubscriberDetail id={id} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Subscribers"
        description="The people behind every notification."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setOpen(true)}>
            <Plus size={16} />
            Add subscriber
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          data={query.data?.data ?? []}
          searchPlaceholder="Search subscribers…"
          columns={[
            {
              accessorKey: 'subscriber_id',
              header: 'Subscriber',
              cell: ({ row }) => (
                <Link
                  className="entity-cell"
                  href={`/subscribers/${encodeURIComponent(row.original.subscriber_id)}`}
                >
                  <span className="entity-icon">
                    <Users size={18} />
                  </span>
                  <span>
                    <strong>
                      {[row.original.profile.firstName, row.original.profile.lastName]
                        .filter(Boolean)
                        .join(' ') || row.original.subscriber_id}
                    </strong>
                    <small className="mono">{row.original.subscriber_id}</small>
                  </span>
                </Link>
              ),
            },
            { accessorKey: 'profile.email', header: 'Email' },
            { accessorKey: 'profile.locale', header: 'Locale' },
            { accessorKey: 'profile.timezone', header: 'Timezone' },
            {
              accessorKey: 'created_at',
              header: 'Created',
              cell: ({ getValue }) => date(getValue()),
            },
          ]}
        />
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add subscriber"
        description="Identify a subscriber using a stable ID from your product."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            create.mutate(values, { onSuccess: () => setOpen(false), onError: setError });
          }}
        >
          <Field label="Subscriber ID">
            <input required name="subscriberId" placeholder="user_123" />
          </Field>
          <div className="form-grid">
            <Field label="First name">
              <input name="firstName" />
            </Field>
            <Field label="Last name">
              <input name="lastName" />
            </Field>
          </div>
          <Field label="Email">
            <input required name="email" type="email" />
          </Field>
          <ErrorBox error={error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={create.isPending}>
              Add subscriber
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
function SubscriberDetail({ id, writable }: { id: string; writable: boolean }) {
  const profile = useApi<Subscriber>(`subscribers/${encodeURIComponent(id)}`),
    preferences = useApi<Preferences>(`subscribers/${encodeURIComponent(id)}/preferences`);
  const update = useAction(`subscribers/${encodeURIComponent(id)}/preferences`, 'PUT');
  return (
    <>
      <Link className="back-link" href="/subscribers">
        ← Subscribers
      </Link>
      <PageHeader title={profile.data?.profile.email ?? id} description={`Subscriber · ${id}`} />
      <SubscriberInbox id={id} />
      <ErrorBox error={profile.error || preferences.error || update.error} />
      <div className="detail-grid">
        <section className="panel">
          <h2>Profile</h2>
          {profile.data && (
            <dl>
              {Object.entries(profile.data.profile)
                .filter(([key]) => key !== 'data')
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
          )}
          <h3>Custom data</h3>
          <pre>{pretty(profile.data?.profile.data ?? {})}</pre>
        </section>
        <section className="panel">
          <h2>Notification preferences</h2>
          <p className="muted">
            Global preferences apply across workflows. Critical workflows always follow their
            workflow configuration.
          </p>
          <h3>Global channels</h3>
          {['in_app', 'email', 'sms', 'push', 'chat'].map((channel) => (
            <label className="preference-row" key={channel}>
              <ChannelIcon type={channel} />
              <span>{channel.replace('_', ' ')}</span>
              <input
                className="switch"
                type="checkbox"
                aria-label={`Global ${channel}`}
                checked={preferences.data?.global[channel] ?? true}
                disabled={!writable || update.isPending}
                onChange={(e) =>
                  update.mutate({
                    channels: { ...preferences.data?.global, [channel]: e.target.checked },
                  })
                }
              />
            </label>
          ))}
          {preferences.data?.workflows.map((workflow) => (
            <div className="preference-workflow" key={workflow.workflowId}>
              <h3>{workflow.name}</h3>
              {Object.entries(workflow.resolved).map(([channel, result]) => (
                <label className="preference-row" key={channel}>
                  <ChannelIcon type={channel} />
                  <span>
                    {channel.replace('_', ' ')}
                    <small>{result.why}</small>
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    aria-label={`${workflow.name} ${channel}`}
                    checked={result.enabled}
                    disabled={!writable || update.isPending}
                    onChange={(e) =>
                      update.mutate({
                        workflowId: workflow.workflowId,
                        channels: {
                          ...Object.fromEntries(
                            Object.entries(workflow.resolved).map(([key, value]) => [
                              key,
                              value.enabled,
                            ]),
                          ),
                          [channel]: e.target.checked,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
type Run = {
  id: string;
  workflow_id: string;
  transaction_id: string;
  parent_transaction_id?: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  engine?: unknown;
  engine_observation?: {
    status: 'available' | 'unavailable' | 'not_requested';
    checked_at: string | null;
  };
  cancellation_status?: 'none' | 'pending' | 'confirmed' | 'failed';
  payload?: unknown;
};
export function ActivityPage({ id }: { id?: string }) {
  const query = useApi<{ data: Run[] }>('activity?limit=100', 5000);
  return (
    <>
      <PageHeader
        title="Activity feed"
        description="Follow each workflow from trigger to delivery."
        actions={
          <Button onClick={() => void query.refetch()}>
            <RefreshCw size={15} />
            Refresh
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      {id ? (
        <RunDetail id={id} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          data={query.data?.data ?? []}
          searchPlaceholder="Search activity…"
          columns={[
            {
              accessorKey: 'workflow_id',
              header: 'Workflow',
              cell: ({ row }) => (
                <Link className="strong" href={`/activity/${row.original.id}`}>
                  {row.original.workflow_id}
                </Link>
              ),
            },
            {
              accessorKey: 'status',
              header: 'Status',
              cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
            },
            {
              accessorKey: 'transaction_id',
              header: 'Transaction',
              cell: ({ getValue }) => <span className="mono small">{String(getValue())}</span>,
            },
            { accessorKey: 'attempts', header: 'Attempts' },
            {
              accessorKey: 'created_at',
              header: 'Triggered',
              cell: ({ getValue }) => date(getValue()),
            },
          ]}
        />
      )}
    </>
  );
}
function RunDetail({ id }: { id: string }) {
  const query = useApi<Run>(`activity/${id}`, 3000);
  const transaction = query.data?.parent_transaction_id ?? query.data?.transaction_id ?? '';
  const wholeTrigger = Boolean(query.data && transaction !== query.data.transaction_id);
  const cancel = useAction(`events/trigger/${encodeURIComponent(transaction)}`, 'DELETE');
  return (
    <>
      <Link className="back-link" href="/activity">
        ← All activity
      </Link>
      <ErrorBox error={query.error || cancel.error} />
      {query.data && (
        <div className="detail-grid">
          <section className="panel">
            <h2>Run timeline</h2>
            <div className="timeline">
              <div>
                <i />
                <strong>Trigger accepted</strong>
                <small>{date(query.data.created_at)}</small>
              </div>
              <div>
                <i />
                <strong>{query.data.status}</strong>
                <small>
                  {date(query.data.updated_at)} · {query.data.attempts} attempts
                </small>
              </div>
              {query.data.status === 'canceled' && query.data.cancellation_status && (
                <div>
                  <i />
                  <strong>Engine cancellation: {query.data.cancellation_status}</strong>
                  {query.data.cancellation_status === 'pending' && (
                    <small>Flare is waiting for the engine to confirm cancellation.</small>
                  )}
                </div>
              )}
            </div>
            <ErrorBox error={query.data.error} />
            {query.data.status === 'queued' && (
              <>
                <Button onClick={() => cancel.mutate({})} disabled={cancel.isPending}>
                  {wholeTrigger ? 'Cancel trigger' : 'Cancel run'}
                </Button>
                {wholeTrigger && <p className="muted small">Cancels all runs from this trigger.</p>}
              </>
            )}
          </section>
          <section className="panel">
            <h2>Payload & engine trace</h2>
            {query.data.engine_observation?.status === 'unavailable' && (
              <p role="status">
                Engine details are temporarily unavailable. This timeline shows Flare’s saved state.
              </p>
            )}
            <pre>{pretty({ payload: query.data.payload, engine: query.data.engine })}</pre>
          </section>
        </div>
      )}
    </>
  );
}
type Topic = { id: string; key: string; name: string; subscribers: number; created_at: string };
export function Topics({ writable }: { writable: boolean }) {
  const query = useApi<{ data: Topic[] }>('topics'),
    create = useAction('topics');
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(''),
    [json, setJson] = useState('{"subscribers":["demo-subscriber"],"context":{}}'),
    [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeader
        title="Topics"
        description="Group subscribers and trigger notifications for a shared context."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setOpen(true)}>
            <Plus size={15} />
            Create topic
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      <DataTable
        data={query.data?.data ?? []}
        columns={[
          { accessorKey: 'name', header: 'Topic' },
          {
            accessorKey: 'key',
            header: 'Key',
            cell: ({ getValue }) => <code>{String(getValue())}</code>,
          },
          { accessorKey: 'subscribers', header: 'Subscriptions' },
          {
            accessorKey: 'created_at',
            header: 'Created',
            cell: ({ getValue }) => date(getValue()),
          },
          {
            id: 'manage',
            cell: ({ row }) => (
              <Button
                disabled={!writable}
                className="compact"
                onClick={() => setSelected(row.original.key)}
              >
                Manage subscriptions
              </Button>
            ),
          },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="Create topic">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(Object.fromEntries(new FormData(e.currentTarget)), {
              onSuccess: () => setOpen(false),
            });
          }}
        >
          <Field label="Name">
            <input name="name" required />
          </Field>
          <Field label="Key">
            <input name="key" required pattern="[a-zA-Z0-9_-]+" />
          </Field>
          <ErrorBox error={create.error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={create.isPending}>
              Create topic
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelected('')}
        title={`Subscriptions · ${selected}`}
        description="Provide subscriber IDs and an exact context. Context is part of subscription identity."
      >
        <JsonEditor value={json} onChange={setJson} />
        <ErrorBox error={error} />
        <div className="dialog-actions">
          {['DELETE', 'POST'].map((method) => (
            <Button
              key={method}
              onClick={() => {
                try {
                  void api(
                    `topics/${encodeURIComponent(selected)}/subscriptions`,
                    method,
                    JSON.parse(json),
                  ).then(() => {
                    void query.refetch();
                    setSelected('');
                  }, setError);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {method === 'POST' ? 'Add subscribers' : 'Remove subscribers'}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
type Integration = {
  id: string;
  name: string;
  provider: string;
  channel: string;
  active: boolean;
  is_primary: boolean;
  priority: number;
};
export function Integrations({ writable }: { writable: boolean }) {
  const query = useApi<{ data: Integration[] }>('integrations'),
    catalog = useApi<{
      channels: Record<string, { id: string; name: string; description?: string }[]>;
    }>('integrations/catalog');
  const [selection, setSelection] = useState<{
      provider: string;
      channel: string;
      name: string;
    } | null>(null),
    [credentials, setCredentials] = useState('{}'),
    [error, setError] = useState<unknown>();
  const create = useAction('integrations');
  return (
    <>
      <PageHeader
        title="Integrations store"
        description="Connect your delivery providers. Keep every channel within reach."
      />
      <ErrorBox error={query.error} />
      <DataTable
        data={query.data?.data ?? []}
        columns={[
          { accessorKey: 'name', header: 'Integration' },
          {
            accessorKey: 'channel',
            header: 'Channel',
            cell: ({ getValue }) => <ChannelIcon type={String(getValue())} />,
          },
          { accessorKey: 'provider', header: 'Provider' },
          {
            accessorKey: 'is_primary',
            header: 'Priority',
            cell: ({ row }) =>
              row.original.is_primary ? <Badge>Primary</Badge> : row.original.priority,
          },
          {
            accessorKey: 'active',
            header: 'Status',
            cell: ({ row }) => (
              <Button
                className="compact"
                disabled={!writable}
                onClick={() => {
                  void api(`integrations/${row.original.id}`, 'PUT', {
                    active: !row.original.active,
                    primary: row.original.is_primary,
                    priority: row.original.priority,
                  }).then(() => query.refetch(), setError);
                }}
              >
                {row.original.active ? 'Active' : 'Inactive'}
              </Button>
            ),
          },
        ]}
      />
      <h2 className="section-title">Available providers</h2>
      <div className="provider-grid">
        {Object.entries(catalog.data?.channels ?? {}).flatMap(([channel, providers]) =>
          providers.map((provider) => (
            <button
              key={`${channel}/${provider.id}`}
              className="provider-card"
              disabled={!writable}
              onClick={() => {
                setSelection({ channel, provider: provider.id, name: provider.name });
                setCredentials(
                  channel === 'email' ? '{"from":"notifications@yourdomain.com"}' : '{}',
                );
              }}
            >
              <ChannelIcon type={channel} />
              <h3>{provider.name}</h3>
              <p>{provider.description ?? `Connect ${channel.replace('_', ' ')} notifications`}</p>
              <span>
                Configure <ArrowUpRight size={13} />
              </span>
            </button>
          )),
        )}
      </div>
      <ErrorBox error={error} />
      <Modal
        open={Boolean(selection)}
        onOpenChange={(v) => !v && setSelection(null)}
        title={`Connect ${selection?.name}`}
        description="Credentials are encrypted and never returned in integration responses."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const form = Object.fromEntries(new FormData(e.currentTarget));
              create.mutate(
                { ...selection, ...form, credentials: JSON.parse(credentials), primary: true },
                { onSuccess: () => setSelection(null) },
              );
            } catch (error) {
              setError(error);
            }
          }}
        >
          <Field label="Name">
            <input name="name" defaultValue={selection?.name} required />
          </Field>
          <Field label="Identifier">
            <input
              name="identifier"
              placeholder="primary-email"
              pattern="[a-z][a-z0-9_-]{1,99}"
              required
            />
          </Field>
          <Field label="Credentials (JSON)">
            <JsonEditor value={credentials} onChange={setCredentials} />
          </Field>
          <ErrorBox error={create.error || error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={create.isPending}>
              Connect provider
            </Button>
          </div>
        </form>
      </Modal>
      {!catalog.data && !catalog.isPending && (
        <Empty title="Provider catalog unavailable">Check the API connection and reload.</Empty>
      )}
    </>
  );
}
