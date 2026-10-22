'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowRight, FileUp, CheckCircle2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useEditorDraft, DraftNotice } from './drafts';
import { Button, Field, Modal, ErrorBox } from './ui';
import styles from './campaign-import.module.css';

export type ContactList = { id: string; name: string; contact_count: number };
type Source = { format: 'csv' | 'tsv' | 'json' | 'xlsx'; data: string; sheet?: string };
type Validation = {
  valid: number;
  duplicates: number;
  errors: { row: number; message: string }[];
  error_count: number;
  existing: number;
  skipped_deleted: number;
};
type Preview = {
  headers: string[];
  sample: string[][];
  rows: number;
  sheets?: string[];
  sheet?: string;
  validation?: Validation;
};
type ImportDraft = {
  filename: string;
  source?: Source;
  preview?: Preview;
  mapping: Record<string, string>;
  listMode: 'new' | 'existing';
  listName: string;
  listId: string;
  reviewed: boolean;
};
type ImportResult = {
  imported: number;
  duplicates: number;
  created: number;
  updated: number;
  skipped_deleted: number;
  list_id: string | null;
  list_name: string | null;
};
const empty: ImportDraft = {
  filename: '',
  mapping: {},
  listMode: 'new',
  listName: '',
  listId: '',
  reviewed: false,
};
function suggestedMapping(headers: string[], properties: { name: string }[]) {
  const aliases: Record<string, string> = {
    email: 'email',
    emailaddress: 'email',
    emailaddr: 'email',
    firstname: 'first_name',
    givenname: 'first_name',
    lastname: 'last_name',
    surname: 'last_name',
    familyname: 'last_name',
    unsubscribed: 'unsubscribed',
    optout: 'unsubscribed',
  };
  const used = new Set<string>();
  return Object.fromEntries(
    headers.map((header) => {
      const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      const property = properties.find(
        (p) => header === p.name || header === `properties.${p.name}`,
      );
      const candidate = aliases[normalized] ?? (property ? `properties.${property.name}` : '');
      const target = used.has(candidate) ? '' : candidate;
      if (target) used.add(target);
      return [header, target];
    }),
  );
}
function mapped(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
}
async function fileSource(file: File): Promise<Source> {
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file no larger than 2 MiB.');
  const format = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'tsv', 'json', 'xlsx'].includes(format ?? ''))
    throw new Error('Choose a CSV, TSV, JSON or Excel (.xlsx) file.');
  if (format !== 'xlsx') return { format: format as Source['format'], data: await file.text() };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { format: 'xlsx', data: btoa(binary) };
}

export function ContactImport({
  close,
  complete,
}: {
  close: () => void;
  complete: (listId: string | null) => void;
}) {
  const properties = useApi<{ name: string; type: string }[]>('contact-properties');
  const lists = useApi<ContactList[]>('contact-lists');
  const draft = useEditorDraft<ImportDraft>('contact-import:new', empty);
  const value = draft.value ?? empty;
  const [error, setError] = useState<unknown>();
  const [operation, setOperation] = useState('');
  const [result, setResult] = useState<ImportResult>();
  const lock = useRef(false);
  const busy = draft.pending || lock.current;
  const fields = [
    'email',
    'first_name',
    'last_name',
    'unsubscribed',
    ...(properties.data ?? []).map((p) => `properties.${p.name}`),
  ];
  async function run(label: string, action: () => Promise<void>) {
    if (lock.current || draft.pending) return;
    lock.current = true;
    setOperation(label);
    setError(undefined);
    const finish = draft.startSaving();
    try {
      await action();
    } catch (error) {
      setError(error);
    } finally {
      finish();
      lock.current = false;
      setOperation('');
    }
  }
  // Store data after the request lock is released; the draft registry rejects writes while saving.
  async function load(file: File) {
    draft.setValue({ ...value, reviewed: false });
    let next: ImportDraft | undefined;
    await run('Reading file…', async () => {
      const source = await fileSource(file);
      const preview = await api<Preview>('contacts/import/preview', 'POST', { source });
      next = {
        ...empty,
        source: { ...source, ...(preview.sheet ? { sheet: preview.sheet } : {}) },
        filename: file.name,
        listName: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
        preview,
        mapping: suggestedMapping(preview.headers, properties.data ?? []),
      };
    });
    if (next) {
      draft.setValue(next);
      setResult(undefined);
    }
  }
  async function selectSheet(sheet: string) {
    if (!value.source) return;
    let next: ImportDraft | undefined;
    await run('Reading worksheet…', async () => {
      const source = { ...value.source!, sheet };
      const preview = await api<Preview>('contacts/import/preview', 'POST', { source });
      next = {
        ...value,
        source,
        preview,
        reviewed: false,
        mapping: suggestedMapping(preview.headers, properties.data ?? []),
      };
    });
    if (next) draft.setValue(next);
  }
  async function review() {
    if (!value.source) return;
    let preview: Preview | undefined;
    await run('Reviewing contacts…', async () => {
      preview = await api<Preview>('contacts/import/preview', 'POST', {
        source: value.source,
        mapping: mapped(value.mapping),
      });
    });
    if (preview) draft.setValue({ ...value, preview, reviewed: true });
  }
  const validation = value.reviewed ? value.preview?.validation : undefined;
  const errors = validation?.error_count ?? validation?.errors.length ?? 0;
  const canImport =
    !!validation &&
    errors === 0 &&
    validation.valid > 0 &&
    (value.listMode === 'new' ? !!value.listName.trim() : !!value.listId);
  return (
    <Modal
      open
      onOpenChange={(open) => !open && close()}
      pending={busy}
      title="Import contacts"
      description="CSV, TSV, JSON or Excel (.xlsx). Review the columns and save this audience as a reusable list."
      wide
    >
      {result ? (
        <section className={styles.success} aria-live="polite">
          <CheckCircle2 size={30} aria-hidden="true" />
          <h2>Contacts are ready</h2>
          <p>
            {result.imported} {result.imported === 1 ? 'contact' : 'contacts'} saved to{' '}
            <strong>{result.list_name ?? 'your audience'}</strong>.
          </p>
          <p className="muted">
            {result.created} new · {result.updated} updated · {result.duplicates} duplicate rows
            merged
            {result.skipped_deleted ? ` · ${result.skipped_deleted} deleted contacts skipped` : ''}
          </p>
          <p>
            Existing opt-outs stay in place. Your campaign will check preferences and suppressions
            again before delivery.
          </p>
          <div className="actions">
            <Link
              className="button primary"
              href={`/broadcasts?create=1${result.list_id ? `&list_id=${encodeURIComponent(result.list_id)}` : ''}`}
            >
              Create campaign <ArrowRight size={16} />
            </Link>
            <Button onClick={close}>View contacts</Button>
          </div>
        </section>
      ) : (
        <div className={styles.flow}>
          <DraftNotice
            dirty={draft.dirty}
            pending={busy}
            onDiscard={() => {
              draft.discard();
              setError(undefined);
            }}
          />
          <section>
            <h3 className={styles.stepTitle}>
              <span>1</span> Choose a file
            </h3>
            <Field
              label="Contact file"
              hint="Up to 5,000 rows and 2 MiB. Use a header row; JSON accepts an array of contact objects. Older .xls files must be saved as .xlsx or CSV."
            >
              <input
                type="file"
                accept=".csv,.tsv,.json,.xlsx,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy || properties.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void load(file);
                  event.target.value = '';
                }}
              />
            </Field>
            {value.filename && (
              <p className="small muted">
                <FileUp size={14} aria-hidden="true" /> {value.filename} ·{' '}
                {value.preview?.rows ?? 0} rows
              </p>
            )}
            {!!value.preview?.sheets?.length && (
              <Field label="Worksheet">
                <select
                  disabled={busy}
                  value={value.source?.sheet ?? value.preview.sheet}
                  onChange={(event) => void selectSheet(event.target.value)}
                >
                  {value.preview.sheets.map((sheet) => (
                    <option key={sheet}>{sheet}</option>
                  ))}
                </select>
              </Field>
            )}
          </section>
          {value.preview && (
            <>
              <section>
                <h3 className={styles.stepTitle}>
                  <span>2</span> Match your columns
                </h3>
                <p className="small muted">
                  Map one email column. Skip fields you do not need. Custom fields must already
                  exist in Audience → Properties.
                </p>
                <div className={styles.mapping}>
                  {value.preview.headers.map((header, index) => (
                    <Field
                      key={header}
                      label={`Map ${header}`}
                      hint={`Sample: ${value.preview?.sample[0]?.[index] || '—'}`}
                    >
                      <select
                        value={value.mapping[header] ?? ''}
                        disabled={busy}
                        onChange={(event) =>
                          draft.setValue({
                            ...value,
                            reviewed: false,
                            mapping: { ...value.mapping, [header]: event.target.value },
                          })
                        }
                      >
                        <option value="">Skip column</option>
                        {fields.map((field) => (
                          <option key={field} value={field}>
                            {field.replace('properties.', 'Property: ').replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>
              </section>
              <section>
                <h3 className={styles.stepTitle}>
                  <span>3</span> Choose your contact list
                </h3>
                <div className={styles.columns}>
                  <Field label="Save contacts to">
                    <select
                      disabled={busy}
                      value={value.listMode}
                      onChange={(event) =>
                        draft.setValue({
                          ...value,
                          listMode: event.target.value as ImportDraft['listMode'],
                        })
                      }
                    >
                      <option value="new">A new list</option>
                      <option value="existing">An existing list</option>
                    </select>
                  </Field>
                  {value.listMode === 'new' ? (
                    <Field
                      label="List name"
                      hint="If a list with this name already exists, contacts will be added to it. Retrying an import does not create another list."
                    >
                      <input
                        required
                        maxLength={120}
                        disabled={busy}
                        value={value.listName}
                        onChange={(event) =>
                          draft.setValue({ ...value, listName: event.target.value })
                        }
                      />
                    </Field>
                  ) : (
                    <Field label="Contact list">
                      <select
                        required
                        disabled={busy}
                        value={value.listId}
                        onChange={(event) =>
                          draft.setValue({ ...value, listId: event.target.value })
                        }
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
                </div>
                <p className="small muted">
                  A list keeps this group together so you can target it in a campaign. Importing
                  does not send email.
                </p>
              </section>
              {validation && (
                <section className={styles.review} aria-label="Import review" aria-live="polite">
                  <h3>Review before importing</h3>
                  <p>
                    <strong>{validation.valid}</strong> valid rows ·{' '}
                    <strong>{validation.duplicates}</strong> duplicate rows ·{' '}
                    <strong>{validation.existing}</strong> existing contacts
                  </p>
                  {!!validation.skipped_deleted && (
                    <p>{validation.skipped_deleted} previously deleted contacts will be skipped.</p>
                  )}
                  {errors > 0 ? (
                    <div role="alert">
                      <p>
                        {errors} row errors. Correct the file and upload it again; no contacts have
                        been imported.
                      </p>
                      <ul>
                        {validation.errors.map((error, index) => (
                          <li key={`${error.row}-${index}`}>
                            Row {error.row}: {error.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>
                      Ready to import. Duplicate email addresses are merged, and existing opt-outs
                      are preserved.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          <ErrorBox error={error || properties.error || lists.error} />
          {(properties.error || lists.error) && (
            <Button
              onClick={() => {
                void properties.refetch();
                void lists.refetch();
              }}
            >
              Retry import options
            </Button>
          )}
          <div className={`dialog-actions ${styles.footer}`}>
            {operation && <span role="status">{operation}</span>}
            {value.preview && (
              <Button disabled={busy || !!properties.error} onClick={() => void review()}>
                Review import
              </Button>
            )}
            <Button
              className="primary"
              disabled={busy || !canImport}
              onClick={() =>
                void run('Importing contacts…', async () => {
                  const saved = await api<ImportResult>('contacts/import', 'POST', {
                    source: value.source,
                    mapping: mapped(value.mapping),
                    ...(value.listMode === 'new'
                      ? { list_name: value.listName.trim() }
                      : { list_id: value.listId }),
                  });
                  draft.saved(value, empty);
                  setResult(saved);
                  complete(saved.list_id);
                })
              }
            >
              {operation === 'Importing contacts…' ? 'Importing…' : 'Import contacts'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
