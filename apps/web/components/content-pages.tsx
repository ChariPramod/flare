'use client';
import Link from 'next/link';
import { emailPreview } from '../lib/email-preview';
import { useState, useEffect } from 'react';
import { useApi, useAction, pretty } from '../lib/api';
import { Button, PageHeader, DataTable, Field, ErrorBox, Loading, Modal } from './ui';
import { DraftNotice, useDrafts, useEditorDraft } from './drafts';
type Layout = {
  id: string;
  identifier: string;
  name: string;
  current_version: number;
  html: string;
  translations: boolean;
};
export function LayoutsPage({ id, editable }: { id?: string; editable: boolean }) {
  const query = useApi<Layout[]>('layouts'),
    create = useAction<Layout>('layouts'),
    [open, setOpen] = useState(false);
  if (id) return <LayoutDetail id={id} editable={editable} />;
  return (
    <>
      <PageHeader
        title="Layouts"
        description="Reusable email wrappers, pinned to a version when a workflow is saved."
        actions={
          <Button disabled={!editable} onClick={() => setOpen(true)}>
            Create layout
          </Button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : (
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
              header: 'Layout',
              cell: ({ row }) => (
                <Link href={`/layouts/${row.original.identifier}`}>{row.original.name}</Link>
              ),
            },
            { accessorKey: 'identifier', header: 'Identifier' },
            { accessorKey: 'current_version', header: 'Version' },
          ]}
        />
      )}
      <Modal title="Create layout" open={open} onOpenChange={setOpen} pending={create.isPending}>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            try {
              await create.mutateAsync({
                identifier: data.get('identifier'),
                name: data.get('name'),
                html: '<main>{{{body}}}</main>',
                translations: false,
              });
              setOpen(false);
            } catch {
              /* Display mutation error. */
            }
          }}
        >
          <Field label="Layout name">
            <input name="name" required />
          </Field>
          <Field label="Layout identifier">
            <input name="identifier" pattern="[a-z][a-z0-9_-]+" required />
          </Field>
          <ErrorBox error={create.error} />
          <Button className="primary" disabled={create.isPending}>
            Create wrapper
          </Button>
        </form>
      </Modal>
    </>
  );
}
function LayoutDetail({ id, editable }: { id: string; editable: boolean }) {
  const query = useApi<
      Layout & { versions: { version: number; html: string; translations: boolean }[] }
    >(`layouts/${id}`),
    save = useAction(`layouts/${id}`, 'PUT');
  const draft = useEditorDraft(
    `layout:${id}`,
    query.data
      ? {
          html: query.data.versions[0]!.html,
          translations: query.data.versions[0]!.translations,
        }
      : undefined,
    query.isError,
  );
  const { html = '', translations = false } = draft.value ?? {};
  const pending = save.isPending || draft.pending;
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorBox error={query.error} />;
  return (
    <>
      <PageHeader
        title={query.data.name}
        description={`Version ${query.data.current_version} · ${id}`}
        actions={
          <Button
            className="primary"
            disabled={!editable || pending}
            onClick={async () => {
              const finish = draft.startSaving();
              try {
                await save.mutateAsync({
                  identifier: id,
                  name: query.data!.name,
                  html,
                  translations,
                });
                draft.saved({ html, translations });
              } catch {
                /* Keep the draft and display the mutation error. */
              } finally {
                finish();
              }
            }}
          >
            Save layout version
          </Button>
        }
      />
      <ErrorBox error={query.error ?? save.error} />
      <DraftNotice dirty={draft.dirty} onDiscard={draft.discard} pending={pending} />
      <div className="panel stack">
        <Field
          label="Layout HTML"
          hint="Include exactly one {{{body}}}. Payload variables are not allowed."
        >
          <textarea
            aria-label="Layout HTML"
            rows={12}
            value={html}
            disabled={!editable || pending}
            onChange={(e) => draft.setValue((current) => ({ ...current, html: e.target.value }))}
          />
        </Field>
        <label>
          <input
            type="checkbox"
            checked={translations}
            disabled={!editable || pending}
            onChange={(e) =>
              draft.setValue((current) => ({ ...current, translations: e.target.checked }))
            }
          />{' '}
          Enable layout translations
        </label>
        <h2>Wrapper preview</h2>
        <iframe
          key={html}
          title="Layout preview"
          sandbox=""
          srcDoc={emailPreview(
            html.replace('{{{body}}}', '<p>Your email content appears here.</p>'),
          )}
          style={{ width: '100%', height: 260, border: 0 }}
        />
        <p className="muted">
          Existing workflows keep their pinned version. Select the new version in the workflow
          editor to adopt it.
        </p>
      </div>
    </>
  );
}
type Dictionary = { locale: string; current_version: number; entries: Record<string, string> };
export function TranslationsPage({ editable }: { editable: boolean }) {
  const { confirmNavigation } = useDrafts();
  const workflows = useApi<{ data: { identifier: string; definition: { name: string } }[] }>(
      'workflows?limit=100',
    ),
    [workflow, setWorkflow] = useState('');
  useEffect(() => {
    const restore = () => setWorkflow(new URLSearchParams(location.search).get('workflow') ?? '');
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  return (
    <>
      <PageHeader
        title="Translations"
        description="Plain-text dictionaries per workflow. Missing locales and keys fall back to en_US."
      />
      <ErrorBox error={workflows.error} />
      <Field label="Translation workflow">
        <select
          aria-label="Translation workflow"
          value={workflow}
          onChange={(e) => {
            if (!confirmNavigation()) return;
            const next = e.target.value;
            setWorkflow(next);
            const url = new URL(location.href);
            if (next) url.searchParams.set('workflow', next);
            else url.searchParams.delete('workflow');
            url.searchParams.delete('locale');
            history.pushState(null, '', url);
          }}
        >
          <option value="">Choose a workflow</option>
          {workflows.data?.data.map((v) => (
            <option key={v.identifier} value={v.identifier}>
              {v.definition.name}
            </option>
          ))}
        </select>
      </Field>
      {workflow && <DictionaryEditor key={workflow} workflow={workflow} editable={editable} />}
    </>
  );
}
function DictionaryEditor({ workflow, editable }: { workflow: string; editable: boolean }) {
  const { confirmNavigation } = useDrafts();
  const query = useApi<Dictionary[]>(`translations/${workflow}`),
    [locale, setLocale] = useState('en_US'),
    [localeInput, setLocaleInput] = useState('en_US'),
    [error, setError] = useState<unknown>();
  const save = useAction(`translations/${workflow}/${locale}`, 'PUT');
  const draft = useEditorDraft(
    `translation:${workflow}:${locale}`,
    query.data
      ? pretty(query.data.find((item) => item.locale === locale)?.entries ?? {})
      : undefined,
    query.isError,
  );
  const text = draft.value ?? '{}';
  const pending = save.isPending || draft.pending;
  useEffect(() => {
    const restore = () => {
      const candidate = new URLSearchParams(location.search).get('locale') ?? 'en_US';
      const next = /^[a-z]{2}_[A-Z]{2}$/.test(candidate) ? candidate : 'en_US';
      setLocale(next);
      setLocaleInput(next);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorBox error={query.error} />;
  return (
    <div className="panel stack">
      <div className="form-grid">
        <Field
          label="Locale"
          hint="Enter a locale, then load it. Typing here keeps the current dictionary unchanged."
        >
          <input
            value={localeInput}
            onChange={(e) => setLocaleInput(e.target.value)}
            placeholder="en_US"
            pattern="[a-z]{2}_[A-Z]{2}"
            disabled={pending}
          />
        </Field>
        <div className="actions">
          <Button
            disabled={pending}
            onClick={() => {
              if (!/^[a-z]{2}_[A-Z]{2}$/.test(localeInput)) {
                setError(new Error('Use a locale such as en_US or fr_FR.'));
                return;
              }
              if (localeInput === locale) return;
              if (!confirmNavigation()) return;
              setLocale(localeInput);
              setError(undefined);
              const url = new URL(location.href);
              url.searchParams.set('locale', localeInput);
              history.pushState(null, '', url);
            }}
          >
            Load locale
          </Button>
        </div>
      </div>
      <p className="muted">
        Active locale: <strong>{locale}</strong> · Version{' '}
        {query.data.find((v) => v.locale === locale)?.current_version ?? 'not saved'} · Reference
        entries with {'{{t.key}}'} in workflow content.
      </p>
      <DraftNotice dirty={draft.dirty} onDiscard={draft.discard} pending={pending} />
      <Field label="Dictionary JSON">
        <textarea
          aria-label="Dictionary JSON"
          rows={14}
          value={text}
          disabled={!editable || pending}
          onChange={(e) => draft.setValue(e.target.value)}
        />
      </Field>
      <div className="actions">
        <Button
          className="primary"
          disabled={!editable || pending}
          onClick={async () => {
            const finish = draft.startSaving();
            try {
              setError(undefined);
              await save.mutateAsync(JSON.parse(text));
              draft.saved(text);
            } catch (e) {
              setError(e);
            } finally {
              finish();
            }
          }}
        >
          Save dictionary version
        </Button>
        <Button
          onClick={() => {
            try {
              const data = JSON.stringify(JSON.parse(text), null, 2),
                url = URL.createObjectURL(new Blob([data], { type: 'application/json' })),
                link = document.createElement('a');
              link.href = url;
              link.download = `${workflow}.${locale}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              setError(e);
            }
          }}
        >
          Export JSON
        </Button>
        <Field label="Import JSON">
          <input
            type="file"
            accept="application/json,.json"
            disabled={!editable || pending}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 262144) throw new Error('Maximum dictionary size is 256 KiB');
                draft.setValue(pretty(JSON.parse(await file.text())));
              } catch (e) {
                setError(e);
              }
            }}
          />
        </Field>
      </div>
      <ErrorBox error={query.error ?? error ?? save.error} />
    </div>
  );
}
