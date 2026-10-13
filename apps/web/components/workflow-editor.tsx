'use client';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Plus,
  Play,
  Save,
  ArrowLeft,
  Trash2,
  ChevronUp,
  ChevronDown,
  Zap,
  Check,
  Settings2,
  Braces,
  Eye,
} from 'lucide-react';
import { api, useApi, useAction, pretty, date } from '../lib/api';
import type { Workflow, WorkflowRow } from '../lib/api';
import { Button, Badge, Modal, Field, ErrorBox, Loading, Empty } from './ui';
import { ChannelIcon } from './workflow-pages';
import { JsonEditor } from './json-editor';
type Step = Workflow['steps'][number];
type StepNodeData = {
  label: string;
  kind: string;
  active: boolean;
  index: number;
  editable: boolean;
  select: () => void;
  add: () => void;
};
function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  return (
    <div className={`flow-step ${data.active ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <button className="step-select" onClick={data.select}>
        <ChannelIcon type={data.kind} />
        <span>
          <small>
            STEP {data.index + 1} · {data.kind.replace('_', ' ').toUpperCase()}
          </small>
          <strong>{data.label}</strong>
        </span>
        <Settings2 size={14} />
      </button>
      <Handle type="source" position={Position.Bottom} />
      {data.editable && (
        <button className="flow-add" aria-label={`Add step after ${data.label}`} onClick={data.add}>
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}
const nodeTypes = { step: StepNode };
const kinds = [
  ['in_app', 'In-app', 'Reach people inside your product.'],
  ['email', 'Email', 'Send a message to their inbox.'],
  ['sms', 'SMS', 'Keep it brief and timely.'],
  ['push', 'Push', 'Deliver a mobile notification.'],
  ['chat', 'Chat', 'Reach a team where they work.'],
  ['delay', 'Delay', 'Wait before the next step.'],
  ['digest', 'Digest', 'Combine events into one notification.'],
  ['throttle', 'Throttle', 'Limit notification frequency.'],
  ['http_request', 'HTTP request', 'Call an endpoint.'],
];
export function WorkflowEditor({ id, editable }: { id: string; editable: boolean }) {
  const layouts =
    useApi<{ identifier: string; name: string; current_version: number }[]>('layouts');
  const query = useApi<WorkflowRow>(`workflows/${encodeURIComponent(id)}`),
    save = useAction<WorkflowRow>(`workflows/${encodeURIComponent(id)}`, 'PUT');
  const [workflow, setWorkflow] = useState<Workflow | null>(null),
    [selected, setSelected] = useState(0),
    [insertAt, setInsertAt] = useState<number | null>(null),
    [testing, setTesting] = useState(false),
    [settings, setSettings] = useState(false),
    [error, setError] = useState<unknown>(),
    [preview, setPreview] = useState(false),
    [previewLocale, setPreviewLocale] = useState('en_US'),
    [compiledPreview, setCompiledPreview] = useState<Workflow | null>(null),
    [invalidEditors, setInvalidEditors] = useState<Record<string, boolean>>({});
  const valid = (editor: string, ok: boolean) =>
    setInvalidEditors((previous) => ({ ...previous, [editor]: !ok }));
  const invalidJson = Object.values(invalidEditors).some(Boolean);
  useEffect(() => {
    if (query.data && !workflow) setWorkflow(query.data.source_definition ?? query.data.definition);
  }, [query.data, workflow]);
  const dirty = Boolean(
    workflow &&
    query.data &&
    JSON.stringify(workflow) !==
      JSON.stringify(query.data.source_definition ?? query.data.definition),
  );
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const nodes = useMemo(
    () => [
      {
        id: 'trigger',
        position: { x: 140, y: 0 },
        data: {
          label: (
            <div className="trigger-node">
              <Zap size={15} />
              Workflow trigger
            </div>
          ),
        },
        style: {
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          borderRadius: 9,
          width: 240,
          color: 'var(--text)',
        },
        sourcePosition: Position.Bottom,
      },
      ...(workflow?.steps.map((step, index) => ({
        id: step.stepId,
        type: 'step',
        position: { x: 100, y: 130 + index * 165 },
        data: {
          label: step.name,
          kind: step.type,
          index,
          active: index === selected,
          editable,
          select: () => setSelected(index),
          add: () => setInsertAt(index + 1),
        },
      })) ?? []),
      {
        id: 'end',
        position: { x: 190, y: 145 + (workflow?.steps.length ?? 0) * 165 },
        data: { label: 'End workflow' },
        targetPosition: Position.Top,
        style: {
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          borderRadius: 30,
          width: 140,
          fontSize: 11,
          color: 'var(--muted)',
        },
      },
    ],
    [workflow, selected, editable],
  );
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${node.id}`,
    source: nodes[index]!.id,
    target: node.id,
    type: 'smoothstep',
    style: { stroke: '#c6cbd2', strokeWidth: 1.5 },
  }));
  if (query.isPending || !workflow)
    return (
      <>
        <ErrorBox error={query.error} />
        {query.isPending ? <Loading /> : null}
      </>
    );
  const step = workflow.steps[selected];
  const change = (value: Partial<Step>) =>
    setWorkflow({
      ...workflow,
      steps: workflow.steps.map((item, index) =>
        index === selected ? { ...item, ...value } : item,
      ),
    });
  const move = (direction: number) => {
    const steps = [...workflow.steps];
    const at = selected + direction;
    if (at < 0 || at >= steps.length) return;
    [steps[selected], steps[at]] = [steps[at]!, steps[selected]!];
    setWorkflow({ ...workflow, steps });
    setSelected(at);
  };
  return (
    <>
      <div className="editor-heading">
        <div className="editor-title">
          <Link className="icon-button" href="/workflows" aria-label="Back to workflows">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1>{workflow.name}</h1>
            <code>{workflow.workflowId}</code>
          </div>
          <Badge tone={workflow.active ? 'active' : 'inactive'}>
            {workflow.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="actions">
          <span className="muted small">
            {dirty ? 'Unsaved changes' : `Revision ${query.data?.revision ?? 1}`}
          </span>
          <Button className="compact" onClick={() => setSettings(true)}>
            <Settings2 size={15} />
            Settings
          </Button>
          <Button className="compact" onClick={() => setTesting(true)}>
            <Play size={14} />
            Test workflow
          </Button>
          <Button
            className="primary compact"
            disabled={!editable || !dirty || save.isPending || invalidJson}
            onClick={() =>
              save.mutate(workflow, {
                onSuccess: (row) => setWorkflow(row.source_definition ?? row.definition),
              })
            }
          >
            <Save size={14} />
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
      <ErrorBox error={query.error || save.error || error} />
      {!editable && (
        <div className="readonly-banner">
          This workflow is read-only. Make changes in Development and publish them to Production.
        </div>
      )}
      <div className="workflow-workspace">
        <div className="flow-canvas">
          <div className="canvas-toolbar">
            <span>
              <span className="status-dot development" />
              Workflow canvas
            </span>
            <Button className="compact" disabled={!editable} onClick={() => setInsertAt(0)}>
              <Plus size={14} />
              Add first step
            </Button>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            minZoom={0.35}
            maxZoom={1.5}
          >
            <Background gap={20} size={1} color="#cbd0d7" />
            <Controls showInteractive={false} />
          </ReactFlow>
          <div className="canvas-legend">
            <span>
              <i className="legend-channel" />
              Channel step
            </span>
            <span>
              <i className="legend-action" />
              Action step
            </span>
          </div>
        </div>
        <aside className="step-panel">
          {step ? (
            <>
              <div className="step-panel-heading">
                <ChannelIcon type={step.type} />
                <div>
                  <strong>{step.name}</strong>
                  <small>{step.type.replace('_', ' ')} step</small>
                </div>
                <div className="actions">
                  <button
                    className="icon-button"
                    aria-label="Move step up"
                    disabled={!editable || selected === 0}
                    onClick={() => move(-1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move step down"
                    disabled={!editable || selected === workflow.steps.length - 1}
                    onClick={() => move(1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
              <Tabs.Root key={step.stepId} defaultValue="configure">
                <Tabs.List className="step-tabs">
                  <Tabs.Trigger value="configure">Configure</Tabs.Trigger>
                  <Tabs.Trigger value="content">Content</Tabs.Trigger>
                  <Tabs.Trigger value="conditions">Conditions</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="configure" className="step-content">
                  <Field label="Step name">
                    <input
                      value={step.name}
                      disabled={!editable}
                      onChange={(e) => change({ name: e.target.value })}
                    />
                  </Field>
                  <Field label="Step identifier">
                    <input
                      className="mono"
                      value={step.stepId}
                      disabled={!editable}
                      onChange={(e) => change({ stepId: e.target.value })}
                    />
                  </Field>
                  <div className="step-hint">
                    <strong>On failure</strong>
                    <p>
                      {['delay', 'digest', 'throttle', 'http_request'].includes(step.type)
                        ? 'A failed action cancels every remaining step.'
                        : 'A failed channel step is recorded and the workflow continues.'}
                    </p>
                  </div>
                  <Field label="Channel enabled">
                    <select
                      disabled={
                        !editable || !['email', 'in_app', 'sms', 'push', 'chat'].includes(step.type)
                      }
                      value={String(workflow.preferences[step.type] ?? true)}
                      onChange={(e) =>
                        setWorkflow({
                          ...workflow,
                          preferences: {
                            ...workflow.preferences,
                            [step.type]: e.target.value === 'true',
                          },
                        })
                      }
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </Field>
                  <Button
                    className="danger compact"
                    disabled={!editable}
                    onClick={() => {
                      setWorkflow({
                        ...workflow,
                        steps: workflow.steps.filter((_, index) => index !== selected),
                      });
                      setSelected(Math.max(0, selected - 1));
                    }}
                  >
                    <Trash2 size={14} />
                    Remove step
                  </Button>
                </Tabs.Content>
                <Tabs.Content value="content" className="step-content">
                  <p className="muted small">
                    Edit the channel content and control values passed to Novu. Use Liquid variables
                    such as {'{{subscriber.firstName}}'}.
                  </p>
                  {step.type === 'email' && (
                    <Field label="Email layout">
                      <select
                        disabled={!editable}
                        value={String(step.controlValues.layoutIdentifier ?? '')}
                        onChange={(e) => {
                          const {
                            layoutIdentifier: _layout,
                            layoutVersion: _version,
                            ...controls
                          } = step.controlValues;
                          const layout = layouts.data?.find((v) => v.identifier === e.target.value);
                          change({
                            controlValues: layout
                              ? {
                                  ...controls,
                                  layoutIdentifier: layout.identifier,
                                  layoutVersion: layout.current_version,
                                }
                              : controls,
                          });
                        }}
                      >
                        <option value="">No layout</option>
                        {layouts.data?.map((v) => (
                          <option key={v.identifier} value={v.identifier}>
                            {v.name} · latest v{v.current_version}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {step.type === 'email' && step.controlValues.layoutIdentifier !== undefined && (
                    <Field label="Pinned layout version">
                      <input
                        type="number"
                        min="1"
                        disabled={!editable}
                        value={Number(step.controlValues.layoutVersion ?? 1)}
                        onChange={(e) =>
                          change({
                            controlValues: {
                              ...step.controlValues,
                              layoutVersion: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                  )}
                  <ControlEditor
                    key={step.stepId}
                    value={step.controlValues}
                    disabled={!editable}
                    onValidity={(ok) => valid('content', ok)}
                    onChange={(controlValues) => change({ controlValues })}
                  />
                  <Field label="Preview locale">
                    <input
                      value={previewLocale}
                      onChange={(e) => setPreviewLocale(e.target.value)}
                    />
                  </Field>
                  <Button
                    className="compact"
                    onClick={async () => {
                      try {
                        const result = await api<{
                          definition: Workflow;
                          resolved: Record<string, string>;
                        }>('content/preview', 'POST', { workflow, locale: previewLocale });
                        const resolved = JSON.parse(
                          JSON.stringify(result.definition).replace(
                            /{{payload\.__flare_i18n\.([a-z0-9_]+)}}/g,
                            (_m, key: string) =>
                              JSON.stringify(result.resolved[key] ?? '').slice(1, -1),
                          ),
                        ) as Workflow;
                        setCompiledPreview(resolved);
                        setPreview(true);
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  >
                    <Eye size={15} />
                    Preview content
                  </Button>
                </Tabs.Content>
                <Tabs.Content value="conditions" className="step-content">
                  <ConditionEditor
                    onValidity={(ok) => valid('condition', ok)}
                    disabled={!editable}
                    value={step.controlValues}
                    onChange={(controlValues) => change({ controlValues })}
                  />
                </Tabs.Content>
              </Tabs.Root>
            </>
          ) : (
            <Empty title="Build your first step">
              Choose a channel or action to start this workflow.
            </Empty>
          )}
        </aside>
      </div>
      <Modal
        open={insertAt !== null}
        onOpenChange={(v) => !v && setInsertAt(null)}
        title="Add a step"
        description="Choose how the workflow reaches your subscribers."
        wide
      >
        <div className="step-picker">
          {kinds.map(([type, name, description]) => (
            <button
              key={type}
              onClick={() => {
                const steps = [...workflow.steps];
                steps.splice(insertAt ?? steps.length, 0, {
                  stepId: `${type}-${crypto.randomUUID().slice(0, 6)}`,
                  name: name!,
                  type: type!,
                  controlValues:
                    type === 'email'
                      ? {
                          subject: 'Hello {{subscriber.firstName}}',
                          body: '<p>Welcome aboard.</p>',
                        }
                      : type === 'in_app'
                        ? { body: 'Welcome, {{subscriber.firstName}}!' }
                        : {},
                });
                setWorkflow({ ...workflow, steps });
                setSelected(insertAt ?? 0);
                setInsertAt(null);
              }}
            >
              <ChannelIcon type={type!} />
              <span>
                <strong>{name}</strong>
                <small>{description}</small>
              </span>
              <Plus size={14} />
            </button>
          ))}
        </div>
      </Modal>
      <Modal open={settings} onOpenChange={setSettings} title="Workflow settings" wide>
        <div className="form-grid">
          <Field label="Name">
            <input
              disabled={!editable}
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
            />
          </Field>
          <Field label="Severity">
            <select
              disabled={!editable}
              value={workflow.severity}
              onChange={(e) => setWorkflow({ ...workflow, severity: e.target.value })}
            >
              {['none', 'low', 'medium', 'high'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            disabled={!editable}
            value={workflow.description}
            onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
          />
        </Field>
        <Field label="Tags" hint="Separate tags with commas.">
          <input
            disabled={!editable}
            value={workflow.tags.join(', ')}
            onChange={(e) =>
              setWorkflow({
                ...workflow,
                tags: e.target.value
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <label className="setting-row">
          <span>
            <strong>Active workflow</strong>
            <small>Allow this workflow to be triggered.</small>
          </span>
          <input
            className="switch"
            type="checkbox"
            disabled={!editable}
            checked={workflow.active}
            onChange={(e) => setWorkflow({ ...workflow, active: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Critical workflow</strong>
            <small>Ignore subscriber preferences and hide it from preference pages.</small>
          </span>
          <input
            className="switch"
            type="checkbox"
            disabled={!editable}
            checked={workflow.critical}
            onChange={(e) => setWorkflow({ ...workflow, critical: e.target.checked })}
          />
        </label>
        <h3>Payload JSON Schema</h3>
        <ControlEditor
          value={workflow.payloadSchema}
          onValidity={(ok) => valid('schema', ok)}
          disabled={!editable}
          onChange={(payloadSchema) => setWorkflow({ ...workflow, payloadSchema })}
        />
        <div className="dialog-actions">
          <Button onClick={() => setSettings(false)}>Done</Button>
        </div>
      </Modal>
      <Modal open={preview} onOpenChange={setPreview} title="Content preview">
        <p className="muted small">
          Variables remain visible until the workflow is tested with a subscriber and payload.
        </p>
        {step?.type === 'email' ? (
          <iframe
            className="email-preview"
            sandbox=""
            title="Step preview"
            srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${String(compiledPreview?.steps[selected]?.controlValues.body ?? step.controlValues.body ?? '')}`}
          />
        ) : (
          <pre className="text-preview">
            {String(
              compiledPreview?.steps[selected]?.controlValues.body ??
                step?.controlValues.body ??
                '',
            )}
          </pre>
        )}
      </Modal>
      {testing && (
        <TestWorkflow
          id={id}
          dirty={dirty || invalidJson}
          close={() => setTesting(false)}
          onError={setError}
        />
      )}
    </>
  );
}
function ControlEditor({
  value,
  onChange,
  disabled,
  onValidity,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled: boolean;
  onValidity?: (valid: boolean) => void;
}) {
  const [text, setText] = useState(pretty(value)),
    [error, setError] = useState('');
  useEffect(() => {
    onValidity?.(true);
    return () => onValidity?.(true);
  }, []);
  useEffect(() => {
    try {
      if (JSON.stringify(JSON.parse(text)) === JSON.stringify(value)) return;
    } catch {
      // A new external value replaces an invalid draft.
    }
    setText(pretty(value));
    setError('');
    onValidity?.(true);
  }, [value]);
  return (
    <>
      <JsonEditor
        value={text}
        readOnly={disabled}
        onChange={(text) => {
          setText(text);
          try {
            const parsed: unknown = JSON.parse(text);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
              throw new Error('Use a JSON object');
            onChange(parsed as Record<string, unknown>);
            setError('');
            onValidity?.(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid JSON');
            onValidity?.(false);
          }
        }}
      />
      <ErrorBox error={error} />
    </>
  );
}
function ConditionEditor({
  value,
  onChange,
  disabled,
  onValidity,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled: boolean;
  onValidity?: (valid: boolean) => void;
}) {
  const [path, setPath] = useState('payload.plan'),
    [expected, setExpected] = useState('premium');
  return (
    <>
      <p className="muted small">
        Novu evaluates the skip condition before this step. A true result skips it.
      </p>
      <Field label="Variable path">
        <input
          disabled={disabled}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="payload.plan"
        />
      </Field>
      <Field label="Skip when equal to">
        <input disabled={disabled} value={expected} onChange={(e) => setExpected(e.target.value)} />
      </Field>
      <Button
        className="compact"
        disabled={disabled}
        onClick={() => onChange({ ...value, skip: { '==': [{ var: path }, expected] } })}
      >
        <Plus size={14} />
        Apply condition
      </Button>
      <h3>JSON Logic</h3>
      <ControlEditor
        onValidity={onValidity}
        value={(value.skip as Record<string, unknown>) ?? {}}
        disabled={disabled}
        onChange={(skip) => onChange({ ...value, skip })}
      />
    </>
  );
}
function TestWorkflow({
  id,
  dirty,
  close,
  onError,
}: {
  id: string;
  dirty: boolean;
  close: () => void;
  onError: (error: unknown) => void;
}) {
  const [payload, setPayload] = useState('{}'),
    [subscriber, setSubscriber] = useState('demo-subscriber'),
    [result, setResult] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const runId = typeof result?.transactionId === 'string' ? result.transactionId : '';
  const trace = useApi<{
    data: { id: string; status: string; attempts: number; created_at: string }[];
  }>(`activity?transactionId=${encodeURIComponent(runId)}`, result ? 2000 : undefined);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && close()}
      title="Test workflow"
      description="Trigger the saved workflow for a subscriber and follow its activity."
      wide
    >
      {dirty && (
        <div className="info-banner">Save your changes first to test the latest version.</div>
      )}
      <Field label="Subscriber ID">
        <input value={subscriber} onChange={(e) => setSubscriber(e.target.value)} />
      </Field>
      <h3>
        <Braces size={14} />
        Payload
      </h3>
      <JsonEditor value={payload} onChange={setPayload} />
      <ErrorBox error={error} />
      <div className="dialog-actions">
        <Button onClick={close}>Close</Button>
        <Button
          className="primary"
          disabled={!subscriber || busy || dirty}
          onClick={() => {
            setBusy(true);
            try {
              void api<Record<string, unknown>>(
                'events/trigger',
                'POST',
                { name: id, to: subscriber, payload: JSON.parse(payload) },
                crypto.randomUUID(),
              )
                .then(setResult, (e) => {
                  setError(e);
                  onError(e);
                })
                .finally(() => setBusy(false));
            } catch (e) {
              setError(e);
              setBusy(false);
            }
          }}
        >
          <Play size={14} />
          {busy ? 'Triggering…' : 'Run test'}
        </Button>
      </div>
      {result && (
        <section className="test-result">
          <h3>
            <Check size={16} />
            Trigger accepted
          </h3>
          <pre>{pretty(result)}</pre>
          <div className="timeline">
            {trace.data?.data.map((run) => (
              <div key={run.id}>
                <i />
                <Link href={`/activity/${run.id}`}>
                  <strong>
                    {run.status} · {run.attempts} attempts
                  </strong>
                </Link>
                <small>{date(run.created_at)}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}
