'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Copy, Code2 } from 'lucide-react';
import { api, useApi, date, pretty } from '../lib/api';
import { DraftNotice, useDrafts, useEditorDraft } from './drafts';
import { ContactImport, type ContactList } from './contact-import';
import campaignStyles from './campaign-import.module.css';
export { BroadcastsPage } from './campaign-pages';
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
type Contact = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  properties: Record<string, unknown>;
  unsubscribed: boolean;
  created_at: string;
  topics?: { id: string; name: string; enabled: boolean }[];
};
type Definition = {
  id: string;
  name: string;
  type?: string;
  fallback?: unknown;
  definition?: unknown;
  description?: string;
  default_opt_in?: boolean;
};
const tabs = [
  ['contacts', 'Contacts'],
  ['properties', 'Properties'],
  ['segments', 'Segments'],
  ['topics', 'Topics'],
] as const;
export function AudiencePage({ id, writable }: { id?: string; writable: boolean }) {
  const [section, contact] = id?.split('/') ?? ['contacts'];
  return (
    <>
      <PageHeader
        title="Audience"
        description="One contact profile across your segments and audience topics."
      />
      <div className="section-tabs">
        {tabs.map(([key, label]) => (
          <Link className={section === key ? 'active' : ''} key={key} href={`/audience/${key}`}>
            {label}
          </Link>
        ))}
      </div>
      {section === 'contacts' ? (
        contact ? (
          <ContactDetail id={contact} writable={writable} />
        ) : (
          <Contacts writable={writable} />
        )
      ) : (
        <Definitions key={section} section={section ?? 'properties'} writable={writable} />
      )}
    </>
  );
}
function Contacts({ writable }: { writable: boolean }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [segment, setSegment] = useState(''),
    [list, setList] = useState(''),
    [editing, setEditing] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const query = useApi<{ data: Contact[] }>(
      `contacts?limit=25&page=${page}&q=${encodeURIComponent(search)}${segment ? `&segment_id=${segment}` : ''}${list ? `&list_id=${list}` : ''}`,
    ),
    segments = useApi<Definition[]>('audience-segments'),
    lists = useApi<ContactList[]>('contact-lists');
  return (
    <>
      <div className={`panel-heading ${campaignStyles.contactToolbar}`}>
        <div className="actions">
          <select
            aria-label="Contact segment"
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All contacts</option>
            {segments.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Contact list filter"
            value={list}
            onChange={(event) => {
              setList(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All lists</option>
            {lists.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.contact_count}
              </option>
            ))}
          </select>
          {list && writable && (
            <Link
              className="button"
              href={`/broadcasts?create=1&list_id=${encodeURIComponent(list)}`}
            >
              Create campaign for list
            </Link>
          )}
        </div>
        <div className="actions">
          <Button disabled={!writable} onClick={() => setImporting(true)}>
            <Upload size={15} />
            Import contacts
          </Button>
          <Button className="primary" disabled={!writable} onClick={() => setEditing(true)}>
            <Plus size={15} />
            Add contact
          </Button>
        </div>
      </div>
      <ErrorBox error={error} />
      <DataTable
        label="Contacts"
        searchMode="external"
        searchPlaceholder="Search contacts"
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        loading={query.isPending}
        refreshing={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRefresh={() => void query.refetch()}
        paginate={false}
        data={query.data?.data ?? []}
        columns={[
          {
            accessorKey: 'email',
            header: 'Email',
            cell: ({ row }) => (
              <Link className="strong" href={`/audience/contacts/${row.original.id}`}>
                {row.original.email}
              </Link>
            ),
          },
          { accessorKey: 'first_name', header: 'First name' },
          { accessorKey: 'last_name', header: 'Last name' },
          {
            accessorKey: 'unsubscribed',
            header: 'Subscription',
            cell: ({ getValue }) => <Badge>{getValue() ? 'Unsubscribed' : 'Subscribed'}</Badge>,
          },
          { accessorKey: 'created_at', header: 'Added', cell: ({ getValue }) => date(getValue()) },
        ]}
      />
      <div className="server-pages">
        <span>Page {page}</span>
        <Button disabled={page === 1 || query.isFetching} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button
          disabled={query.isFetching || query.data?.data.length !== 25}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      <Modal
        pending={busy}
        open={editing}
        onOpenChange={setEditing}
        title="Add contact"
        description="Existing email addresses are updated without changing opt-out status."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const form = Object.fromEntries(new FormData(e.currentTarget));
            void api('contacts', 'POST', form)
              .then(() => {
                setEditing(false);
                void query.refetch();
              }, setError)
              .finally(() => setBusy(false));
          }}
        >
          <Field label="Email address">
            <input name="email" required type="email" />
          </Field>
          <Field label="First name">
            <input name="first_name" />
          </Field>
          <Field label="Last name">
            <input name="last_name" />
          </Field>
          <ErrorBox error={error} />
          <Button disabled={busy} className="primary">
            Save contact
          </Button>
        </form>
      </Modal>
      {importing && (
        <ContactImport
          close={() => setImporting(false)}
          complete={(listId) => {
            if (listId) {
              setList(listId);
              setPage(1);
            }
            void query.refetch();
            void lists.refetch();
          }}
        />
      )}
    </>
  );
}
function ContactDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Contact>(`contacts/${id}`),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState('');
  const router = useRouter();
  if (query.isPending) return <Loading />;
  const contact = query.data;
  return (
    <>
      <Link className="back-link" href="/audience/contacts">
        ← Contacts
      </Link>
      <ErrorBox error={error || query.error} />
      {contact && (
        <div className="detail-grid">
          <section className="panel">
            <h2>{contact.email}</h2>
            <form
              key={JSON.stringify(contact)}
              onSubmit={(e) => {
                e.preventDefault();
                const form = Object.fromEntries(new FormData(e.currentTarget));
                setBusy(true);
                try {
                  void api(`contacts/${id}`, 'PATCH', {
                    first_name: form.first_name,
                    last_name: form.last_name,
                    properties: JSON.parse(String(form.properties)),
                    unsubscribed: form.unsubscribed === 'on',
                  })
                    .then(() => query.refetch(), setError)
                    .finally(() => setBusy(false));
                } catch (error) {
                  setError(error);
                  setBusy(false);
                }
              }}
            >
              <Field label="First name">
                <input name="first_name" defaultValue={contact.first_name} />
              </Field>
              <Field label="Last name">
                <input name="last_name" defaultValue={contact.last_name} />
              </Field>
              <Field
                label="Custom properties"
                hint="Define property types before assigning values."
              >
                <textarea
                  name="properties"
                  className="mono"
                  rows={6}
                  defaultValue={pretty(contact.properties)}
                />
              </Field>
              <label className="inline-check">
                <input type="checkbox" name="unsubscribed" defaultChecked={contact.unsubscribed} />
                Unsubscribed from all broadcasts
              </label>
              <Button disabled={!writable || busy} className="primary">
                Save profile
              </Button>
            </form>
          </section>
          <section className="panel">
            <h2>Topic preferences</h2>
            {contact.topics?.map((t) => (
              <label className="preference-row" key={t.id}>
                <span>{t.name}</span>
                <input
                  type="checkbox"
                  aria-label={t.name}
                  checked={t.enabled}
                  disabled={!writable}
                  onChange={(e) =>
                    void api(`contacts/${id}/preferences`, 'PATCH', {
                      topics: { [t.id]: e.target.checked },
                    }).then(() => query.refetch(), setError)
                  }
                />
              </label>
            ))}
            <Button
              disabled={!writable}
              onClick={() =>
                void api<{ url: string }>(`contacts/${id}/preference-link`, 'POST', {}).then(
                  (r) => setLink(r.url),
                  setError,
                )
              }
            >
              Create preference link
            </Button>
            {link && (
              <div className="secret-box">
                <input readOnly aria-label="Preference link" value={link} />
                <Button onClick={() => void navigator.clipboard.writeText(link)}>
                  <Copy size={15} />
                </Button>
              </div>
            )}
            <p className="small muted">
              Anyone with the preference link can change this contact’s subscription choices.
            </p>
            <ConfirmButton
              disabled={!writable}
              title="Delete contact?"
              description="This contact will stop receiving broadcasts. Delivery history remains available."
              onConfirm={async () => {
                await api(`contacts/${id}`, 'DELETE');
                router.push('/audience/contacts');
              }}
            >
              Delete contact
            </ConfirmButton>
          </section>
        </div>
      )}
    </>
  );
}
function Definitions({ section, writable }: { section: string; writable: boolean }) {
  const kind = section === 'properties' ? 'property' : section === 'segments' ? 'segment' : 'topic',
    endpoint = section === 'properties' ? 'contact-properties' : `audience-${section}`;
  const query = useApi<Definition[]>(endpoint),
    [editing, setEditing] = useState<Definition | null | undefined>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="panel-heading">
        <p className="muted">
          {kind === 'property'
            ? 'Typed fields and fallback values for personalized emails.'
            : kind === 'segment'
              ? 'Rules select contacts at the moment a broadcast is scheduled.'
              : 'These topics appear on the hosted preference page.'}
        </p>
        <Button disabled={!writable} className="primary" onClick={() => setEditing(null)}>
          <Plus size={15} />
          Add {kind}
        </Button>
      </div>
      <ErrorBox error={error} />
      <DataTable
        searchMode="local"
        loading={query.isPending}
        refreshing={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRefresh={() => void query.refetch()}
        data={query.data ?? []}
        columns={[
          { accessorKey: 'name', header: 'Name' },
          {
            id: 'details',
            header: 'Details',
            cell: ({ row }) => (
              <span className="muted small">
                {kind === 'property'
                  ? `${row.original.type} · fallback ${JSON.stringify(row.original.fallback)}`
                  : kind === 'topic'
                    ? row.original.description
                    : pretty(row.original.definition)}
              </span>
            ),
          },
          {
            id: 'edit',
            cell: ({ row }) => (
              <Button disabled={!writable} onClick={() => setEditing(row.original)}>
                Edit
              </Button>
            ),
          },
        ]}
      />
      <Modal
        pending={busy}
        open={editing !== undefined}
        onOpenChange={(v) => !v && setEditing(undefined)}
        title={`${editing ? 'Edit' : 'Add'} ${kind}`}
        description="Changes are scoped to the selected environment."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            setBusy(true);
            try {
              const body =
                kind === 'property'
                  ? {
                      name: form.name,
                      type: form.type,
                      fallback: form.fallback ? JSON.parse(String(form.fallback)) : null,
                    }
                  : kind === 'segment'
                    ? { name: form.name, definition: JSON.parse(String(form.definition)) }
                    : {
                        name: form.name,
                        description: form.description,
                        default_opt_in: form.default_opt_in === 'on',
                      };
              void api(
                kind === 'property' || !editing ? endpoint : `${endpoint}/${editing.id}`,
                kind === 'property' || !editing ? 'POST' : 'PATCH',
                body,
              )
                .then(() => {
                  setEditing(undefined);
                  void query.refetch();
                }, setError)
                .finally(() => setBusy(false));
            } catch (error) {
              setError(error);
              setBusy(false);
            }
          }}
        >
          <Field label={kind === 'property' ? 'Property name' : 'Name'}>
            <input
              name="name"
              required
              defaultValue={editing?.name}
              readOnly={kind === 'property' && Boolean(editing)}
            />
          </Field>
          {kind === 'property' ? (
            <>
              <Field label="Type">
                <select
                  name="type"
                  defaultValue={editing?.type ?? 'string'}
                  disabled={Boolean(editing)}
                >
                  {['string', 'number', 'boolean', 'date'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {editing && <input type="hidden" name="type" value={editing.type} />}
              </Field>
              <Field label="Fallback (JSON)" hint={'Examples: "friend", 0, true, null'}>
                <input
                  name="fallback"
                  className="mono"
                  defaultValue={JSON.stringify(editing?.fallback ?? null)}
                />
              </Field>
            </>
          ) : kind === 'segment' ? (
            <Field
              label="Segment rules"
              hint={'Use all/any with field, op (eq, neq, contains, gt, lt, exists), and value.'}
            >
              <textarea
                name="definition"
                rows={10}
                className="mono"
                defaultValue={pretty(
                  editing?.definition ?? {
                    mode: 'all',
                    rules: [{ field: 'unsubscribed', op: 'eq', value: false }],
                  },
                )}
              />
            </Field>
          ) : (
            <>
              <Field label="Description">
                <textarea name="description" defaultValue={editing?.description} />
              </Field>
              <label className="inline-check">
                <input
                  type="checkbox"
                  name="default_opt_in"
                  defaultChecked={editing?.default_opt_in ?? true}
                />
                Subscribe contacts by default
              </label>
            </>
          )}
          <ErrorBox error={error} />
          <Button className="primary" disabled={busy}>
            Save {kind}
          </Button>
        </form>
      </Modal>
    </>
  );
}
type Template = {
  id: string;
  name: string;
  identifier: string;
  current_version: number;
  version: number;
  subject: string;
  html: string;
  text_body: string | null;
  variables: Record<string, unknown>;
  versions: { version: number; created_at: string }[];
};
export function TemplatesPage({ id, editable }: { id?: string; editable: boolean }) {
  const client = useQueryClient();
  const query = useApi<Template[]>('templates'),
    [creating, setCreating] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  if (id) return <TemplateEditor key={id} id={id} editable={editable} />;
  return (
    <>
      <PageHeader
        title="Templates"
        description="Versioned HTML emails with safe variables and a preview."
        actions={
          <Button className="primary" disabled={!editable} onClick={() => setCreating(true)}>
            <Plus size={15} />
            Create template
          </Button>
        }
      />
      <ErrorBox error={error} />
      <DataTable
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
            header: 'Template',
            cell: ({ row }) => (
              <Link className="entity-cell" href={`/templates/${row.original.id}`}>
                <Code2 size={18} />
                <span>
                  <strong>{row.original.name}</strong>
                  <small>{row.original.identifier}</small>
                </span>
              </Link>
            ),
          },
          { accessorKey: 'current_version', header: 'Version' },
        ]}
      />
      <Modal
        pending={busy}
        open={creating}
        onOpenChange={setCreating}
        title="Create email template"
        description="Start with HTML. Each save creates an immutable version."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            setBusy(true);
            void api<{ id: string }>('templates', 'POST', {
              name: form.name,
              identifier: form.identifier,
              content: {
                subject: 'Hello {{first_name}}',
                html: '<h1>Hello {{first_name}}</h1><p>Your update goes here.</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Manage preferences</a>',
              },
            })
              .then(async (r) => {
                await client.invalidateQueries({ queryKey: ['api', 'templates'] });
                router.push(`/templates/${r.id}`);
              }, setError)
              .finally(() => setBusy(false));
          }}
        >
          <Field label="Template name">
            <input name="name" required />
          </Field>
          <Field label="Template identifier">
            <input
              name="identifier"
              required
              pattern="[a-z][a-z0-9_-]{1,99}"
              placeholder="monthly-update"
            />
          </Field>
          <ErrorBox error={error} />
          <Button className="primary" disabled={busy}>
            Create template
          </Button>
        </form>
      </Modal>
    </>
  );
}
function TemplateEditor({ id, editable }: { id: string; editable: boolean }) {
  const client = useQueryClient();
  const drafts = useDrafts();
  const { confirmNavigation } = drafts;
  const mounted = useRef(false);
  const [version, setVersion] = useState(''),
    query = useApi<Template>(`templates/${id}${version ? `?version=${version}` : ''}`),
    [error, setError] = useState<unknown>(),
    [preview, setPreview] = useState<{ subject: string; html: string }>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const restore = () => setVersion(new URLSearchParams(location.search).get('version') ?? '');
    restore();
    window.addEventListener('popstate', restore);
    return () => {
      mounted.current = false;
      window.removeEventListener('popstate', restore);
    };
  }, []);
  const data = query.data;
  const initial = data
    ? {
        subject: data.subject,
        html: data.html,
        text: data.text_body ?? '',
        variables: pretty(data.variables),
        sample: pretty({
          first_name: 'Alex',
          FLARE_UNSUBSCRIBE_URL: 'https://example.test/preferences',
        }),
      }
    : undefined;
  const draft = useEditorDraft(`template:${id}:${version || 'latest'}`, initial, query.isError);
  const fields = draft.value;
  const pending = busy || draft.pending;
  if (query.isPending) return <Loading />;
  return (
    <>
      <Link className="back-link" href="/templates">
        ← Templates
      </Link>
      <PageHeader
        title={data?.name ?? 'Template'}
        description={`Version ${data?.version ?? '—'} · ${data?.identifier ?? ''}`}
        actions={
          <select
            aria-label="Template version"
            value={version}
            disabled={pending}
            onChange={(e) => {
              if (!confirmNavigation()) return;
              const next = e.target.value;
              setVersion(next);
              setPreview(undefined);
              setError(undefined);
              const url = new URL(location.href);
              if (next) url.searchParams.set('version', next);
              else url.searchParams.delete('version');
              history.pushState(null, '', url);
            }}
          >
            <option value="">Latest version</option>
            {data?.versions.map((v) => (
              <option key={v.version} value={v.version}>
                Version {v.version}
              </option>
            ))}
          </select>
        }
      />
      <ErrorBox error={error || query.error} />
      <DraftNotice
        dirty={draft.dirty}
        pending={pending}
        onDiscard={() => {
          draft.discard();
          setPreview(undefined);
        }}
      />
      {data && fields && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const intent = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
            const submittedLocation = location.href;
            const submittedGeneration = drafts.generation();
            const ownsCurrentEditor = () =>
              mounted.current &&
              location.href === submittedLocation &&
              drafts.generation() === submittedGeneration;
            setBusy(true);
            const finish = draft.startSaving();
            setError(undefined);
            try {
              const content = {
                subject: fields.subject,
                html: fields.html,
                text: fields.text || undefined,
                variables: JSON.parse(fields.variables),
              };
              if (intent === 'preview') {
                const result = await api<{ subject: string; html: string }>(
                  'template-preview',
                  'POST',
                  {
                    content,
                    variables: JSON.parse(fields.sample),
                  },
                );
                if (ownsCurrentEditor()) setPreview(result);
              } else {
                await api(`templates/${id}/versions`, 'POST', content);
                if (drafts.generation() === submittedGeneration)
                  await client.invalidateQueries({
                    predicate: (item) =>
                      item.queryKey[0] === 'api' &&
                      String(item.queryKey[1]).startsWith('templates'),
                  });
                // A version save creates a new version; it never changes the
                // immutable historical version whose draft was submitted.
                draft.saved(fields, version ? initial! : fields);
                if (ownsCurrentEditor()) {
                  setVersion('');
                  setPreview(undefined);
                  const url = new URL(submittedLocation);
                  url.searchParams.delete('version');
                  history.replaceState(null, '', url);
                }
              }
            } catch (error) {
              if (ownsCurrentEditor()) setError(error);
            } finally {
              finish();
              if (mounted.current) setBusy(false);
            }
          }}
        >
          <fieldset className="form-fields" disabled={pending}>
            <div className="detail-grid">
              <section className="panel">
                <Field label="Subject">
                  <input
                    name="subject"
                    value={fields.subject}
                    onChange={(e) =>
                      draft.setValue((current) => ({ ...current, subject: e.target.value }))
                    }
                    readOnly={!editable}
                  />
                </Field>
                <Field label="HTML">
                  <textarea
                    name="html"
                    className="mono template-code"
                    value={fields.html}
                    onChange={(e) =>
                      draft.setValue((current) => ({ ...current, html: e.target.value }))
                    }
                    readOnly={!editable}
                  />
                </Field>
                <Field label="Plain text">
                  <textarea
                    name="text"
                    rows={3}
                    value={fields.text}
                    onChange={(e) =>
                      draft.setValue((current) => ({ ...current, text: e.target.value }))
                    }
                    readOnly={!editable}
                  />
                </Field>
                <Field label="Variable fallbacks (JSON)">
                  <textarea
                    name="variables"
                    className="mono"
                    rows={3}
                    value={fields.variables}
                    onChange={(e) =>
                      draft.setValue((current) => ({ ...current, variables: e.target.value }))
                    }
                    readOnly={!editable}
                  />
                </Field>
                <p className="small muted">
                  Use {'{{first_name}}'} or {'{{payload.name}}'} in workflow templates. Broadcasts
                  require {'{{{FLARE_UNSUBSCRIBE_URL}}}'}.
                </p>
                <div className="actions">
                  <Button name="intent" value="preview" disabled={pending || !editable}>
                    Preview draft
                  </Button>
                  <Button
                    name="intent"
                    value="save"
                    className="primary"
                    disabled={pending || !editable}
                  >
                    Save new version
                  </Button>
                </div>
              </section>
              <section className="panel">
                <h2>Preview</h2>
                <Field label="Sample variables (JSON)">
                  <textarea
                    name="sample"
                    className="mono"
                    rows={4}
                    value={fields.sample}
                    onChange={(e) =>
                      draft.setValue((current) => ({ ...current, sample: e.target.value }))
                    }
                  />
                </Field>
                <h3>{preview?.subject ?? data.subject}</h3>
                <SafeEmailPreview html={preview?.html ?? data.html} />
                <p className="small muted">
                  {preview
                    ? 'Last requested preview. Update it after editing.'
                    : 'Showing saved content. Preview your draft to see edits.'}{' '}
                  Remote images and scripts are blocked in the preview.
                </p>
              </section>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}
export function SafeEmailPreview({ html }: { html: string }) {
  return (
    <iframe
      title="Email preview"
      className="email-preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${html}`}
    />
  );
}
