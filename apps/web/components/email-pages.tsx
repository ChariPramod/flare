'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Globe, ArrowUpRight, Send, Copy, RefreshCw, Trash2, X } from 'lucide-react';
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
  ownership_status?: string;
  readiness?: {
    environment: string;
    blockers?: string[];
    transports?: {
      transport_instance: string;
      provider: string;
      ready: boolean;
      blockers: string[];
      dkim_aligned: boolean | null;
      spf_aligned: boolean | null;
    }[];
  };
  sending: boolean;
  receiving: boolean;
  open_tracking: boolean;
  click_tracking: boolean;
  tracking_subdomain: string;
  enforce_tls: boolean;
  created_at: string;
  checked_at: string | null;
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
function DomainReadiness({ domain }: { domain: Domain }) {
  const checked = domain.checked_at ? Date.parse(domain.checked_at) : NaN;
  const fresh =
    Number.isFinite(checked) && checked <= Date.now() && Date.now() - checked < 24 * 60 * 60 * 1000;
  const readiness = domain.readiness;
  const alignment = (value: boolean | null | undefined) =>
    value == null ? 'Unknown' : value ? 'Aligned' : 'Not aligned';
  return (
    <section className="panel" aria-label="Domain sending readiness">
      <div className="panel-heading">
        <h2>Sending readiness</h2>
        <Badge>{readiness?.environment ?? 'Environment unavailable'}</Badge>
      </div>
      <p>
        Domain ownership: <strong>{domain.ownership_status ?? domain.status}</strong>. Ownership
        verification does not grant organization approval or verify a provider route.
      </p>
      <p>
        DNS checked {date(domain.checked_at)} ·{' '}
        <strong>
          {!Number.isFinite(checked)
            ? 'Freshness unavailable'
            : fresh
              ? 'DNS evidence less than 24 hours old'
              : 'DNS evidence stale or future dated'}
        </strong>
      </p>
      <p className="muted">
        Production requires DNS and transport evidence less than 24 hours old. Flare refreshes
        verified-domain DNS hourly; provider evidence requires operator review.
      </p>
      {readiness?.environment === 'Development' && (
        <p>Development checks do not certify Production readiness.</p>
      )}
      {!readiness ? (
        <p>
          Transport readiness is unavailable. Contact your platform operator before real sending.
        </p>
      ) : (
        <>
          {(readiness.blockers ?? []).map((blocker) => (
            <p key={blocker}>Blocked: {blocker.replaceAll('_', ' ')}.</p>
          ))}
          {readiness.transports?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Transport</th>
                    <th>Readiness</th>
                    <th>DKIM</th>
                    <th>SPF</th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.transports.map((transport) => (
                    <tr key={transport.transport_instance}>
                      <td>
                        {transport.transport_instance}
                        <small className="muted block">{transport.provider}</small>
                      </td>
                      <td>
                        <Badge>{transport.ready ? 'Readiness passes' : 'Blocked'}</Badge>
                        {transport.blockers.map((blocker) => (
                          <small className="block" key={blocker}>
                            {blocker.replaceAll('_', ' ')}
                          </small>
                        ))}
                      </td>
                      <td>{alignment(transport.dkim_aligned)}</td>
                      <td>{alignment(transport.spf_aligned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No approved transport readiness is available for this domain.</p>
          )}
        </>
      )}
      <p className="muted">
        Organization approval, sending limits and route availability still apply. Your platform
        operator reviews provider evidence and route assignments.
      </p>
    </section>
  );
}
function DomainDetail({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Domain>(`domains/${id}`, 5000),
    verify = useAction(`domains/${id}/verify`),
    update = useAction(`domains/${id}`, 'PATCH');
  const [copied, setCopied] = useState(''),
    [copyError, setCopyError] = useState<unknown>();
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
      <ErrorBox error={query.error || verify.error || update.error || copyError} />
      {domain && (
        <>
          <DomainReadiness domain={domain} />
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>DNS records</h2>
                <p>Keep these records in place. Flare checks verified domains hourly.</p>
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
                            setCopyError(undefined);
                            void navigator.clipboard.writeText(record.value).then(
                              () => {
                                setCopied(record.purpose);
                                setTimeout(() => setCopied(''), 2000);
                              },
                              () =>
                                setCopyError(
                                  new Error(
                                    'The record could not be copied. Select and copy the DNS value manually.',
                                  ),
                                ),
                            );
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
  hold_reason?: string | null;
  next_attempt_at?: string | null;
  traffic_class?: 'transactional' | 'marketing' | null;
  route_snapshot?: { id: string; revision: number } | null;
};
type SendingPolicy = {
  state: 'pending_review' | 'approved' | 'suspended';
  revision: number;
  daily_limit: number;
  per_minute_limit: number;
  suspension_reason?: string | null;
  usage: { reserved: number; sent_24h: number };
  feedback?: {
    recipients_24h?: number;
    hard_bounces?: number;
    complaints?: number;
    unknown?: number;
  };
};
function deliveryLabel(status: string) {
  return (
    {
      queued: 'Accepted',
      sent: 'Provider accepted',
      delivered: 'Delivered',
      held: 'On hold',
      delivery_delayed: 'Delivery delayed',
    }[status] ?? status.replaceAll('_', ' ')
  );
}
function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`;
  if (bytes >= 1024)
    return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`;
  return `${bytes.toLocaleString()} bytes`;
}
type EmailCapabilities = {
  attachment_max_bytes: number;
  attachment_max_count: number;
  mime_max_bytes: number;
};
function SendingPolicySummary() {
  const query = useApi<SendingPolicy>('sending-policy', 15000);
  const policy = query.error ? undefined : query.data;
  return (
    <section className="panel" aria-label="Organization sending access">
      <div className="panel-heading">
        <h2>Sending access</h2>
        {policy && <Badge>{policy.state.replaceAll('_', ' ')}</Badge>}
      </div>
      <ErrorBox error={query.error} />
      {policy ? (
        <>
          <p>
            {policy.state === 'approved'
              ? 'Your organization is approved for sending within its reviewed limits.'
              : policy.state === 'suspended'
                ? 'Sending is paused. Contact your platform operator to review the restriction.'
                : 'Real sending requires platform review. Sandbox submission may remain available where configured.'}
          </p>
          {policy.suspension_reason && <p>Reason: {policy.suspension_reason}</p>}
          <p className="muted">
            24-hour recipient allowance: {policy.daily_limit.toLocaleString()} · Used:{' '}
            {policy.usage.sent_24h.toLocaleString()} · Reserved:{' '}
            {policy.usage.reserved.toLocaleString()} · Per-minute limit:{' '}
            {policy.per_minute_limit.toLocaleString()}
          </p>
          <p className="muted" aria-label="Authenticated sending feedback">
            24-hour recipient cohort:{' '}
            {policy.feedback?.recipients_24h?.toLocaleString() ?? 'Unavailable'} · Hard bounces:{' '}
            {policy.feedback?.hard_bounces?.toLocaleString() ?? 'Unavailable'} · Complaints:{' '}
            {policy.feedback?.complaints?.toLocaleString() ?? 'Unavailable'} · Unknown bounces:{' '}
            {policy.feedback?.unknown?.toLocaleString() ?? 'Unavailable'}
          </p>
          <p className="muted">
            Unknown bounce classifications do not count toward the hard-bounce rate. Sending access
            is reviewed separately from recipient suppression.
          </p>
        </>
      ) : query.isPending ? (
        <p className="muted">Loading sending access…</p>
      ) : (
        <div>
          <p className="muted">Sending access is unavailable. Retry to check the current policy.</p>
          <Button
            className="compact"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry sending access
          </Button>
        </div>
      )}
    </section>
  );
}
export function Emails({ id, writable }: { id?: string; writable: boolean }) {
  const query = useApi<Email[]>('emails', 5000);
  const [open, setOpen] = useState(false);
  if (id) return <EmailDetail id={id} writable={writable} />;
  return (
    <>
      <PageHeader
        title="Emails"
        description="Follow each accepted message through scheduling, provider submission and delivery feedback."
        actions={
          <Button className="primary" disabled={!writable} onClick={() => setOpen(true)}>
            <Send size={15} />
            Send email
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      <SendingPolicySummary />
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
              cell: ({ row }) => (
                <div>
                  <Badge tone={row.original.status}>{deliveryLabel(row.original.status)}</Badge>
                  {row.original.hold_reason && (
                    <small className="muted block">
                      {row.original.hold_reason.replaceAll('_', ' ')}
                    </small>
                  )}
                </div>
              ),
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
    capabilities = useApi<EmailCapabilities>('email-capabilities'),
    send = useAction<{ id: string }>('emails', 'POST', true),
    router = useRouter();
  const [html, setHtml] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const limits = capabilities.error ? undefined : capabilities.data;
  const attachmentLimitsUnavailable = files.length > 0 && !limits;
  const attachmentLimit = limits?.attachment_max_bytes;
  const countLimit = limits?.attachment_max_count ?? 50;
  const attachmentError =
    files.length > countLimit
      ? `Select at most ${countLimit} attachments. Remove files before sending.`
      : attachmentLimit !== undefined && totalBytes > attachmentLimit
        ? `Combined attachments exceed the ${fileSize(attachmentLimit)} limit. Remove files before sending.`
        : null;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && !busy && !send.isPending && close()}
      title="Send an email"
      description="Send now or schedule for later. Your sender domain must be verified."
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || send.isPending || attachmentError || attachmentLimitsUnavailable) return;
          const form = Object.fromEntries(new FormData(e.currentTarget));
          setError(undefined);
          send.reset();
          setBusy(true);
          void Promise.all(
            files.map(async (file) => ({
              filename: file.name,
              content_type: file.type || 'application/octet-stream',
              content: await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1]!);
                reader.onerror = () =>
                  reject(new Error(`Could not read ${file.name}. Try selecting the file again.`));
                reader.onabort = () =>
                  reject(
                    new Error(`Reading ${file.name} was interrupted. Your message is still here.`),
                  );
                reader.readAsDataURL(file);
              }),
            })),
          ).then(
            (attachments) => {
              const { body, cc, bcc, scheduled_at, traffic_class, ...rest } = form;
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
                  ...(traffic_class ? { traffic_class } : {}),
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
        <fieldset className="form-fields" disabled={busy || send.isPending}>
          <ErrorBox error={domains.error} />
          <p className="muted section-description">
            Sender verification and organization approval are checked again before delivery.
            Accepted messages may be held when a sending restriction applies.
          </p>
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
          <Field
            label="Traffic classification"
            hint="Marketing requires platform approval and recipient unsubscribe support."
          >
            <select name="traffic_class">
              <option value="">Use approved organization default</option>
              <option value="transactional">Transactional</option>
              <option value="marketing">Marketing</option>
            </select>
          </Field>
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
            <Field
              label="Attachments"
              hint={
                limits
                  ? `${fileSize(limits.attachment_max_bytes)} combined, up to ${limits.attachment_max_count} files. Final MIME limit: ${fileSize(limits.mime_max_bytes)}.`
                  : capabilities.isPending
                    ? 'Loading configured attachment limits…'
                    : 'Attachment limits are unavailable. Retry before sending attachments, or remove them to send without attachments.'
              }
            >
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.files ?? []);
                  setFiles((current) => [...current, ...selected]);
                  e.currentTarget.value = '';
                }}
              />
            </Field>
          </div>
          {!limits && !capabilities.isPending && (
            <Button
              type="button"
              className="compact"
              disabled={capabilities.isFetching}
              onClick={() => void capabilities.refetch()}
            >
              Retry attachment limits
            </Button>
          )}
          {files.length > 0 && (
            <div className="attachment-summary">
              <p className="small muted" role="status" aria-live="polite">
                {files.length} {files.length === 1 ? 'attachment' : 'attachments'} ·{' '}
                {fileSize(totalBytes)} selected
              </p>
              <ul className="attachment-list" aria-label="Selected attachments">
                {files.map((file, index) => (
                  <li key={`${file.name}/${index}`}>
                    <span>
                      {file.name} <small className="muted">{fileSize(file.size)}</small>
                    </span>
                    <Button
                      type="button"
                      className="compact"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFiles((current) => current.filter((_, position) => position !== index))
                      }
                    >
                      <X size={15} aria-hidden="true" />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ErrorBox error={attachmentError ?? send.error ?? error} />
          {(busy || send.isPending) && (
            <p className="small muted" role="status" aria-live="polite">
              {send.isPending ? 'Submitting your message…' : 'Reading attachments…'}
            </p>
          )}
          <div className="dialog-actions">
            <Button type="button" onClick={close} disabled={busy || send.isPending}>
              Cancel
            </Button>
            <Button
              className="primary"
              disabled={
                busy || send.isPending || Boolean(attachmentError) || attachmentLimitsUnavailable
              }
            >
              <Send size={15} />
              {busy ? 'Submitting…' : 'Send email'}
            </Button>
          </div>
        </fieldset>
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
    [sourceError, setSourceError] = useState<unknown>(),
    [sourceLoading, setSourceLoading] = useState(false);
  const message = query.data;
  const uncertain = message?.attempts.some((attempt) => attempt.status === 'ambiguous');
  const failedRecipients =
    message?.recipients.filter((recipient) => recipient.status === 'failed') ?? [];
  if (query.isPending) return <Loading />;
  return (
    <>
      <Link href="/emails" className="back-link">
        ← Emails
      </Link>
      <PageHeader
        title={message?.request.subject ?? 'Email details'}
        description={id}
        actions={
          message && (
            <Badge tone={uncertain && message.status === 'failed' ? 'ambiguous' : message.status}>
              {uncertain && message.status === 'failed'
                ? 'Acceptance uncertain'
                : deliveryLabel(message.status)}
            </Badge>
          )
        }
      />
      <ErrorBox error={query.error || cancel.error || reschedule.error || sourceError} />
      <SendingPolicySummary />
      {uncertain && (
        <section className="info-banner" aria-label="Uncertain email acceptance">
          <div>
            <strong>
              {failedRecipients.length
                ? 'Provider acceptance is uncertain'
                : 'An earlier attempt had uncertain acceptance'}
            </strong>
            <p>
              A recorded transport attempt ended without a confirmed acceptance result. The provider
              may have received the message. Automatic retries and failover do not replay ambiguous
              attempts.
            </p>
            <p>
              {failedRecipients.length
                ? `${failedRecipients.length} ${failedRecipients.length === 1 ? 'recipient currently has' : 'recipients currently have'} failed status. Provider acceptance for these recipients may still be uncertain; review their individual events before sending again.`
                : 'Current recipient statuses are shown below. The earlier ambiguous attempt remains in the history; its outcome is not inferred from the message’s overall status.'}
            </p>
            <p>
              Ask your platform operator to reconcile the attempt with provider evidence before
              sending again.
            </p>
          </div>
        </section>
      )}
      {message &&
        ['queued', 'scheduled', 'sent', 'delivered', 'delivery_delayed'].includes(
          message.status,
        ) && (
          <section className="info-banner" aria-label="Email delivery status">
            <div>
              <strong>{deliveryLabel(message.status)}</strong>
              <p>
                {message.status === 'sent'
                  ? 'The sending provider accepted this message. Delivery feedback from the receiving server is still pending.'
                  : message.status === 'delivered'
                    ? 'Provider feedback confirms delivery to the receiving server. Inbox placement is not measured here.'
                    : message.status === 'delivery_delayed'
                      ? 'The provider reports a delivery delay. Recipient feedback will appear in the timeline when it arrives.'
                      : message.status === 'scheduled'
                        ? 'Flare has saved this message for its scheduled time. Sending policy and quota are checked when it becomes due.'
                        : 'Flare has saved this message for processing. Provider acceptance and delivery feedback will appear separately.'}
              </p>
              {message.next_attempt_at && (
                <p>Next attempt eligibility: {date(message.next_attempt_at)}.</p>
              )}
            </div>
          </section>
        )}
      {message?.status === 'held' && (
        <section className="info-banner" aria-label="Email on hold">
          <div>
            <strong>Sending is on hold</strong>
            <p>
              {message.hold_reason
                ? message.hold_reason.replaceAll('_', ' ')
                : 'A sending restriction must be resolved before delivery can continue.'}
            </p>
            {message.next_attempt_at && (
              <p>
                Next eligibility check: {date(message.next_attempt_at)}. This is not a delivery
                guarantee.
              </p>
            )}
            <p>
              Flare retains this accepted message. Review the sending restriction with your platform
              operator.
            </p>
          </div>
        </section>
      )}
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
              <div>
                <dt>Traffic classification</dt>
                <dd>{message.traffic_class ?? 'Not classified'}</dd>
              </div>
              {message.route_snapshot && (
                <div>
                  <dt>Provider route</dt>
                  <dd>
                    {message.route_snapshot.id} · Revision {message.route_snapshot.revision}
                  </dd>
                </div>
              )}
            </dl>
            <h3>Recipients</h3>
            {message.recipients.map((r) => (
              <div className="recipient-row" key={r.address}>
                <span>
                  {r.address}
                  <small>{r.kind}</small>
                </span>
                <Badge tone={r.status}>{deliveryLabel(r.status)}</Badge>
              </div>
            ))}
            <ErrorBox error={message.error} />
            {['queued', 'scheduled', 'held'].includes(message.status) &&
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
                    title={
                      message.status === 'held' ? 'Cancel held email?' : 'Cancel scheduled email?'
                    }
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
            <div className="section-tabs" role="group" aria-label="Sent email content">
              <button
                className={tab === 'preview' ? 'selected' : ''}
                aria-pressed={tab === 'preview'}
                onClick={() => setTab('preview')}
              >
                Preview
              </button>
              <button
                className={tab === 'source' ? 'selected' : ''}
                aria-pressed={tab === 'source'}
                onClick={() => setTab('source')}
              >
                Request
              </button>
            </div>
            <div className="actions">
              <Button
                className="compact"
                aria-pressed={tab === 'text'}
                onClick={() => setTab('text')}
              >
                Plain text
              </Button>
              <Button
                className="compact"
                aria-pressed={tab === 'raw'}
                disabled={sourceLoading}
                onClick={() => {
                  setTab('raw');
                  setSourceError(undefined);
                  setSourceLoading(true);
                  void api<{ source: string }>(`emails/${id}/source`)
                    .then((value) => setSource(value.source), setSourceError)
                    .finally(() => setSourceLoading(false));
                }}
              >
                Raw MIME
              </Button>
            </div>
            {tab === 'text' ? (
              <pre className="text-preview">{message.request.text || 'No plain-text part'}</pre>
            ) : tab === 'raw' ? (
              sourceLoading ? (
                <Loading />
              ) : sourceError ? (
                <p className="muted">MIME source could not be loaded. Select Raw MIME to retry.</p>
              ) : (
                <pre>{source || 'No MIME source available.'}</pre>
              )
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
  const query =
      useApi<{ email: string; reason: string; protected?: boolean; created_at: string }[]>(
        'suppressions',
      ),
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
        loading={query.isPending}
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
                disabled={!writable || row.original.protected || row.original.reason !== 'manual'}
                aria-label={`Remove suppression for ${row.original.email}`}
                title="Remove suppression?"
                description="Remove this manually added suppression only when the recipient expects mail. Provider restrictions require operator review."
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
