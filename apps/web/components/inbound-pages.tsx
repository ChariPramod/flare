'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApi, useAction, date, pretty } from '../lib/api';
import { PageHeader, DataTable, Button, Badge, Field, Modal, ErrorBox, Loading } from './ui';
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
async function download(path: string) {
  const file = await api<{ filename: string; content_type: string; content: string }>(path);
  const bytes = Uint8Array.from(atob(file.content), (v) => v.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
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
  const query = useApi<{ data: InboundRow[] }>(`inbound?page=${page}`, 5000),
    rules = useApi<Rule[]>('forwarding-rules'),
    domains = useApi<{ id: string; name: string; receiving: boolean }[]>('domains'),
    create = useAction('forwarding-rules');
  const [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeader
        title="Inbound"
        description="Received messages, original source and forwarding history."
        actions={
          <Button disabled={!writable} onClick={() => setOpen(true)}>
            Add forwarding rule
          </Button>
        }
      />
      <ErrorBox error={query.error ?? rules.error ?? error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          data={query.data?.data ?? []}
          columns={[
            {
              accessorKey: 'subject',
              header: 'Subject',
              cell: ({ row }) => (
                <Link href={`/inbound/${row.original.id}`}>
                  {row.original.subject || 'Awaiting parsing'}
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
      <div className="actions">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>Page {page}</span>
        <Button disabled={(query.data?.data.length ?? 0) < 50} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
      <h2>Forwarding rules</h2>
      <DataTable
        data={rules.data ?? []}
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
          <Field label="Receiving domain">
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
          <Button className="primary" disabled={create.isPending}>
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
      <PageHeader
        title={row.subject || 'Inbound message'}
        description={`${row.mail_from || 'Empty envelope sender'} → ${row.rcpt_to}`}
        actions={
          <Button onClick={() => void download(`inbound/${id}/raw`).catch(setError)}>
            Download original MIME
          </Button>
        }
      />
      <ErrorBox error={error ?? row.error} />
      <Badge>{row.status}</Badge>
      <p>
        Received {date(row.created_at)} · {row.size.toLocaleString()} bytes
      </p>
      <div className="actions">
        {['text', 'html', 'headers', 'attempts'].map((v) => (
          <Button key={v} onClick={() => setTab(v)}>
            {v}
          </Button>
        ))}
      </div>
      {row.status === 'parsed' && ['text', 'html'].includes(tab) ? (
        <InboundBody id={id} html={tab === 'html'} />
      ) : (
        <pre className="code-preview">{pretty(tab === 'headers' ? row.headers : row.attempts)}</pre>
      )}
      <h2>Attachments</h2>
      {row.attachments.map((file) => (
        <p key={file.id}>
          <Button
            onClick={() => void download(`inbound/${id}/attachments/${file.id}`).catch(setError)}
          >
            {file.filename} · {file.size} bytes
          </Button>
        </p>
      ))}
      <h2>Forwarding history</h2>
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
  // No scripts, network loads, forms or navigation privileges are granted to received mail.
  const content = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"></head><body>${query.data.html}</body></html>`;
  return html ? (
    <iframe
      title="Received HTML preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={content}
      style={{ width: '100%', height: 420, border: '1px solid var(--border)' }}
    />
  ) : (
    <pre className="code-preview">{query.data.text || 'No plain text body'}</pre>
  );
}
