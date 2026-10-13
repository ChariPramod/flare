'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Globe, ArrowUpRight, Send, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { useApi, useAction, date, pretty, api } from '../lib/api';
import {
  PageHeader,
  DataTable,
  Button,
  ConfirmButton,
  Badge,
  Modal,
  Field,
  ErrorBox,
  Loading,
} from './ui';
type Domain = {
  id: string;
  name: string;
  region: string;
  status: string;
  sending: boolean;
  receiving: boolean;
  open_tracking: boolean;
  click_tracking: boolean;
  tracking_subdomain: string;
  enforce_tls: boolean;
  created_at: string;
  checked_at: string;
  next_check_at: string;
  records: {
    type: string;
    name: string;
    value: string;
    purpose: string;
    status: string;
    required: boolean;
  }[];
};
export function Domains({ id, writable }: { id?: string; writable: boolean }) {
  const query = useApi<Domain[]>('domains', 10000),
    create = useAction<Domain>('domains'),
    router = useRouter();
  const [open, setOpen] = useState(false);
  if (id) return <DomainDetail id={id} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Domains"
        description="Send from a domain your recipients recognize and trust."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setOpen(true)}>
            <Plus size={16} />
            Add domain
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          data={query.data ?? []}
          searchPlaceholder="Search domains…"
          columns={[
            {
              accessorKey: 'name',
              header: 'Domain',
              cell: ({ row }) => (
                <Link className="entity-cell" href={`/domains/${row.original.id}`}>
                  <span className="entity-icon">
                    <Globe size={19} />
                  </span>
                  <strong>{row.original.name}</strong>
                </Link>
              ),
            },
            {
              accessorKey: 'status',
              header: 'Status',
              cell: ({ getValue }) => <Badge>{String(getValue()).replaceAll('_', ' ')}</Badge>,
            },
            { accessorKey: 'region', header: 'Region' },
            {
              header: 'Capabilities',
              cell: ({ row }) => (
                <div className="inline-tags">
                  {row.original.sending && <Badge>Sending</Badge>}
                  {row.original.receiving && <Badge>Receiving</Badge>}
                </div>
              ),
            },
            {
              accessorKey: 'created_at',
              header: 'Added',
              cell: ({ getValue }) => date(getValue()),
            },
            {
              id: 'open',
              cell: ({ row }) => (
                <Link
                  href={`/domains/${row.original.id}`}
                  className="icon-button"
                  aria-label={`Open ${row.original.name}`}
                >
                  <ArrowUpRight size={16} />
                </Link>
              ),
            },
          ]}
        />
      )}
      <div className="info-banner">
        <Globe size={18} />
        <div>
          <strong>A good sender reputation starts here.</strong>
          <p>
            Verify your DNS records before sending. Open and click tracking are off until you enable
            them.
          </p>
        </div>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add a sending domain"
        description="Use a domain or subdomain you own. We’ll generate the DNS records you need."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(Object.fromEntries(new FormData(e.currentTarget)), {
              onSuccess: (domain) => router.push(`/domains/${domain.id}`),
            });
          }}
        >
          <Field label="Domain name">
            <input required name="name" placeholder="notifications.yourcompany.com" />
          </Field>
          <Field label="Region">
            <select name="region">
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="eu-west-1">Europe (Ireland)</option>
              <option value="ap-south-1">Asia Pacific (Mumbai)</option>
            </select>
          </Field>
          <ErrorBox error={create.error} />
          <div className="dialog-actions">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="primary" disabled={create.isPending}>
              Add domain
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
function DomainDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Domain>(`domains/${id}`, 5000),
    verify = useAction(`domains/${id}/verify`),
    update = useAction(`domains/${id}`, 'PATCH');
  const [copied, setCopied] = useState('');
  if (query.isPending) return <Loading />;
  const domain = query.data;
  return (
    <>
      <Link href="/domains" className="back-link">
        ← Domains
      </Link>
      <PageHeader
        title={domain?.name ?? 'Domain'}
        description="Publish these records with your DNS provider, then verify."
        actions={
          <>
            <Badge>{domain?.status ?? 'loading'}</Badge>
            <Button disabled={!writable || verify.isPending} onClick={() => verify.mutate({})}>
              <RefreshCw size={15} />
              {verify.isPending ? 'Requesting…' : 'Verify DNS records'}
            </Button>
          </>
        }
      />
      <ErrorBox error={query.error || verify.error || update.error} />
      {domain && (
        <>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>DNS records</h2>
                <p>Keep these records in place. Flare checks verified domains daily.</p>
              </div>
              <span className="muted small">Last checked {date(domain.checked_at)}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Value</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {domain.records.map((record) => (
                    <tr key={`${record.type}/${record.name}`}>
                      <td>
                        <Badge>{record.type}</Badge>
                        <small className="muted block">{record.purpose.replace('_', ' ')}</small>
                      </td>
                      <td>
                        <code>{record.name}</code>
                      </td>
                      <td>
                        <code className="dns-value" title={record.value}>
                          {record.value}
                        </code>
                      </td>
                      <td>
                        <Badge>{record.required ? record.status : 'Optional'}</Badge>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Copy ${record.purpose} record`}
                          onClick={() => {
                            void navigator.clipboard.writeText(record.value).then(() => {
                              setCopied(record.purpose);
                              setTimeout(() => setCopied(''), 2000);
                            });
                          }}
                        >
                          {copied === record.purpose ? '✓' : <Copy size={15} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="detail-grid">
            <section className="panel">
              <h2>Tracking</h2>
              <p className="muted">Use a branded tracking domain to measure engagement.</p>
              {(['open_tracking', 'click_tracking'] as const).map((key) => (
                <label className="setting-row" key={key}>
                  <span>
                    <strong>{key === 'open_tracking' ? 'Open tracking' : 'Click tracking'}</strong>
                    <small>
                      {key === 'open_tracking'
                        ? 'Record opens with a signed tracking pixel.'
                        : 'Route HTTP links through signed redirects.'}
                    </small>
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    checked={domain[key]}
                    disabled={!writable || update.isPending}
                    onChange={(e) => update.mutate({ [key]: e.target.checked })}
                  />
                </label>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate(Object.fromEntries(new FormData(e.currentTarget)));
                }}
              >
                <Field label="Tracking subdomain">
                  <input
                    name="tracking_subdomain"
                    defaultValue={domain.tracking_subdomain}
                    disabled={!writable}
                  />
                </Field>
                <Button disabled={!writable || update.isPending}>Save tracking domain</Button>
              </form>
            </section>
            <section className="panel">
              <h2>Delivery settings</h2>
              {(['sending', 'receiving', 'enforce_tls'] as const).map((key) => (
                <label key={key} className="setting-row">
                  <span>
                    <strong>
                      {key === 'enforce_tls'
                        ? 'Require TLS'
                        : key === 'sending'
                          ? 'Sending enabled'
                          : 'Receiving enabled'}
                    </strong>
                    <small>
                      {key === 'enforce_tls'
                        ? 'Use only transports that guarantee encrypted delivery.'
                        : key === 'receiving'
                          ? 'Publish an MX record for inbound mail.'
                          : 'Allow verified addresses on this domain to send.'}
                    </small>
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    disabled={!writable || update.isPending}
                    checked={domain[key]}
                    onChange={(e) => update.mutate({ [key]: e.target.checked })}
                  />
                </label>
              ))}
              <div className="small muted">
                Changes require DNS verification before sending resumes.
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
type Email = {
  id: string;
  domain_id: string;
  from: string;
  subject: string;
  status: string;
  scheduled_at: string;
  created_at: string;
  request: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    attachments: unknown[];
  };
  recipients: { address: string; kind: string; status: string }[];
  events: { type: string; recipient: string; created_at: string }[];
  attempts: {
    provider: string;
    ordinal: number;
    status: string;
    error?: string;
    started_at: string;
  }[];
  error?: string;
  delivery_started_at?: string;
};
export function Emails({ id, writable }: { id?: string; writable: boolean }) {
  const query = useApi<Email[]>('emails', 5000);
  const [open, setOpen] = useState(false);
  if (id) return <EmailDetail id={id} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Emails"
        description="Every message, from accepted to delivered."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setOpen(true)}>
            <Send size={15} />
            Send email
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          data={query.data ?? []}
          searchPlaceholder="Search emails…"
          columns={[
            {
              accessorKey: 'subject',
              header: 'Subject',
              cell: ({ row }) => (
                <Link className="strong" href={`/emails/${row.original.id}`}>
                  {row.original.subject || '(No subject)'}
                </Link>
              ),
            },
            { accessorKey: 'from', header: 'From' },
            {
              accessorKey: 'status',
              header: 'Status',
              cell: ({ getValue }) => <Badge>{String(getValue())}</Badge>,
            },
            {
              accessorKey: 'created_at',
              header: 'Created',
              cell: ({ getValue }) => date(getValue()),
            },
            {
              accessorKey: 'scheduled_at',
              header: 'Scheduled',
              cell: ({ getValue }) => date(getValue()),
            },
          ]}
        />
      )}
      {open && <Compose close={() => setOpen(false)} />}
    </>
  );
}
function Compose({ close }: { close: () => void }) {
  const domains = useApi<Domain[]>('domains'),
    send = useAction<{ id: string }>('emails', 'POST', true),
    router = useRouter();
  const [html, setHtml] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && close()}
      title="Send an email"
      description="Send now or schedule for later. Your sender domain must be verified."
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          void Promise.all(
            files.map(async (file) => ({
              filename: file.name,
              content_type: file.type || 'application/octet-stream',
              content: await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1]!);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              }),
            })),
          ).then(
            (attachments) => {
              const { body, cc, bcc, scheduled_at, ...rest } = form;
              send.mutate(
                {
                  ...rest,
                  to: String(form.to)
                    .split(',')
                    .map((v) => v.trim()),
                  ...(cc
                    ? {
                        cc: String(cc)
                          .split(',')
                          .map((v) => v.trim()),
                      }
                    : {}),
                  ...(bcc
                    ? {
                        bcc: String(bcc)
                          .split(',')
                          .map((v) => v.trim()),
                      }
                    : {}),
                  [html ? 'html' : 'text']: body,
                  ...(scheduled_at ? { scheduled_at } : {}),
                  attachments,
                },
                {
                  onSuccess: (result) => router.push(`/emails/${result.id}`),
                  onSettled: () => setBusy(false),
                },
              );
            },
            (e) => {
              setError(e);
              setBusy(false);
            },
          );
        }}
      >
        <div className="form-grid">
          <Field label="From">
            <input
              name="from"
              required
              type="email"
              placeholder="hello@yourdomain.com"
              list="sender-domains"
            />
            <datalist id="sender-domains">
              {domains.data
                ?.filter((d) => d.status === 'verified')
                .map((d) => (
                  <option key={d.id} value={`hello@${d.name}`} />
                ))}
            </datalist>
          </Field>
          <Field label="To" hint="Separate multiple recipients with commas.">
            <input name="to" required placeholder="recipient@example.com" />
          </Field>
          <Field label="Cc">
            <input name="cc" />
          </Field>
          <Field label="Bcc">
            <input name="bcc" />
          </Field>
        </div>
        <Field label="Subject">
          <input name="subject" required placeholder="A little update from us" />
        </Field>
        <div className="field-label">
          Message{' '}
          <label className="inline-check">
            <input type="checkbox" checked={html} onChange={(e) => setHtml(e.target.checked)} />
            HTML
          </label>
        </div>
        <textarea
          name="body"
          aria-label="Message body"
          required
          className="message-body mono"
          rows={8}
          placeholder={html ? '<h1>Hello there</h1>' : 'Hello there,'}
        />
        <div className="form-grid">
          <Field label="Schedule" hint="Leave empty to send now. Natural language uses UTC.">
            <input name="scheduled_at" placeholder="in 2 hours" />
          </Field>
          <Field label="Attachments" hint="10 MiB combined by default.">
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </Field>
        </div>
        <ErrorBox error={send.error || error} />
        <div className="dialog-actions">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button className="primary" disabled={busy || send.isPending}>
            <Send size={15} />
            {busy ? 'Submitting…' : 'Send email'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function EmailDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Email>(`emails/${id}`, 5000),
    cancel = useAction(`emails/${id}/cancel`),
    reschedule = useAction(`emails/${id}`, 'PATCH');
  const [schedule, setSchedule] = useState(''),
    [tab, setTab] = useState('preview');
  const [source, setSource] = useState(''),
    [sourceError, setSourceError] = useState<unknown>();
  const message = query.data;
  return (
    <>
      <Link href="/emails" className="back-link">
        ← Emails
      </Link>
      <PageHeader
        title={message?.request.subject ?? 'Email details'}
        description={id}
        actions={<Badge>{message?.status ?? 'loading'}</Badge>}
      />
      <ErrorBox error={query.error || cancel.error || reschedule.error || sourceError} />
      {message && (
        <div className="detail-grid">
          <section className="panel">
            <h2>Delivery details</h2>
            <dl>
              <div>
                <dt>From</dt>
                <dd>{message.request.from}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{date(message.created_at)}</dd>
              </div>
              <div>
                <dt>Scheduled</dt>
                <dd>{date(message.scheduled_at)}</dd>
              </div>
            </dl>
            <h3>Recipients</h3>
            {message.recipients.map((r) => (
              <div className="recipient-row" key={r.address}>
                <span>
                  {r.address}
                  <small>{r.kind}</small>
                </span>
                <Badge>{r.status}</Badge>
              </div>
            ))}
            <ErrorBox error={message.error} />
            {['queued', 'scheduled'].includes(message.status) &&
              !message.delivery_started_at &&
              writable && (
                <div className="schedule-controls">
                  <Field label="Reschedule">
                    <input
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      placeholder="tomorrow at 9am"
                    />
                  </Field>
                  <Button
                    disabled={!schedule || reschedule.isPending}
                    onClick={() => reschedule.mutate({ scheduled_at: schedule })}
                  >
                    Update schedule
                  </Button>
                  <ConfirmButton
                    className="danger"
                    disabled={cancel.isPending}
                    title="Cancel scheduled email?"
                    description="This email will not be delivered. Messages already being delivered cannot be canceled."
                    onConfirm={() => cancel.mutateAsync({})}
                  >
                    Cancel email
                  </ConfirmButton>
                </div>
              )}
            <h3>Timeline</h3>
            <div className="timeline">
              <div>
                <i />
                <strong>Accepted by Flare</strong>
                <small>{date(message.created_at)}</small>
              </div>
              {message.attempts.map((attempt) => (
                <div key={attempt.ordinal}>
                  <i />
                  <strong>
                    {attempt.provider} · {attempt.status.replace('_', ' ')}
                  </strong>
                  <small>
                    {date(attempt.started_at)}
                    {attempt.error && ` · ${attempt.error}`}
                  </small>
                </div>
              ))}
              {message.events.map((event, index) => (
                <div key={index}>
                  <i />
                  <strong>{event.type}</strong>
                  <small>
                    {date(event.created_at)} · {event.recipient}
                  </small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="section-tabs">
              <button
                className={tab === 'preview' ? 'selected' : ''}
                onClick={() => setTab('preview')}
              >
                Preview
              </button>
              <button
                className={tab === 'source' ? 'selected' : ''}
                onClick={() => setTab('source')}
              >
                Request
              </button>
            </div>
            <div className="actions">
              <Button className="compact" onClick={() => setTab('text')}>
                Plain text
              </Button>
              <Button
                className="compact"
                onClick={() => {
                  setTab('raw');
                  void api<{ source: string }>(`emails/${id}/source`).then(
                    (value) => setSource(value.source),
                    setSourceError,
                  );
                }}
              >
                Raw MIME
              </Button>
            </div>
            {tab === 'text' ? (
              <pre className="text-preview">{message.request.text || 'No plain-text part'}</pre>
            ) : tab === 'raw' ? (
              <pre>{source || 'Loading MIME source…'}</pre>
            ) : tab === 'source' ? (
              <pre>{pretty(message.request)}</pre>
            ) : message.request.html ? (
              <iframe
                title="Email preview"
                className="email-preview"
                sandbox=""
                srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${message.request.html}`}
              />
            ) : (
              <pre className="text-preview">{message.request.text}</pre>
            )}
          </section>
        </div>
      )}
    </>
  );
}
export function Suppressions({ writable }: { writable: boolean }) {
  const query = useApi<{ email: string; reason: string; created_at: string }[]>('suppressions'),
    create = useAction('suppressions');
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Suppressions"
        description="Protected addresses across every domain and environment in your organization."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setOpen(true)}>
            <Plus size={15} />
            Add suppression
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      <DataTable
        data={query.data ?? []}
        columns={[
          { accessorKey: 'email', header: 'Email' },
          {
            accessorKey: 'reason',
            header: 'Reason',
            cell: ({ getValue }) => <Badge>{String(getValue()).replaceAll('_', ' ')}</Badge>,
          },
          { accessorKey: 'created_at', header: 'Added', cell: ({ getValue }) => date(getValue()) },
          {
            id: 'delete',
            cell: ({ row }) => (
              <ConfirmButton
                className="compact danger"
                disabled={!writable}
                aria-label={`Remove suppression for ${row.original.email}`}
                title="Remove suppression?"
                description="This address will be eligible for email again. Only remove a suppression when the recipient expects mail."
                onConfirm={async () => {
                  await api(`suppressions/${encodeURIComponent(row.original.email)}`, 'DELETE');
                  await query.refetch();
                }}
              >
                <Trash2 size={15} />
              </ConfirmButton>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Suppress an address"
        description="Messages to this address will be skipped across your organization."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(Object.fromEntries(new FormData(e.currentTarget)), {
              onSuccess: () => setOpen(false),
            });
          }}
        >
          <Field label="Email">
            <input type="email" required name="email" />
          </Field>
          <ErrorBox error={create.error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={create.isPending}>
              Add suppression
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
