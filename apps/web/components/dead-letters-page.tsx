'use client';
import { useState } from 'react';
import { api, useApi, date } from '../lib/api';
import { PageHeader, Button, Badge, ErrorBox, Loading, DataTable, Modal } from './ui';
type Failure = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  attempts: number;
  created_at: string;
  redrivable: boolean;
};
export function DeadLettersPage({ writable }: { writable: boolean }) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Failure | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const rows = useApi<{ data: Failure[] }>(`dead-letters?page=${page}&limit=25`, 5000);
  async function redrive() {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`dead-letters/${selected.kind}/${selected.id}/redrive`, 'POST');
      setSelected(null);
      await rows.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Dead letters"
        description="Inspect failed work and retry eligible operations with their original identity. Ambiguous acceptance requires investigation."
      />
      <ErrorBox error={rows.error} />
      {rows.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          paginate={false}
          data={rows.data?.data ?? []}
          columns={[
            {
              header: 'Operation',
              accessorKey: 'id',
              cell: ({ row }) => (
                <button className="text-button" onClick={() => setSelected(row.original)}>
                  {row.original.kind} · {row.original.id.slice(0, 8)}
                </button>
              ),
            },
            {
              header: 'Status',
              accessorKey: 'status',
              cell: ({ row }) => <Badge>{row.original.status}</Badge>,
            },
            { header: 'Error', accessorKey: 'error' },
            { header: 'Attempts', accessorKey: 'attempts' },
            {
              header: 'Created',
              accessorKey: 'created_at',
              cell: ({ row }) => date(row.original.created_at),
            },
          ]}
        />
      )}
      <div className="server-pages">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>Page {page}</span>
        <Button disabled={(rows.data?.data.length ?? 0) < 25} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
      <Modal
        open={!!selected}
        onOpenChange={() => {
          setSelected(null);
          setError(undefined);
        }}
        title="Inspect failed operation"
        description="Redrive is audited and keeps the original operation ID. Fix the underlying configuration before retrying."
      >
        {selected && (
          <>
            <p>
              {selected.kind} · <code>{selected.id}</code>
            </p>
            <p>{selected.error}</p>
            <Badge>{selected.status}</Badge>
            <p>{selected.attempts} attempts</p>
            <ErrorBox error={error} />
            {selected.redrivable ? (
              <Button className="primary" disabled={!writable || busy} onClick={redrive}>
                Redrive operation
              </Button>
            ) : (
              <p className="muted">
                Automatic redrive is unavailable. Review provider evidence, or use the publication
                recovery controls for a publication failure.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
