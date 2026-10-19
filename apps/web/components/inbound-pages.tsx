'use client';
import Link from 'next/link';
import { emailPreview, EMAIL_PREVIEW_CHAR_LIMIT } from '../lib/email-preview';
import { useEffect, useState } from 'react';
import { api, useApi, useAction, date, pretty } from '../lib/api';
import { browserTransfer, downloadFilename, responseJson } from '../lib/browser-transfers';
import { PageHeader, DataTable, Button, Badge, Field, Modal, ErrorBox, Loading, Empty } from './ui';
type InboundRow = {
  id: string;
  domain_id: string;
  mail_from: string;
  rcpt_to: string;
  subject: string;
  status: string;
  size: number;
  error: string | null;
  created_at: string;
  headers: unknown;
  attachments: { id: string; filename: string; size: number }[];
  attempts: unknown[];
  forwards: { id: string; status: string; message_id: string | null; error: string | null }[];
};
type Rule = {
  id: string;
  domain_id: string;
  recipient: string | null;
  sender: string;
  destinations: string[];
  enabled: boolean;
};
async function download(path: string, fallbackName: string) {
  const response = await browserTransfer(path, 'GET');
  let bytes: Blob;
  let filename: string;
  if (response) {
    if (!response.ok) await responseJson(response);
    bytes = await response.blob();
    filename = downloadFilename(response.headers.get('content-disposition'), fallbackName);
  } else {
    const file = await api<{ filename: string; content_type: string; content: string }>(path);
    bytes = new Blob([Uint8Array.from(atob(file.content), (v) => v.charCodeAt(0))], {
      type: 'application/octet-stream',
    });
    filename = downloadFilename(null, file.filename);
  }
  const url = URL.createObjectURL(bytes);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function InboundPage({ id, writable }: { id?: string; writable: boolean }) {
  if (id) return <InboundDetail id={id} />;
  return <InboundList writable={writable} />;
}
function InboundList({ writable }: { writable: boolean }) {
  const [page, setPage] = useState(1),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const read = () => {
      const value = Number(new URLSearchParams(location.search).get('page') ?? 1);
      setPage(Number.isSafeInteger(value) && value > 0 ? value : 1);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const goToPage = (value: number) => {
    const url = new URL(location.href);
    if (value > 1) url.searchParams.set('page', String(value));
    else url.searchParams.delete('page');
    history.pushState(null, '', url);
    setPage(value);
  };
  const query = useApi<{ data: InboundRow[] }>(`inbound?page=${page}`, 5000),
    rules = useApi<Rule[]>('forwarding-rules'),
    domains = useApi<{ id: string; name: string; receiving: boolean }[]>('domains'),
    create = useAction('forwarding-rules');
  const [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeader
        title="Received email"
        description="Mail received by your domains. Inspect its contents, envelope and forwarding history."
        actions={
          <Button disabled={!writable} onClick={() => setOpen(true)}>
            Add forwarding rule
          </Button>
        }
      />
      <ErrorBox error={query.error ?? rules.error ?? domains.error ?? error} />
      <p className="muted section-description">
        Looking for notifications inside your product? Open a subscriber’s In-app Inbox instead.
      </p>
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          key={page}
          data={query.data?.data ?? []}
          paginate={false}
          label="Received email"
          searchPlaceholder="Search this page…"
          columns={[
            {
              accessorKey: 'subject',
              header: 'Subject',
              cell: ({ row }) => (
                <Link href={`/inbound/${row.original.id}`}>
                  {row.original.subject ||
                    (row.original.status === 'parsed'
                      ? '(No subject)'
                      : row.original.status === 'failed'
                        ? '(Unparsed message)'
                        : 'Awaiting parsing')}
                </Link>
              ),
            },
            { accessorKey: 'mail_from', header: 'Envelope sender' },
            { accessorKey: 'rcpt_to', header: 'Envelope recipient' },
            {
              accessorKey: 'status',
              header: 'Status',
              cell: ({ row }) => <Badge>{row.original.status}</Badge>,
            },
            {
              accessorKey: 'created_at',
              header: 'Received',
              cell: ({ row }) => date(row.original.created_at),
            },
          ]}
        />
      )}
      <nav className="table-pagination" aria-label="Received email pages">
        <Button
          aria-label="Previous received messages"
          disabled={page === 1 || query.isFetching}
          onClick={() => goToPage(page - 1)}
        >
          Previous
        </Button>
        <span aria-live="polite">Page {page} · Up to 50 messages per page</span>
        <Button
          aria-label="Next received messages"
          disabled={query.isFetching || Boolean(query.error) || (query.data?.data.length ?? 0) < 50}
          onClick={() => goToPage(page + 1)}
        >
          Next
        </Button>
      </nav>
      <div className="panel-heading">
        <div>
          <h2>Forwarding rules</h2>
          <p>Choose which received addresses forward through a verified sender.</p>
        </div>
      </div>
      <DataTable
        data={rules.data ?? []}
        loading={rules.isPending}
        urlStateKey="forwarding"
        label="Forwarding rules"
        searchPlaceholder="Search forwarding rules…"
        columns={[
          {
            accessorKey: 'recipient',
            header: 'Recipient',
            cell: ({ row }) => row.original.recipient ?? 'All domain recipients',
          },
          { accessorKey: 'sender', header: 'Forward as' },
          {
            accessorKey: 'destinations',
            header: 'Destinations',
            cell: ({ row }) => row.original.destinations.join(', '),
          },
          {
            accessorKey: 'enabled',
            header: 'State',
            cell: ({ row }) => (
              <Button
                disabled={!writable}
                onClick={async () => {
                  try {
                    const { id, ...body } = row.original;
                    await api(`forwarding-rules/${id}`, 'PUT', {
                      domain_id: body.domain_id,
                      recipient: body.recipient,
                      sender: body.sender,
                      destinations: body.destinations,
                      enabled: !body.enabled,
                    });
                    await rules.refetch();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {row.original.enabled ? 'Enabled — disable' : 'Disabled — enable'}
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add forwarding rule"
        description="Forward through a verified sender. Automatic messages and forwarding loops are skipped."
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            try {
              await create.mutateAsync({
                domain_id: data.get('domain_id'),
                recipient: String(data.get('recipient') || '').trim() || null,
                sender: data.get('sender'),
                destinations: String(data.get('destinations'))
                  .split(',')
                  .map((v) => v.trim()),
                enabled: true,
              });
              setOpen(false);
            } catch {
              /* Mutation error is shown below. */
            }
          }}
        >
          <Field label="Receiving domain" hint="Enable receiving on a domain before adding a rule.">
            <select name="domain_id" required>
              {domains.data
                ?.filter((v) => v.receiving)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Recipient (blank for all)">
            <input name="recipient" type="email" />
          </Field>
          <Field label="Verified forwarding sender">
            <input name="sender" type="email" required />
          </Field>
          <Field label="Destinations, separated by commas">
            <input name="destinations" required />
          </Field>
          <ErrorBox error={create.error} />
          <Button
            className="primary"
            disabled={create.isPending || !domains.data?.some((domain) => domain.receiving)}
          >
            Create rule
          </Button>
        </form>
      </Modal>
    </>
  );
}
function InboundDetail({ id }: { id: string }) {
  const query = useApi<InboundRow>(`inbound/${id}`, 5000),
    [tab, setTab] = useState('text'),
    [error, setError] = useState<unknown>();
  if (query.isPending) return <Loading />;
  const row = query.data;
  if (!row) return <ErrorBox error={query.error} />;
  return (
    <>
      <Link href="/inbound" className="back-link">
        ← Received email
      </Link>
      <PageHeader
        title={row.subject || 'Inbound message'}
        description={`${row.mail_from || 'Empty envelope sender'} → ${row.rcpt_to}`}
        actions={
          <Button onClick={() => void download(`inbound/${id}/raw`, `${id}.eml`).catch(setError)}>
            Download original MIME
          </Button>
        }
      />
      <ErrorBox error={error ?? query.error ?? row.error} />
      <Badge>{row.status}</Badge>
      <p>
        Received {date(row.created_at)} · {row.size.toLocaleString()} bytes
      </p>
      <div className="section-tabs" role="group" aria-label="Received email content">
        {['text', 'html', 'headers', 'attempts'].map((v) => (
          <Button key={v} aria-pressed={tab === v} onClick={() => setTab(v)}>
            {
              {
                text: 'Plain text',
                html: 'HTML preview',
                headers: 'Headers',
                attempts: 'Parsing attempts',
              }[v]
            }
          </Button>
        ))}
      </div>
      {['text', 'html'].includes(tab) ? (
        row.status === 'parsed' ? (
          <InboundBody id={id} html={tab === 'html'} />
        ) : (
          <Empty
            title={
              row.status === 'failed' ? 'Message could not be parsed' : 'Message is being processed'
            }
          >
            The original MIME remains available. Check parsing attempts for processing details.
          </Empty>
        )
      ) : (
        <pre className="code-preview">{pretty(tab === 'headers' ? row.headers : row.attempts)}</pre>
      )}
      <h2>Attachments</h2>
      {!row.attachments.length && <p className="muted">No attachments.</p>}
      {row.attachments.map((file) => (
        <p key={file.id}>
          <Button
            onClick={() =>
              void download(`inbound/${id}/attachments/${file.id}`, file.filename).catch(setError)
            }
          >
            {file.filename} · {file.size} bytes
          </Button>
        </p>
      ))}
      <h2>Forwarding history</h2>
      {!row.forwards.length && <p className="muted">No forwarding attempts for this message.</p>}
      {row.forwards.map((v) => (
        <p key={v.id}>
          <Badge>{v.status}</Badge>{' '}
          {v.message_id ? (
            <Link href={`/emails/${v.message_id}`}>View outgoing email</Link>
          ) : (
            v.error
          )}
        </p>
      ))}
    </>
  );
}
function InboundBody({ id, html }: { id: string; html: boolean }) {
  const query = useApi<{ text: string; html: string }>(`inbound/${id}/body`);
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorBox error={query.error} />;
  const selected = (html ? query.data.html : query.data.text) || '';
  const truncated = selected.length > EMAIL_PREVIEW_CHAR_LIMIT;
  // Sanitize only the selected HTML tab. Full bytes remain available through downloads.
  return (
    <>
      {truncated && (
        <p className="muted" role="status">
          This preview is shortened. Download original MIME to read the full message.
        </p>
      )}
      {html ? (
        <iframe
          title="Received HTML preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={emailPreview(selected)}
          style={{ width: '100%', height: 420, border: '1px solid var(--border)' }}
        />
      ) : (
        <pre className="code-preview">
          {selected.slice(0, EMAIL_PREVIEW_CHAR_LIMIT) || 'No plain text body'}
        </pre>
      )}
    </>
  );
}
