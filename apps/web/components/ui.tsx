'use client';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  LoaderCircle,
  ArrowUpDown,
  Search,
  SearchX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';
import styles from './ui-table.module.css';

const tablePageSizes = [10, 25, 50, 100];
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
    <div className="empty" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
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
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog ${wide ? 'wide' : ''}`}
          onCloseAutoFocus={onCloseAutoFocus}
        >
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
  paginate = true,
  urlStateKey = '',
  label,
  loading,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  paginate?: boolean;
  /** Independent search/page state for screens with more than one table. */
  urlStateKey?: string;
  label?: string;
  /** Keep persisted page state while an asynchronous data set is loading. */
  loading?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const hasLoadedData = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterKey = urlStateKey ? `${urlStateKey}_q` : 'q';
  const pageKey = urlStateKey ? `${urlStateKey}_page` : 'page';
  const pageSizeKey = urlStateKey ? `${urlStateKey}_page_size` : 'page_size';
  useEffect(() => {
    if (!paginate) return;
    const read = () => {
      const params = new URLSearchParams(location.search);
      setFilter(params.get(filterKey) ?? '');
      const page = Number(params.get(pageKey) ?? 1);
      const pageSize = Number(params.get(pageSizeKey) ?? 25);
      setPagination({
        pageIndex: Number.isSafeInteger(page) && page > 0 ? page - 1 : 0,
        pageSize: tablePageSizes.includes(pageSize) ? pageSize : 25,
      });
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [paginate, filterKey, pageKey, pageSizeKey]);
  const syncUrl = (q: string, page: number, push = false, pageSize = pagination.pageSize) => {
    if (!paginate) return;
    const url = new URL(location.href);
    if (q) url.searchParams.set(filterKey, q);
    else url.searchParams.delete(filterKey);
    if (page > 0) url.searchParams.set(pageKey, String(page + 1));
    else url.searchParams.delete(pageKey);
    if (pageSize !== 25) url.searchParams.set(pageSizeKey, String(pageSize));
    else url.searchParams.delete(pageSizeKey);
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
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
    getPaginationRowModel: paginate ? getPaginationRowModel() : undefined,
    autoResetPageIndex: false,
  });
  const filteredCount = table.getFilteredRowModel().rows.length;
  const firstResult = filteredCount
    ? paginate
      ? pagination.pageIndex * pagination.pageSize + 1
      : 1
    : 0;
  const lastResult = paginate
    ? Math.min((pagination.pageIndex + 1) * pagination.pageSize, filteredCount)
    : filteredCount;
  const clearSearch = () => {
    setFilter('');
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    syncUrl('', 0);
    searchInput.current?.focus();
  };
  useEffect(() => {
    if (!paginate || loading) return;
    if (loading === false || data.length > 0) hasLoadedData.current = true;
    // A disappearing last page should reveal the remaining rows. Do not clamp
    // initial URL restoration against an empty, not-yet-loaded data set.
    const lastPage = Math.max(0, Math.ceil(filteredCount / pagination.pageSize) - 1);
    if (hasLoadedData.current && pagination.pageIndex > lastPage) {
      setPagination((current) => ({ ...current, pageIndex: lastPage }));
      const url = new URL(location.href);
      if (lastPage > 0) url.searchParams.set(pageKey, String(lastPage + 1));
      else url.searchParams.delete(pageKey);
      history.replaceState(null, '', url);
    }
  }, [
    paginate,
    loading,
    data.length,
    filteredCount,
    pagination.pageIndex,
    pagination.pageSize,
    pageKey,
  ]);
  return (
    <div className="table-panel" aria-busy={loading || undefined}>
      <div className={`table-toolbar ${styles.toolbar}`}>
        <div className={`search-field ${styles.search}`}>
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchInput}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPagination({ ...pagination, pageIndex: 0 });
              syncUrl(e.target.value, 0);
            }}
          />
          {filter && (
            <button
              type="button"
              className={styles.clear}
              onClick={clearSearch}
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <span
          className={`muted small ${styles.results}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {loading
            ? 'Loading results…'
            : filter
              ? `${filteredCount} ${filteredCount === 1 ? 'match' : 'matches'} from ${data.length} loaded results`
              : `${data.length} loaded ${data.length === 1 ? 'result' : 'results'}`}
          {!paginate && !loading && ' on this page'}
        </span>
      </div>
      <div className="table-scroll">
        <table aria-label={label}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      !header.column.getCanSort()
                        ? undefined
                        : header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                  >
                    {header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown size={11} aria-hidden="true" />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
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
      {loading && <Loading />}
      {!loading &&
        !table.getRowModel().rows.length &&
        (data.length > 0 && filter ? (
          <div className={`empty ${styles.noResults}`}>
            <span className={styles.emptyIcon}>
              <SearchX size={24} aria-hidden="true" />
            </span>
            <h3>No matching results</h3>
            <p>Try a different search, or clear it to see all loaded items.</p>
            <Button type="button" className="compact" onClick={clearSearch}>
              Clear search and show all
            </Button>
          </div>
        ) : (
          <Empty title="Nothing here yet">Items will appear here once they have been added.</Empty>
        ))}
      {paginate && (
        <div className={`table-pagination ${styles.pagination}`}>
          <span className={`small muted ${styles.range}`} aria-live="polite" aria-atomic="true">
            {loading
              ? 'Loading page…'
              : `${firstResult}–${lastResult} of ${filteredCount} ${filter ? 'matching' : 'loaded'} results`}
          </span>
          <label className={styles.pageSize}>
            <span>Rows per page</span>
            <select
              value={pagination.pageSize}
              disabled={loading}
              onChange={(event) => {
                const pageSize = Number(event.target.value);
                setPagination({ pageIndex: 0, pageSize });
                syncUrl(filter, 0, true, pageSize);
              }}
            >
              {tablePageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span className={`small muted ${styles.pageNumber}`}>
            {loading
              ? '…'
              : `Page ${pagination.pageIndex + 1} of ${Math.max(1, table.getPageCount())}`}
          </span>
          <Button
            className="compact"
            disabled={loading || !table.getCanPreviousPage()}
            onClick={() => {
              table.previousPage();
              syncUrl(filter, pagination.pageIndex - 1, true);
            }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Previous
          </Button>
          <Button
            className="compact"
            disabled={loading || !table.getCanNextPage()}
            onClick={() => {
              table.nextPage();
              syncUrl(filter, pagination.pageIndex + 1, true);
            }}
          >
            Next
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      )}
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
