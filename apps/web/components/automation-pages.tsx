'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Save, Zap } from 'lucide-react';
import { useApi, useAction, date, pretty } from '../lib/api';
import {
  PageHeader,
  Button,
  Field,
  Modal,
  ErrorBox,
  DataTable,
  Badge,
  Loading,
  ConfirmButton,
} from './ui';
type Step = {
  id: string;
  name: string;
  type: string;
  next?: string | null;
  then?: string | null;
  else?: string | null;
  on_timeout?: string | null;
  seconds?: number;
  timeout_seconds?: number;
  event?: string;
  from?: string;
  template_id?: string;
  template_version?: number;
  condition?: unknown;
};
type Definition = { trigger: string; entry: string; steps: Step[] };
type Automation = {
  id: string;
  identifier: string;
  name: string;
  revision: number;
  enabled: boolean;
  definition: Definition;
};
type Run = {
  id: string;
  automation_id: string;
  contact_id: string;
  email?: string;
  status: string;
  current_step: string;
  revision: number;
  next_step_at: string;
  created_at: string;
  error: string | null;
  steps?: {
    step_id: string;
    type: string;
    status: string;
    started_at: string;
    finished_at: string;
    wake_at: string;
    message_id: string | null;
    error: string | null;
  }[];
};
const initial: Definition = {
  trigger: 'contact.created',
  entry: 'wait',
  steps: [{ id: 'wait', name: 'Wait a minute', type: 'wait', seconds: 60, next: null }],
};
export function AutomationsPage({
  id,
  editable,
  writable,
}: {
  id?: string;
  editable: boolean;
  writable: boolean;
}) {
  const query = useApi<Automation[]>('automations');
  const [creating, setCreating] = useState(false),
    [error, setError] = useState<unknown>();
  const create = useAction<Automation>('automations', 'POST', false, {
      successMessage: 'Automation created',
    }),
    router = useRouter();
  if (id?.startsWith('runs/')) return <RunDetail id={id.slice(5)} writable={writable} />;
  if (id) return <AutomationDetail key={id} id={id} editable={editable} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Automations"
        description="Event-driven contact sequences with durable waits and an execution timeline."
        actions={
          <Button className="primary" disabled={!editable} onClick={() => setCreating(true)}>
            <Plus size={15} />
            Create automation
          </Button>
        }
      />
      <ErrorBox error={error} />
      <DataTable
        label="Automations"
        searchMode="local"
        loading={query.isPending}
        refreshing={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRefresh={() => void query.refetch()}
        data={query.data ?? []}
        columns={[
          {
            accessorKey: 'name',
            header: 'Automation',
            cell: ({ row }) => (
              <Link className="strong" href={`/automations/${row.original.id}`}>
                {row.original.name}
              </Link>
            ),
          },
          {
            accessorKey: 'enabled',
            header: 'Status',
            cell: ({ getValue }) => <Badge>{getValue() ? 'active' : 'paused'}</Badge>,
          },
          { accessorKey: 'definition.trigger', header: 'Trigger' },
          { accessorKey: 'revision', header: 'Revision' },
        ]}
      />
      <Modal
        open={creating}
        onOpenChange={setCreating}
        pending={create.isPending}
        title="Create automation"
        description="Start paused, configure the sequence, then enable it for new events."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fields = Object.fromEntries(new FormData(e.currentTarget));
            void create
              .mutateAsync({ ...fields, definition: initial, enabled: false })
              .then((r) => router.push(`/automations/${r.id}`), setError);
          }}
        >
          <Field label="Automation name">
            <input name="name" required maxLength={120} />
          </Field>
          <Field label="Automation identifier">
            <input name="identifier" required pattern="[a-z][a-z0-9_-]{1,99}" />
          </Field>
          <ErrorBox error={create.error} />
          <Button className="primary" disabled={create.isPending}>
            Create sequence
          </Button>
        </form>
      </Modal>
    </>
  );
}
function AutomationDetail({
  id,
  editable,
  writable,
}: {
  id: string;
  editable: boolean;
  writable: boolean;
}) {
  const query = useApi<Automation>(`automations/${id}`),
    runs = useApi<Run[]>(`automation-runs?automation_id=${id}`, 3000);
  if (query.isPending) return <Loading />;
  return (
    <>
      <ErrorBox error={query.error} />
      {query.data && (
        <SequenceEditor
          key={`${id}/${query.data.revision}`}
          value={query.data}
          editable={editable}
          writable={writable}
        />
      )}
      <section className="panel">
        <h2>Recent runs</h2>
        <RunTable
          runs={runs.data ?? []}
          loading={runs.isPending}
          refreshing={runs.isFetching && !runs.isPending}
          error={runs.error}
          onRefresh={() => void runs.refetch()}
        />
      </section>
    </>
  );
}
function SequenceEditor({
  value,
  editable,
  writable,
}: {
  value: Automation;
  editable: boolean;
  writable: boolean;
}) {
  const [name, setName] = useState(value.name),
    [enabled, setEnabled] = useState(value.enabled),
    [definition, setDefinition] = useState(value.definition),
    [selected, setSelected] = useState(value.definition.entry),
    [error, setError] = useState<unknown>(),
    [testing, setTesting] = useState(false);
  const save = useAction(`automations/${value.id}`, 'PUT'),
    event = useAction('automation-events', 'POST', false, {
      successMessage: 'Automation event accepted',
    });
  const templates = useApi<{ id: string; name: string; current_version: number }[]>('templates');
  const step = definition.steps.find((s) => s.id === selected);
  const update = (patch: Partial<Step>) =>
    setDefinition((d) => ({
      ...d,
      steps: d.steps.map((s) => (s.id === selected ? { ...s, ...patch } : s)),
    }));
  const successors = (s: Step) =>
    s.type === 'condition'
      ? [
          ['yes', s.then],
          ['no', s.else],
        ]
      : s.type === 'wait_for_event'
        ? [
            ['event', s.next],
            ['timeout', s.on_timeout],
          ]
        : [['next', s.next]];
  const edges = definition.steps.flatMap((s) =>
    successors(s)
      .filter(([, target]) => target)
      .map(([label, target]) => ({ id: `${s.id}-${label}`, source: s.id, target: target!, label })),
  );
  const nodes = definition.steps.map((s, index) => ({
    id: s.id,
    position: { x: (index % 2) * 240, y: index * 125 },
    data: { label: `${s.name} · ${s.type.replaceAll('_', ' ')}` },
    selected: s.id === selected,
    style: {
      width: 210,
      borderColor: s.id === selected ? 'var(--accent)' : 'var(--border)',
      background: 'var(--panel)',
      color: 'var(--text)',
      borderRadius: 3,
      padding: 18,
    },
  }));
  const nextField = (label: string, key: 'next' | 'then' | 'else' | 'on_timeout') => (
    <Field label={label}>
      <select
        disabled={!editable}
        value={step?.[key] ?? ''}
        onChange={(e) => update({ [key]: e.target.value || null })}
      >
        <option value="">Finish run</option>
        {definition.steps
          .filter((s) => s.id !== selected)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </Field>
  );
  function add(type: string) {
    const id = `step-${crypto.randomUUID().slice(0, 8)}`;
    const added: Step = {
      id,
      name: type.replaceAll('_', ' '),
      type,
      ...(type === 'condition'
        ? { condition: { '==': [{ var: 'event.plan' }, 'paid'] }, then: null, else: null }
        : { next: null }),
      ...(type === 'wait' ? { seconds: 60 } : {}),
      ...(type === 'wait_for_event'
        ? { event: 'purchased', timeout_seconds: 86400, on_timeout: null }
        : {}),
      ...(type === 'send_email'
        ? {
            from: '',
            template_id: templates.data?.[0]?.id ?? '',
            template_version: templates.data?.[0]?.current_version ?? 1,
          }
        : {}),
    };
    setDefinition((d) => ({
      ...d,
      steps: [
        ...d.steps.map((s) =>
          s.id === selected && s.type !== 'condition' && s.next === null ? { ...s, next: id } : s,
        ),
        added,
      ],
    }));
    setSelected(id);
  }
  return (
    <>
      <Link className="back-link" href="/automations">
        ← Automations
      </Link>
      <PageHeader
        title={value.name}
        description={`Revision ${value.revision} · running sequences retain their original definition`}
        actions={
          <>
            <Button disabled={!writable} onClick={() => setTesting(true)}>
              <Zap size={15} />
              Send test event
            </Button>
            <Button
              className="primary"
              disabled={!editable || save.isPending}
              onClick={() => {
                void save
                  .mutateAsync({ identifier: value.identifier, name, enabled, definition })
                  .catch(setError);
              }}
            >
              <Save size={15} />
              Save sequence
            </Button>
          </>
        }
      />
      <ErrorBox error={error || save.error || templates.error} />
      <section className="panel automation-meta">
        <Field label="Sequence name">
          <input value={name} readOnly={!editable} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Trigger event">
          <input
            value={definition.trigger}
            readOnly={!editable}
            onChange={(e) => setDefinition({ ...definition, trigger: e.target.value })}
          />
        </Field>
        <Field label="First step">
          <select
            disabled={!editable}
            value={definition.entry}
            onChange={(e) => setDefinition({ ...definition, entry: e.target.value })}
          >
            {definition.steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable for new events
        </label>
      </section>
      <div className="detail-grid automation-editor">
        <section className="panel">
          <div className="actions">
            {['send_email', 'wait', 'wait_for_event', 'condition'].map((kind) => (
              <Button
                key={kind}
                disabled={!editable || definition.steps.length >= 50}
                onClick={() => add(kind)}
              >
                <Plus size={13} />
                {kind.replaceAll('_', ' ')}
              </Button>
            ))}
          </div>
          <div className="automation-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={(_, node) => setSelected(node.id)}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              fitViewOptions={{ maxZoom: 1.2 }}
            >
              <Background color="var(--border)" />
              <Controls />
            </ReactFlow>
          </div>
          <p className="small muted">
            Select a step to configure it. Every step must be reachable; cycles are rejected.
          </p>
        </section>
        <section className="panel">
          {step && (
            <>
              <h2>Step settings</h2>
              <Field label="Step name">
                <input
                  value={step.name}
                  readOnly={!editable}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <p className="small muted">
                {step.id} · {step.type.replaceAll('_', ' ')}
              </p>
              {step.type === 'send_email' && (
                <>
                  <Field label="From address">
                    <input
                      value={step.from ?? ''}
                      type="email"
                      readOnly={!editable}
                      onChange={(e) => update({ from: e.target.value })}
                    />
                  </Field>
                  <Field label="Email template">
                    <select
                      disabled={!editable}
                      value={step.template_id}
                      onChange={(e) =>
                        update({
                          template_id: e.target.value,
                          template_version:
                            templates.data?.find((t) => t.id === e.target.value)?.current_version ??
                            1,
                        })
                      }
                    >
                      <option value="">Select template</option>
                      {templates.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pinned template version">
                    <input
                      type="number"
                      min={1}
                      value={step.template_version ?? 1}
                      readOnly={!editable}
                      onChange={(e) => update({ template_version: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
              {step.type === 'wait' && (
                <Field label="Wait seconds">
                  <input
                    type="number"
                    min={1}
                    max={31536000}
                    value={step.seconds ?? 60}
                    readOnly={!editable}
                    onChange={(e) => update({ seconds: Number(e.target.value) })}
                  />
                </Field>
              )}
              {step.type === 'wait_for_event' && (
                <>
                  <Field label="Wait for event">
                    <input
                      value={step.event ?? ''}
                      readOnly={!editable}
                      onChange={(e) => update({ event: e.target.value })}
                    />
                  </Field>
                  <Field label="Timeout seconds">
                    <input
                      type="number"
                      min={1}
                      max={31536000}
                      value={step.timeout_seconds ?? 86400}
                      readOnly={!editable}
                      onChange={(e) => update({ timeout_seconds: Number(e.target.value) })}
                    />
                  </Field>
                  {nextField('On timeout', 'on_timeout')}
                </>
              )}
              {step.type === 'condition' ? (
                <>
                  <ConditionInput
                    key={step.id}
                    value={step.condition}
                    editable={editable}
                    onChange={(condition) => update({ condition })}
                  />
                  {nextField('If true', 'then')}
                  {nextField('If false', 'else')}
                </>
              ) : (
                nextField(step.type === 'wait_for_event' ? 'On event' : 'Next step', 'next')
              )}
              <Button
                disabled={!editable || definition.steps.length === 1}
                onClick={() => {
                  setDefinition({
                    ...definition,
                    steps: definition.steps.filter((s) => s.id !== selected),
                  });
                  setSelected(definition.steps.find((s) => s.id !== selected)!.id);
                }}
              >
                Remove step
              </Button>
              <p className="small muted">
                After removing a step, update its incoming branches and the first step before
                saving.
              </p>
            </>
          )}
        </section>
      </div>
      <Modal
        open={testing}
        onOpenChange={setTesting}
        pending={event.isPending}
        title="Send a real test event"
        description="This starts every enabled automation matching the event in this environment and can send email."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.currentTarget));
            try {
              void event
                .mutateAsync({
                  ...body,
                  data: JSON.parse(String(body.data)),
                  external_id: crypto.randomUUID(),
                })
                .then(() => setTesting(false), setError);
            } catch (e) {
              setError(e);
            }
          }}
        >
          <Field label="Contact ID">
            <input name="contact_id" required />
          </Field>
          <Field label="Event name">
            <input name="name" required defaultValue={definition.trigger} />
          </Field>
          <Field label="Event data (JSON)">
            <textarea name="data" defaultValue="{}" rows={4} />
          </Field>
          <ErrorBox error={event.error || error} />
          <Button className="primary" disabled={event.isPending}>
            Submit event
          </Button>
        </form>
      </Modal>
    </>
  );
}
function ConditionInput({
  value,
  editable,
  onChange,
}: {
  value: unknown;
  editable: boolean;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(pretty(value)),
    [error, setError] = useState('');
  return (
    <Field
      label="Condition (JSON Logic)"
      hint={error || 'Use contact properties and event data, e.g. event.plan.'}
    >
      <textarea
        className="mono"
        rows={7}
        readOnly={!editable}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError('');
          } catch {
            onChange({ invalid_json: true });
            setError('Invalid JSON; fix the condition before saving.');
          }
        }}
      />
    </Field>
  );
}
function RunTable({
  runs,
  loading,
  refreshing,
  error,
  onRefresh,
}: {
  runs: Run[];
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  onRefresh: () => void;
}) {
  return (
    <DataTable
      label="Automation runs"
      searchMode="local"
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRetry={onRefresh}
      onRefresh={onRefresh}
      data={runs}
      columns={[
        {
          accessorKey: 'email',
          header: 'Contact',
          cell: ({ row }) => (
            <Link href={`/automations/runs/${row.original.id}`}>
              {row.original.email ?? row.original.contact_id}
            </Link>
          ),
        },
        {
          accessorKey: 'status',
          header: 'Status',
          cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
        },
        { accessorKey: 'current_step', header: 'Current step' },
        { accessorKey: 'revision', header: 'Revision' },
        {
          accessorKey: 'next_step_at',
          header: 'Next check',
          cell: ({ getValue }) => date(getValue()),
        },
      ]}
    />
  );
}
function RunDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Run>(`automation-runs/${id}`, 2000),
    cancel = useAction(`automation-runs/${id}/cancel`, 'POST', false, {
      successMessage: 'Automation cancellation requested',
    }),
    run = query.data;
  return (
    <>
      <Link className="back-link" href={run ? `/automations/${run.automation_id}` : '/automations'}>
        ← Automation
      </Link>
      <PageHeader title="Automation run" description={id} />
      <ErrorBox error={(!run && query.error) || run?.error || cancel.error} />
      {query.isPending && <Loading />}
      {run && (
        <>
          <div className="inline-tags">
            <Badge>{run.status}</Badge>
            <span>Revision {run.revision}</span>
            <Link href={`/audience/contacts/${run.contact_id}`}>Contact profile</Link>
          </div>
          <section className="panel">
            <DataTable
              label="Automation run steps"
              searchMode="none"
              loading={query.isPending}
              refreshing={query.isFetching && !query.isPending}
              error={query.error}
              onRetry={() => void query.refetch()}
              onRefresh={() => void query.refetch()}
              paginate={false}
              data={run.steps ?? []}
              columns={[
                { accessorKey: 'step_id', header: 'Step' },
                { accessorKey: 'type', header: 'Type' },
                { accessorKey: 'status', header: 'Status' },
                {
                  accessorKey: 'started_at',
                  header: 'Started',
                  cell: ({ getValue }) => date(getValue()),
                },
                {
                  accessorKey: 'wake_at',
                  header: 'Wait deadline',
                  cell: ({ getValue }) => date(getValue()),
                },
                {
                  accessorKey: 'message_id',
                  header: 'Email',
                  cell: ({ getValue }) =>
                    getValue() ? <Link href={`/emails/${getValue()}`}>Inspect email</Link> : '—',
                },
                { accessorKey: 'error', header: 'Error' },
              ]}
            />
          </section>
          {['queued', 'waiting'].includes(run.status) && (
            <ConfirmButton
              disabled={!writable}
              title="Cancel automation run?"
              description="Pending steps and emails that have not started delivery will be canceled. Active delivery may finish."
              onConfirm={async () => {
                await cancel.mutateAsync({});
              }}
            >
              Cancel run
            </ConfirmButton>
          )}
        </>
      )}
    </>
  );
}
