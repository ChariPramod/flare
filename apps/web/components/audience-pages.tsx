'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Copy, Send, Code2 } from 'lucide-react';
import { api, useApi, date, pretty } from '../lib/api';
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
    [editing, setEditing] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const query = useApi<{ data: Contact[] }>(
      `contacts?limit=25&page=${page}&q=${encodeURIComponent(search)}${segment ? `&segment_id=${segment}` : ''}`,
    ),
    segments = useApi<Definition[]>('audience-segments');
  return (
    <>
      <div className="panel-heading">
        <div className="actions">
          <input
            aria-label="Search contacts"
            placeholder="Search email or first name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
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
        </div>
        <div className="actions">
          <Button disabled={!writable} onClick={() => setImporting(true)}>
            <Upload size={15} />
            Import CSV
          </Button>
          <Button className="primary" disabled={!writable} onClick={() => setEditing(true)}>
            <Plus size={15} />
            Add contact
          </Button>
        </div>
      </div>
      <ErrorBox error={error || query.error} />
      <DataTable
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
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button disabled={query.data?.data.length !== 25} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
      <Modal
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
      <CsvImport
        open={importing}
        close={() => setImporting(false)}
        complete={() => void query.refetch()}
      />
    </>
  );
}
function CsvImport({
  open,
  close,
  complete,
}: {
  open: boolean;
  close: () => void;
  complete: () => void;
}) {
  const [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<{ headers: string[]; sample: string[][]; rows: number }>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState('');
  const properties = useApi<Definition[]>('contact-properties');
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Import contacts"
      description="Up to 5,000 contacts and 2 MiB per CSV. Imports preserve existing opt-outs."
      wide
    >
      <Field label="CSV file">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setError(new Error('CSV exceeds 2 MiB'));
              return;
            }
            setResult('');
            void file
              .text()
              .then(async (text) => {
                setCsv(text);
                setPreview(await api('contacts/import/preview', 'POST', { csv: text }));
              })
              .catch(setError);
          }}
        />
      </Field>
      {preview && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            const mapping = Object.fromEntries(
              [...new FormData(e.currentTarget)].filter(([, value]) => value !== ''),
            );
            void api<{ imported: number; duplicates: number }>('contacts/import', 'POST', {
              csv,
              mapping,
            })
              .then((r) => {
                setResult(`${r.imported} contacts imported; ${r.duplicates} duplicates merged.`);
                complete();
              }, setError)
              .finally(() => setBusy(false));
          }}
        >
          <p>{preview.rows} rows. Choose the field for each column.</p>
          <div className="mapping-grid">
            {preview.headers.map((header, index) => (
              <Field
                key={header}
                label={header}
                hint={`Sample: ${preview.sample[0]?.[index] ?? '—'}`}
              >
                <select
                  name={header}
                  defaultValue={header.toLowerCase() === 'email' ? 'email' : ''}
                >
                  <option value="">Skip column</option>
                  {[
                    'email',
                    'first_name',
                    'last_name',
                    'unsubscribed',
                    ...(properties.data ?? []).map((p) => `properties.${p.name}`),
                  ].map((field) => (
                    <option key={field}>{field}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <Button disabled={busy} className="primary">
            Import mapped contacts
          </Button>
        </form>
      )}
      <ErrorBox error={error} />
      {result && <p role="status">{result}</p>}
    </Modal>
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
      <ErrorBox error={error || query.error} />
      <DataTable
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
  if (id) return <TemplateEditor id={id} editable={editable} />;
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
      <ErrorBox error={query.error || error} />
      <DataTable
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
  const [version, setVersion] = useState(''),
    query = useApi<Template>(`templates/${id}${version ? `?version=${version}` : ''}`),
    [error, setError] = useState<unknown>(),
    [preview, setPreview] = useState<{ subject: string; html: string }>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setVersion(new URLSearchParams(location.search).get('version') ?? '');
  }, []);
  const data = query.data;
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
            onChange={(e) => {
              setVersion(e.target.value);
              setPreview(undefined);
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
      {data && (
        <form
          key={`${id}/${data.version}`}
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            const intent = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
            setBusy(true);
            setError(undefined);
            try {
              const content = {
                subject: form.subject,
                html: form.html,
                text: form.text || undefined,
                variables: JSON.parse(String(form.variables)),
              };
              const action =
                intent === 'preview'
                  ? api<{ subject: string; html: string }>('template-preview', 'POST', {
                      content,
                      variables: JSON.parse(String(form.sample)),
                    }).then(setPreview)
                  : api(`templates/${id}/versions`, 'POST', content).then(() => {
                      setVersion('');
                      void query.refetch();
                      void client.invalidateQueries({ queryKey: ['api', 'templates'] });
                    });
              void action.catch(setError).finally(() => setBusy(false));
            } catch (error) {
              setError(error);
              setBusy(false);
            }
          }}
        >
          <div className="detail-grid">
            <section className="panel">
              <Field label="Subject">
                <input name="subject" defaultValue={data.subject} readOnly={!editable} />
              </Field>
              <Field label="HTML">
                <textarea
                  name="html"
                  className="mono template-code"
                  defaultValue={data.html}
                  readOnly={!editable}
                />
              </Field>
              <Field label="Plain text">
                <textarea
                  name="text"
                  rows={3}
                  defaultValue={data.text_body ?? ''}
                  readOnly={!editable}
                />
              </Field>
              <Field label="Variable fallbacks (JSON)">
                <textarea
                  name="variables"
                  className="mono"
                  rows={3}
                  defaultValue={pretty(data.variables)}
                  readOnly={!editable}
                />
              </Field>
              <p className="small muted">
                Use {'{{first_name}}'} or {'{{payload.name}}'} in workflow templates. Broadcasts
                require {'{{{FLARE_UNSUBSCRIBE_URL}}}'}.
              </p>
              <div className="actions">
                <Button name="intent" value="preview" disabled={busy || !editable}>
                  Preview draft
                </Button>
                <Button name="intent" value="save" className="primary" disabled={busy || !editable}>
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
                  defaultValue={pretty({
                    first_name: 'Alex',
                    FLARE_UNSUBSCRIBE_URL: 'https://example.test/preferences',
                  })}
                />
              </Field>
              <h3>{preview?.subject ?? data.subject}</h3>
              <SafeEmailPreview html={preview?.html ?? data.html} />
              <p className="small muted">Remote images and scripts are blocked in the preview.</p>
            </section>
          </div>
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
type Broadcast = {
  id: string;
  name: string;
  sender: string;
  template_id: string;
  template_version: number;
  segment_id: string | null;
  topic_id: string | null;
  rate_per_second: number;
  status: string;
  scheduled_at: string;
  error: string | null;
  stats: {
    recipients: { status: string; count: number }[];
    messages: { status: string; count: number }[];
    events: { type: string; count: number }[];
  };
};
export function BroadcastsPage({ id, writable }: { id?: string; writable: boolean }) {
  const query = useApi<Broadcast[]>('broadcasts', 5000),
    templates = useApi<Template[]>('templates'),
    segments = useApi<Definition[]>('audience-segments'),
    topics = useApi<Definition[]>('audience-topics');
  const [creating, setCreating] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  if (id) return <BroadcastDetail id={id} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Broadcasts"
        description="Send a versioned email to an audience, with preferences checked at delivery."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setCreating(true)}>
            <Plus size={15} />
            Create broadcast
          </Button>
        }
      />
      <ErrorBox error={query.error || error} />
      <DataTable
        data={query.data ?? []}
        columns={[
          {
            accessorKey: 'name',
            header: 'Broadcast',
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
      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="Create broadcast"
        description="The current template version is pinned to this draft."
      >
        <ErrorBox error={templates.error || segments.error || topics.error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const form = Object.fromEntries(new FormData(e.currentTarget)),
              template = templates.data?.find((t) => t.id === form.template_id);
            void api<{ id: string }>('broadcasts', 'POST', {
              ...form,
              template_version: template?.current_version,
              segment_id: form.segment_id || null,
              topic_id: form.topic_id || null,
              rate_per_second: Number(form.rate_per_second),
            })
              .then((r) => router.push(`/broadcasts/${r.id}`), setError)
              .finally(() => setBusy(false));
          }}
        >
          <Field label="Broadcast name">
            <input name="name" required />
          </Field>
          <Field label="From address">
            <input name="sender" type="email" required placeholder="news@yourdomain.com" />
          </Field>
          <Field label="Email template">
            <select name="template_id" required>
              <option value="">Select a template</option>
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · v{t.current_version}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target segment">
            <select name="segment_id">
              <option value="">All contacts</option>
              {segments.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Audience topic">
            <select name="topic_id">
              <option value="">No topic</option>
              {topics.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Messages per second">
            <input name="rate_per_second" type="number" min={1} max={50} defaultValue={10} />
          </Field>
          <ErrorBox error={error} />
          <Button className="primary" disabled={busy}>
            Save draft
          </Button>
        </form>
      </Modal>
    </>
  );
}
function BroadcastDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Broadcast>(`broadcasts/${id}`, 3000),
    [error, setError] = useState<unknown>(),
    [scheduled, setScheduled] = useState('');
  const b = query.data;
  return (
    <>
      <Link className="back-link" href="/broadcasts">
        ← Broadcasts
      </Link>
      <PageHeader
        title={b?.name ?? 'Broadcast'}
        description={
          b
            ? `${b.sender} · template v${b.template_version} · up to ${b.rate_per_second} messages/second`
            : 'Loading campaign…'
        }
      />
      <ErrorBox error={error || query.error || b?.error} />
      {b && (
        <>
          <div className="inline-tags">
            <Badge>{b.status}</Badge>
            <span className="muted small">
              {b.scheduled_at ? date(b.scheduled_at) : 'Not scheduled'}
            </span>
            <Link href={`/templates/${b.template_id}?version=${b.template_version}`}>
              View template
            </Link>
          </div>
          {['draft', 'scheduled'].includes(b.status) && (
            <section className="panel">
              <h2>Schedule delivery</h2>
              <Field
                label="Send time"
                hint="Leave empty to start now, or enter an ISO timestamp with timezone / in 2 hours."
              >
                <input
                  value={scheduled}
                  onChange={(e) => setScheduled(e.target.value)}
                  placeholder="in 2 hours"
                />
              </Field>
              <ConfirmButton
                disabled={!writable}
                title="Schedule this broadcast?"
                description="The audience will be frozen now. Unsubscribed contacts and suppressed addresses will be skipped."
                onConfirm={async () => {
                  await api(
                    `broadcasts/${id}/schedule`,
                    'POST',
                    scheduled ? { scheduled_at: scheduled } : {},
                  );
                  await query.refetch();
                }}
              >
                <Send size={15} />
                {b.status === 'scheduled' ? 'Reschedule' : 'Schedule broadcast'}
              </ConfirmButton>
            </section>
          )}
          <div className="detail-grid">
            <section className="panel">
              <h2>Audience progress</h2>
              <DataTable
                paginate={false}
                data={b.stats.recipients}
                columns={[
                  { accessorKey: 'status', header: 'State' },
                  { accessorKey: 'count', header: 'Contacts' },
                ]}
              />
            </section>
            <section className="panel">
              <h2>Email outcomes</h2>
              <DataTable
                paginate={false}
                data={b.stats.messages}
                columns={[
                  { accessorKey: 'status', header: 'State' },
                  { accessorKey: 'count', header: 'Messages' },
                ]}
              />
              <p className="small muted">
                A sent broadcast has finished submitting its audience. Provider acceptance and
                delivery appear here as messages progress.
              </p>
            </section>
          </div>
          <section className="panel">
            <h2>Engagement events</h2>
            <DataTable
              paginate={false}
              data={b.stats.events}
              columns={[
                { accessorKey: 'type', header: 'Event' },
                { accessorKey: 'count', header: 'Unique messages' },
              ]}
            />
          </section>
          {!['sent', 'canceled'].includes(b.status) && (
            <ConfirmButton
              disabled={!writable}
              title="Cancel broadcast?"
              description="Pending audience work and emails that have not started delivery will be canceled. An active provider request may finish."
              onConfirm={async () => {
                try {
                  await api(`broadcasts/${id}/cancel`, 'POST', {});
                  await query.refetch();
                } catch (e) {
                  setError(e);
                  throw e;
                }
              }}
            >
              Cancel broadcast
            </ConfirmButton>
          )}
        </>
      )}
    </>
  );
}
