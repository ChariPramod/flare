'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Pencil, Eye, Users, Copy } from 'lucide-react';
import { api, useApi, date, type Session } from '../lib/api';
import { CampaignPreflight } from './campaign-preflight';
import { DraftNotice, useEditorDraft, useDrafts } from './drafts';
import {
  PageHeader,
  Button,
  Modal,
  Field,
  ErrorBox,
  DataTable,
  Badge,
  Loading,
  ConfirmButton,
} from './ui';
import type { ContactList } from './contact-import';
import styles from './campaign-import.module.css';
import {
  CampaignStarters,
  PreviewRecipient,
  CampaignPreviewPanel,
  type CampaignPreview,
  type PreviewContact,
} from './campaign-studio';

type Named = { id: string; name: string };
type Template = Named & { current_version: number };
type Content = {
  subject: string;
  html: string;
  text_body?: string | null;
  variables: Record<string, unknown>;
};
type Broadcast = {
  id: string;
  name: string;
  sender: string;
  template_id: string;
  template_version: number;
  list_id?: string | null;
  segment_id: string | null;
  topic_id: string | null;
  rate_per_second: number;
  status: string;
  scheduled_at: string | null;
  error: string | null;
  stats: {
    recipients: { status: string; count: number }[];
    messages: { status: string; count: number }[];
    events: { type: string; count: number }[];
  };
};
type AudiencePreview = {
  total: number;
  eligible: number;
  snapshot: boolean;
  excluded: { unsubscribed: number; suppressed: number; topic_opt_out: number; deleted?: number };
  sample: { id: string; email: string; first_name: string; last_name: string }[];
};
type CampaignDraft = {
  name: string;
  sender: string;
  audience: 'all' | 'list' | 'segment';
  list_id: string;
  segment_id: string;
  topic_id: string;
  rate_per_second: number;
  mode: 'template' | 'compose';
  composed: boolean;
  template_id: string;
  template_version: number;
  subject: string;
  html: string;
  text: string;
  variables: Record<string, unknown>;
  request?: { body: string; key: string };
};
const starter =
  '<p>Hi {{first_name}},</p>\n<p>Write your message here.</p>\n<p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Manage your preferences or unsubscribe</a></p>';
function initialDraft(production: boolean, broadcast?: Broadcast, list = ''): CampaignDraft {
  return {
    name: broadcast?.name ?? '',
    sender: broadcast?.sender ?? '',
    audience: broadcast?.list_id || list ? 'list' : broadcast?.segment_id ? 'segment' : 'all',
    list_id: broadcast?.list_id ?? list,
    segment_id: broadcast?.segment_id ?? '',
    topic_id: broadcast?.topic_id ?? '',
    rate_per_second: broadcast?.rate_per_second ?? 10,
    mode: broadcast || production ? 'template' : 'compose',
    composed: !broadcast && !production,
    template_id: broadcast?.template_id ?? '',
    template_version: broadcast?.template_version ?? 1,
    subject: '',
    html: starter,
    text: '',
    variables: {},
  };
}

export function BroadcastsPage({ id, writable }: { id?: string; writable: boolean }) {
  const query = useApi<Broadcast[]>('broadcasts', 5000);
  const [creating, setCreating] = useState(false);
  const [listId, setListId] = useState('');
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setListId(params.get('list_id') ?? '');
    if (writable && params.get('create') === '1') setCreating(true);
  }, [id, writable]);
  if (id) return <BroadcastDetail id={id} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Broadcasts"
        description="Plan email campaigns, choose exactly who receives them, and send when you are ready."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setCreating(true)}>
            <Plus size={15} /> Create campaign
          </Button>
        }
      />
      <div className={styles.note}>
        Start with an imported contact list or an audience segment. Campaigns stay as drafts until
        you explicitly send or schedule them.
      </div>
      <DataTable
        label="Campaigns"
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
            header: 'Campaign',
            cell: ({ row }) => (
              <Link className="strong" href={`/broadcasts/${row.original.id}`}>
                {row.original.name}
              </Link>
            ),
          },
          {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
          },
          { accessorKey: 'sender', header: 'From' },
          {
            accessorKey: 'scheduled_at',
            header: 'Scheduled',
            cell: ({ getValue }) => date(getValue()),
          },
        ]}
      />
      {creating && (
        <CampaignComposer
          listId={listId}
          close={() => {
            setCreating(false);
            const url = new URL(location.href);
            url.searchParams.delete('create');
            history.replaceState(null, '', url);
          }}
          complete={(id) => {
            setCreating(false);
            router.push(`/broadcasts/${id}`);
          }}
        />
      )}
    </>
  );
}

function CampaignComposer({
  broadcast,
  copyFrom,
  listId = '',
  close,
  complete,
}: {
  broadcast?: Broadcast;
  copyFrom?: Broadcast;
  listId?: string;
  close: () => void;
  complete: (id: string) => void;
}) {
  const session = useApi<Session>('session');
  if (!session.data)
    return (
      <Modal open onOpenChange={(open) => !open && close()} title="Campaign editor">
        <ErrorBox error={session.error} />
        {session.isPending ? (
          <Loading />
        ) : (
          <Button onClick={() => void session.refetch()}>Retry account context</Button>
        )}
      </Modal>
    );
  return (
    <CampaignForm
      production={session.data.principal.production}
      broadcast={broadcast}
      copyFrom={copyFrom}
      listId={listId}
      close={close}
      complete={complete}
    />
  );
}
function CampaignForm({
  production,
  broadcast,
  copyFrom,
  listId,
  close,
  complete,
}: {
  production: boolean;
  broadcast?: Broadcast;
  copyFrom?: Broadcast;
  listId: string;
  close: () => void;
  complete: (id: string) => void;
}) {
  const client = useQueryClient();
  const drafts = useDrafts();
  const templates = useApi<Template[]>('templates');
  const lists = useApi<ContactList[]>('contact-lists');
  const segments = useApi<Named[]>('audience-segments');
  const topics = useApi<Named[]>('audience-topics');
  const properties = useApi<{ name: string }[]>('contact-properties');
  const initial = initialDraft(production, broadcast ?? copyFrom, listId);
  if (copyFrom) initial.name = `${copyFrom.name.slice(0, 111)} — copy`;
  const draft = useEditorDraft<CampaignDraft>(
    `campaign:${broadcast?.id ?? (copyFrom ? `copy:${copyFrom.id}` : `new:${listId || 'all'}`)}`,
    initial,
  );
  const value = draft.value!;
  const [error, setError] = useState<unknown>();
  const [preview, setPreview] = useState<CampaignPreview>();
  const [previewContact, setPreviewContact] = useState<PreviewContact>();
  const [mergeField, setMergeField] = useState('first_name');
  const [fieldTarget, setFieldTarget] = useState<'subject' | 'html' | 'text'>('html');
  const fields = useRef<
    Record<'subject' | 'html' | 'text', HTMLInputElement | HTMLTextAreaElement | null>
  >({ subject: null, html: null, text: null });
  const selection = useRef({
    field: 'html' as 'subject' | 'html' | 'text',
    start: value.html.length,
    end: value.html.length,
  });
  const rememberSelection = (
    field: 'subject' | 'html' | 'text',
    element: HTMLInputElement | HTMLTextAreaElement,
  ) => {
    selection.current = {
      field,
      start: element.selectionStart ?? value[field].length,
      end: element.selectionEnd ?? value[field].length,
    };
    setFieldTarget(field);
  };
  const [previewBusy, setPreviewBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const pending = useRef(false);
  const previewGeneration = useRef(0);
  useEffect(
    () => () => {
      previewGeneration.current++;
    },
    [],
  );
  const busy = draft.pending || previewBusy || copyBusy;
  const update = (change: Partial<CampaignDraft>) => {
    previewGeneration.current++;
    setPreview(undefined);
    if ('audience' in change || 'list_id' in change || 'segment_id' in change)
      setPreviewContact(undefined);
    draft.setValue({ ...value, ...change });
  };
  const optionsError = templates.error || lists.error || segments.error || topics.error;
  async function compose() {
    if (production || busy || value.mode === 'compose') return;
    if (value.composed || (!broadcast && !copyFrom) || !value.template_id) {
      update({ mode: 'compose', composed: true });
      return;
    }
    setCopyBusy(true);
    setError(undefined);
    try {
      const content = await api<Content>(
        `templates/${value.template_id}?version=${value.template_version}`,
      );
      selection.current = { field: 'html', start: content.html.length, end: content.html.length };
      setFieldTarget('html');
      update({
        mode: 'compose',
        composed: true,
        subject: content.subject,
        html: content.html,
        text: content.text_body ?? '',
        variables: content.variables ?? {},
      });
    } catch (error) {
      setError(error);
    } finally {
      setCopyBusy(false);
    }
  }
  async function showPreview() {
    if (busy || pending.current) return;
    const generation = ++previewGeneration.current;
    const scope = drafts.generation();
    const current = () => generation === previewGeneration.current && scope === drafts.generation();
    setPreview(undefined);
    setPreviewBusy(true);
    setError(undefined);
    try {
      const template =
        value.mode === 'compose'
          ? undefined
          : await api<Content>(`templates/${value.template_id}?version=${value.template_version}`);
      if (!current()) return;
      const content = template
        ? {
            subject: template.subject,
            html: template.html,
            ...(template.text_body != null ? { text: template.text_body } : {}),
            variables: template.variables ?? {},
          }
        : {
            subject: value.subject,
            html: value.html,
            text: value.text,
            variables: value.variables,
          };
      const result = await api<CampaignPreview>('template-preview', 'POST', {
        content,
        ...(previewContact
          ? { contact_id: previewContact.id }
          : {
              variables: {
                first_name: 'Alex',
                last_name: 'Morgan',
                email: 'alex@example.test',
                FLARE_UNSUBSCRIBE_URL: 'https://example.test/preferences/preview',
              },
            }),
      });
      if (current()) setPreview(result);
    } catch (error) {
      if (current()) setError(error);
    } finally {
      if (current()) setPreviewBusy(false);
    }
  }
  const audienceQuery =
    value.audience === 'list' && value.list_id
      ? `&list_id=${encodeURIComponent(value.list_id)}`
      : value.audience === 'segment' && value.segment_id
        ? `&segment_id=${encodeURIComponent(value.segment_id)}`
        : '';
  return (
    <Modal
      open
      onOpenChange={(open) => !open && close()}
      pending={busy}
      title={
        broadcast ? 'Edit campaign draft' : copyFrom ? 'Duplicate campaign' : 'Create campaign'
      }
      description="Choose your audience and email content. Saving a draft never sends email."
      wide
    >
      {copyFrom && (
        <p className={styles.note}>
          A new draft using the original content and audience selection. Schedule, progress and
          delivery history are not copied. Review current audience membership before sending.
        </p>
      )}
      <form
        className={styles.flow}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending.current || busy) return;
          pending.current = true;
          setError(undefined);
          const generation = drafts.generation();
          const body = {
            name: value.name.trim(),
            sender: value.sender.trim(),
            list_id: value.audience === 'list' ? value.list_id : null,
            segment_id: value.audience === 'segment' ? value.segment_id : null,
            topic_id: value.topic_id || null,
            rate_per_second: value.rate_per_second,
            ...(value.mode === 'compose'
              ? {
                  content: {
                    subject: value.subject,
                    html: value.html,
                    text: value.text,
                    variables: value.variables,
                  },
                }
              : { template_id: value.template_id, template_version: value.template_version }),
          };
          const serialized = JSON.stringify(body);
          const request =
            value.request?.body === serialized
              ? value.request
              : { body: serialized, key: crypto.randomUUID() };
          const submitted = broadcast ? value : { ...value, request };
          if (!broadcast) draft.setValue(submitted);
          const finish = draft.startSaving();
          void api<{ id: string }>(
            broadcast ? `broadcasts/${broadcast.id}` : 'broadcasts',
            broadcast ? 'PATCH' : 'POST',
            body,
            broadcast ? undefined : request.key,
          )
            .then((saved) => {
              if (drafts.generation() !== generation) return;
              draft.saved(submitted, broadcast ? submitted : initial);
              void client.invalidateQueries({ queryKey: ['api'] });
              complete(saved.id);
            }, setError)
            .finally(() => {
              finish();
              pending.current = false;
            });
        }}
      >
        <DraftNotice
          dirty={draft.dirty}
          pending={busy}
          onDiscard={() => {
            draft.discard();
            previewGeneration.current++;
            setPreviewContact(undefined);
            setPreview(undefined);
          }}
        />
        <fieldset disabled={busy} className={styles.flow}>
          <section>
            <h3 className={styles.stepTitle}>
              <span>1</span> Campaign details
            </h3>
            <div className={styles.columns}>
              <Field label="Campaign name">
                <input
                  required
                  maxLength={120}
                  value={value.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="October product update"
                />
              </Field>
              <Field label="From address" hint="Use a verified sender domain for this environment.">
                <input
                  type="email"
                  required
                  maxLength={998}
                  value={value.sender}
                  onChange={(event) => update({ sender: event.target.value })}
                  placeholder="news@yourdomain.com"
                />
              </Field>
            </div>
          </section>
          <section>
            <h3 className={styles.stepTitle}>
              <span>2</span> Choose recipients
            </h3>
            <div className={styles.columns}>
              <Field label="Audience type">
                <select
                  value={value.audience}
                  onChange={(event) =>
                    update({ audience: event.target.value as CampaignDraft['audience'] })
                  }
                >
                  <option value="list">Contact list</option>
                  <option value="segment">Audience segment</option>
                  <option value="all">All contacts</option>
                </select>
              </Field>
              {value.audience === 'list' && (
                <Field label="Target contact list">
                  <select
                    required
                    value={value.list_id}
                    onChange={(event) => update({ list_id: event.target.value })}
                  >
                    <option value="">Choose a list</option>
                    {lists.data?.map((list) => (
                      <option value={list.id} key={list.id}>
                        {list.name} · {list.contact_count} contacts
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {value.audience === 'segment' && (
                <Field label="Target segment">
                  <select
                    required
                    value={value.segment_id}
                    onChange={(event) => update({ segment_id: event.target.value })}
                  >
                    <option value="">Choose a segment</option>
                    {segments.data?.map((segment) => (
                      <option value={segment.id} key={segment.id}>
                        {segment.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field
                label="Audience topic"
                hint="Topic opt-outs are respected alongside global unsubscribes."
              >
                <select
                  value={value.topic_id}
                  onChange={(event) => update({ topic_id: event.target.value })}
                >
                  <option value="">No topic</option>
                  {topics.data?.map((topic) => (
                    <option value={topic.id} key={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Messages per second"
                hint="Sending approval and organization limits still apply."
              >
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  value={value.rate_per_second}
                  onChange={(event) => update({ rate_per_second: Number(event.target.value) })}
                />
              </Field>
            </div>
            <p className="small muted">
              Save the draft to see eligible recipients and exclusions before scheduling.
            </p>
          </section>
          <section className={styles.content}>
            <h3 className={styles.stepTitle}>
              <span>3</span> Create your email
            </h3>
            <div className="section-tabs" role="group" aria-label="Campaign content source">
              <Button
                type="button"
                className={value.mode === 'compose' ? 'active' : ''}
                disabled={production}
                onClick={() => void compose()}
              >
                Write email
              </Button>
              <Button
                type="button"
                className={value.mode === 'template' ? 'active' : ''}
                onClick={() => update({ mode: 'template' })}
              >
                Use saved template
              </Button>
            </div>
            {production && (
              <p className="small muted">
                Compose content in Development and publish it. Production campaigns use published
                templates.
              </p>
            )}
            {value.mode === 'compose' ? (
              <>
                <CampaignStarters
                  apply={(content) => {
                    selection.current = {
                      field: 'html',
                      start: content.html.length,
                      end: content.html.length,
                    };
                    setFieldTarget('html');
                    update(content);
                  }}
                />
                <div className={styles.studioTools}>
                  <Field
                    label="Personalization field"
                    hint={`Insert at your last cursor position in ${fieldTarget === 'subject' ? 'the subject' : fieldTarget === 'html' ? 'the HTML' : 'plain text'}. Custom fields use their configured defaults when available.`}
                  >
                    <select
                      value={mergeField}
                      onChange={(event) => setMergeField(event.target.value)}
                    >
                      {[
                        ...new Set([
                          'first_name',
                          'last_name',
                          'email',
                          ...(properties.data ?? []).map((item) => item.name),
                        ]),
                      ].map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    type="button"
                    onClick={() => {
                      const { field, start, end } = selection.current;
                      const token = `{{${mergeField}}}`;
                      const content = value[field];
                      const position = Math.min(start, content.length);
                      update({
                        [field]:
                          content.slice(0, position) +
                          token +
                          content.slice(Math.min(end, content.length)),
                      });
                      selection.current = {
                        field,
                        start: position + token.length,
                        end: position + token.length,
                      };
                      requestAnimationFrame(() => {
                        const element = fields.current[field];
                        element?.focus();
                        element?.setSelectionRange(
                          position + token.length,
                          position + token.length,
                        );
                      });
                    }}
                  >
                    Insert field
                  </Button>
                </div>
                {properties.error && (
                  <div>
                    <ErrorBox error={properties.error} />
                    <Button type="button" onClick={() => void properties.refetch()}>
                      Retry personalization fields
                    </Button>
                  </div>
                )}
                <Field label="Email subject">
                  <input
                    required
                    maxLength={998}
                    ref={(element) => {
                      fields.current.subject = element;
                    }}
                    onSelect={(event) => rememberSelection('subject', event.currentTarget)}
                    value={value.subject}
                    onChange={(event) => update({ subject: event.target.value })}
                  />
                </Field>
                <Field
                  label="Email HTML"
                  hint="Personalize with {{first_name}}. Keep the FLARE_UNSUBSCRIBE_URL link so recipients can opt out."
                >
                  <textarea
                    required
                    ref={(element) => {
                      fields.current.html = element;
                    }}
                    onSelect={(event) => rememberSelection('html', event.currentTarget)}
                    value={value.html}
                    onChange={(event) => update({ html: event.target.value })}
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label="Plain-text alternative"
                  hint="Optional text version for mail clients that do not display HTML."
                >
                  <textarea
                    className={styles.plainText}
                    ref={(element) => {
                      fields.current.text = element;
                    }}
                    onSelect={(event) => rememberSelection('text', event.currentTarget)}
                    value={value.text}
                    onChange={(event) => update({ text: event.target.value })}
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Email template"
                hint="The selected version is pinned when you save this campaign."
              >
                <select
                  required
                  value={value.template_id}
                  onChange={(event) => {
                    const template = templates.data?.find((item) => item.id === event.target.value);
                    update({
                      template_id: event.target.value,
                      template_version: template?.current_version ?? 1,
                    });
                  }}
                >
                  <option value="">Select a template</option>
                  {templates.data?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · v
                      {template.id === value.template_id
                        ? value.template_version
                        : template.current_version}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <PreviewRecipient
              key={`${value.audience}/${value.list_id}/${value.segment_id}`}
              selected={previewContact}
              onSelect={(contact) => {
                previewGeneration.current++;
                setPreviewContact(contact);
                setPreview(undefined);
              }}
              audienceQuery={audienceQuery}
            />
            <div>
              <Button
                type="button"
                disabled={
                  busy ||
                  (value.mode === 'template' ? !value.template_id : !value.subject || !value.html)
                }
                onClick={() => void showPreview()}
              >
                <Eye size={15} />
                {previewBusy ? 'Loading preview…' : 'Preview email'}
              </Button>
            </div>
            {preview && <CampaignPreviewPanel preview={preview} recipient={previewContact} />}
          </section>
        </fieldset>
        <ErrorBox error={error || optionsError} />
        {optionsError && (
          <Button
            type="button"
            onClick={() => {
              void templates.refetch();
              void lists.refetch();
              void segments.refetch();
              void topics.refetch();
            }}
          >
            Retry campaign options
          </Button>
        )}
        <div className={`dialog-actions ${styles.footer}`}>
          <span className="small muted">No email is sent until you confirm delivery.</span>
          <Button type="submit" className="primary" disabled={busy || !!optionsError}>
            {draft.pending ? 'Saving campaign…' : 'Save campaign draft'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BroadcastDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Broadcast>(`broadcasts/${id}`, 3000);
  const audience = useApi<AudiencePreview>(`broadcasts/${id}/audience-preview`, 10000);
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const router = useRouter();
  const [error, setError] = useState<unknown>();
  const [scheduled, setScheduled] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [success, setSuccess] = useState('');
  const b = query.data;
  if (query.isPending) return <Loading />;
  const scheduledDate = scheduled ? new Date(scheduled) : undefined;
  const invalidSchedule =
    mode === 'later' &&
    (!scheduledDate ||
      !Number.isFinite(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now());
  const excluded = audience.data ? audience.data.total - audience.data.eligible : 0;
  return (
    <>
      <Link className="back-link" href="/broadcasts">
        ← Broadcasts
      </Link>
      <PageHeader
        title={b?.name ?? 'Campaign'}
        description={
          b
            ? `${b.sender} · template v${b.template_version} · up to ${b.rate_per_second} messages/second`
            : 'Campaign unavailable'
        }
        actions={
          b && writable ? (
            <>
              <Button onClick={() => setCopying(true)}>
                <Copy size={15} /> Duplicate as draft
              </Button>
              {b.status === 'draft' && (
                <Button onClick={() => setEditing(true)}>
                  <Pencil size={15} /> Edit draft
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <ErrorBox error={error || query.error || b?.error} />
      {query.error && <Button onClick={() => void query.refetch()}>Retry campaign</Button>}
      {success && (
        <p className="info-banner" role="status">
          {success}
        </p>
      )}
      {b && (
        <div className={styles.flow}>
          <div className="inline-tags">
            <Badge>{b.status}</Badge>
            <span className="small muted">
              {b.scheduled_at ? date(b.scheduled_at) : 'Draft · not scheduled'}
            </span>
            <Link href={`/templates/${b.template_id}?version=${b.template_version}`}>
              View pinned email
            </Link>
            {b.list_id && <span className="small muted">Audience: contact list</span>}
          </div>
          <CampaignPreflight
            key={`${id}:${b.template_version}:${b.sender}:${b.topic_id}:${b.list_id}:${b.segment_id}`}
            id={id}
            writable={writable}
          />
          <section className="panel" aria-label="Campaign audience">
            <div className="panel-heading">
              <h2>
                <Users size={19} /> Audience review
              </h2>
              <Button disabled={audience.isFetching} onClick={() => void audience.refetch()}>
                {audience.isFetching ? 'Refreshing…' : 'Refresh audience'}
              </Button>
            </div>
            <ErrorBox error={audience.error} />
            {audience.isPending && <Loading />}
            {audience.data && (
              <>
                <div className={styles.summary}>
                  <div className={styles.stat}>
                    <strong>{audience.data.total}</strong>
                    <span>Contacts in audience</span>
                  </div>
                  <div className={styles.stat}>
                    <strong>{audience.data.eligible}</strong>
                    <span>Currently eligible</span>
                  </div>
                  <div className={styles.stat}>
                    <strong>{excluded}</strong>
                    <span>Excluded by preferences or suppression</span>
                  </div>
                </div>
                <p className="small muted">
                  {audience.data.excluded.unsubscribed} unsubscribed ·{' '}
                  {audience.data.excluded.suppressed} suppressed ·{' '}
                  {audience.data.excluded.topic_opt_out} topic opt-outs ·{' '}
                  {audience.data.excluded.deleted ?? 0} deleted
                </p>
                <p className="small muted">
                  {audience.data.snapshot
                    ? 'This audience was frozen when scheduled.'
                    : 'The current audience is a preview; membership is frozen when you schedule.'}{' '}
                  Preferences are checked again before delivery. Organization approval, readiness
                  and limits still apply.
                </p>
                {!!audience.data.sample.length && (
                  <p className="small muted">
                    Eligible sample:{' '}
                    {audience.data.sample.map((contact) => contact.email).join(', ')}
                  </p>
                )}
              </>
            )}
            {audience.error && (
              <Button onClick={() => void audience.refetch()}>Retry audience review</Button>
            )}
          </section>
          {['draft', 'scheduled'].includes(b.status) && (
            <section className="panel">
              <h2>
                {b.status === 'scheduled' ? 'Change delivery time' : 'Send when you are ready'}
              </h2>
              <div className={styles.schedule}>
                <Field label="Delivery timing">
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as 'now' | 'later')}
                  >
                    <option value="now">Send now</option>
                    <option value="later">Schedule for later</option>
                  </select>
                </Field>
                {mode === 'later' && (
                  <Field
                    label="Send date and time"
                    hint={`Your local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`}
                    error={
                      scheduled && invalidSchedule ? 'Choose a future date and time.' : undefined
                    }
                  >
                    <input
                      type="datetime-local"
                      value={scheduled}
                      onChange={(event) => setScheduled(event.target.value)}
                    />
                  </Field>
                )}
                <ConfirmButton
                  className="primary"
                  disabled={
                    !writable ||
                    !audience.data ||
                    !!audience.error ||
                    audience.isFetching ||
                    audience.data.eligible === 0 ||
                    invalidSchedule
                  }
                  title={mode === 'now' ? 'Send this campaign now?' : 'Schedule this campaign?'}
                  description={`${audience.data?.eligible ?? 0} ${audience.data?.eligible === 1 ? 'contact is' : 'contacts are'} currently eligible. ${mode === 'now' ? 'Delivery will start as soon as sending policy allows.' : scheduledDate && !invalidSchedule ? `Delivery is scheduled for ${scheduledDate.toLocaleString()}.` : 'Choose a future delivery time.'} Preferences and suppressions will be checked again before every delivery.`}
                  onConfirm={async () => {
                    setError(undefined);
                    await api(
                      `broadcasts/${id}/schedule`,
                      'POST',
                      mode === 'later' ? { scheduled_at: new Date(scheduled).toISOString() } : {},
                    );
                    setSuccess(
                      mode === 'now'
                        ? 'Campaign accepted for delivery. Follow its progress below.'
                        : 'Campaign scheduled. You can change the time or cancel before delivery starts.',
                    );
                    await query.refetch();
                    await audience.refetch();
                  }}
                >
                  <Send size={15} />
                  {b.status === 'scheduled'
                    ? 'Reschedule campaign'
                    : mode === 'now'
                      ? 'Review and send now'
                      : 'Review schedule'}
                </ConfirmButton>
              </div>
              {audience.data?.eligible === 0 && (
                <p className={styles.note}>
                  No eligible contacts. Edit the draft audience or review the contact preferences
                  before scheduling.
                </p>
              )}
            </section>
          )}
          <div className="detail-grid">
            <section className="panel">
              <h2>Audience progress</h2>
              <DataTable
                searchMode="none"
                paginate={false}
                data={b.stats.recipients}
                columns={[
                  {
                    accessorKey: 'status',
                    header: 'State',
                    cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
                  },
                  { accessorKey: 'count', header: 'Contacts' },
                ]}
              />
            </section>
            <section className="panel">
              <h2>Email outcomes</h2>
              <DataTable
                searchMode="none"
                paginate={false}
                data={b.stats.messages}
                columns={[
                  {
                    accessorKey: 'status',
                    header: 'State',
                    cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
                  },
                  { accessorKey: 'count', header: 'Messages' },
                ]}
              />
              <p className="small muted">
                Submission complete does not establish delivery. Provider acceptance and
                receiving-server delivery remain separate outcomes.
              </p>
            </section>
          </div>
          <section className="panel">
            <h2>Engagement events</h2>
            <DataTable
              searchMode="none"
              paginate={false}
              data={b.stats.events}
              columns={[
                { accessorKey: 'type', header: 'Event' },
                { accessorKey: 'count', header: 'Unique messages' },
              ]}
            />
          </section>
          {!['sent', 'canceled'].includes(b.status) && (
            <div>
              <ConfirmButton
                disabled={!writable}
                title="Cancel campaign?"
                description="Pending audience work and emails that have not started delivery will be canceled. An active provider request may finish."
                onConfirm={async () => {
                  await api(`broadcasts/${id}/cancel`, 'POST', {});
                  setSuccess(
                    'Campaign canceled. Already submitted provider work may still finish.',
                  );
                  await query.refetch();
                  await audience.refetch();
                }}
              >
                Cancel campaign
              </ConfirmButton>
            </div>
          )}
        </div>
      )}
      {copying && b && (
        <CampaignComposer
          copyFrom={b}
          close={() => setCopying(false)}
          complete={(newId) => {
            setCopying(false);
            router.push(`/broadcasts/${newId}`);
          }}
        />
      )}
      {editing && b && (
        <CampaignComposer
          broadcast={b}
          close={() => setEditing(false)}
          complete={() => {
            setEditing(false);
            void query.refetch();
            void audience.refetch();
          }}
        />
      )}
    </>
  );
}
