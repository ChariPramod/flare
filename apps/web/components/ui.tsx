'use client';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, LoaderCircle, ArrowUpDown, Search } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
export function Button({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone || String(children).toLowerCase()}`}>{children}</span>;
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error-box" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={22} />
      <div className="skeleton-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p>Loading…</p>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark">✳</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog ${wide ? 'wide' : ''}`}>
          <div className="dialog-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = 'Search…',
}: {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
}) {
  const [filter, setFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search);
      setFilter(params.get('q') ?? '');
      const page = Number(params.get('page') ?? 1);
      setPagination({
        pageIndex: Number.isSafeInteger(page) && page > 0 ? page - 1 : 0,
        pageSize: 25,
      });
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const syncUrl = (q: string, page: number) => {
    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    if (page > 0) url.searchParams.set('page', String(page + 1));
    else url.searchParams.delete('page');
    history.replaceState(null, '', url);
  };
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: filter, pagination },
    onPaginationChange: setPagination,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPagination({ ...pagination, pageIndex: 0 });
              syncUrl(e.target.value, 0);
            }}
          />
        </div>
        <span className="muted small">
          {table.getFilteredRowModel().rows.length} loaded results
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    <button
                      onClick={header.column.getToggleSortingHandler()}
                      disabled={!header.column.getCanSort()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ArrowUpDown size={11} />}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!table.getRowModel().rows.length && (
        <Empty title="Nothing here yet">Create your first item or adjust your search.</Empty>
      )}
      <div className="table-pagination">
        <span className="small muted">
          Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
        </span>
        <Button
          className="compact"
          disabled={!table.getCanPreviousPage()}
          onClick={() => {
            table.previousPage();
            syncUrl(filter, pagination.pageIndex - 1);
          }}
        >
          Previous
        </Button>
        <Button
          className="compact"
          disabled={!table.getCanNextPage()}
          onClick={() => {
            table.nextPage();
            syncUrl(filter, pagination.pageIndex + 1);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function ConfirmButton({
  title,
  description,
  onConfirm,
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <>
      <Button {...props} type="button" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Modal
        open={open}
        onOpenChange={(value) => !busy && setOpen(value)}
        title={title}
        description={description}
      >
        <ErrorBox error={error} />
        <div className="dialog-actions">
          <Button type="button" disabled={busy} onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            className="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm()
                .then(() => setOpen(false), setError)
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
