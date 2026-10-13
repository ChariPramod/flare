'use client';
import Link from 'next/link';
import { emailPreview } from '../lib/email-preview';
import { useState, useEffect } from 'react';
import { useApi, useAction, pretty } from '../lib/api';
import { Button, PageHeader, DataTable, Field, ErrorBox, Loading, Modal } from './ui';
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
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <DataTable
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
      <Modal title="Create layout" open={open} onOpenChange={setOpen}>
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
  const [html, setHtml] = useState(''),
    [translations, setTranslations] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (query.data && !loaded) {
      setHtml(query.data.versions[0]!.html);
      setTranslations(query.data.versions[0]!.translations);
      setLoaded(true);
    }
  }, [query.data, loaded]);
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
            disabled={!editable || save.isPending}
            onClick={() =>
              save.mutate({ identifier: id, name: query.data!.name, html, translations })
            }
          >
            Save layout version
          </Button>
        }
      />
      <ErrorBox error={save.error} />
      <div className="panel stack">
        <Field
          label="Layout HTML"
          hint="Include exactly one {{{body}}}. Payload variables are not allowed."
        >
          <textarea
            aria-label="Layout HTML"
            rows={12}
            value={html}
            disabled={!editable}
            onChange={(e) => setHtml(e.target.value)}
          />
        </Field>
        <label>
          <input
            type="checkbox"
            checked={translations}
            disabled={!editable}
            onChange={(e) => setTranslations(e.target.checked)}
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
  const workflows = useApi<{ data: { identifier: string; definition: { name: string } }[] }>(
      'workflows?limit=100',
    ),
    [workflow, setWorkflow] = useState('');
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
          onChange={(e) => setWorkflow(e.target.value)}
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
  const query = useApi<Dictionary[]>(`translations/${workflow}`),
    [locale, setLocale] = useState('en_US'),
    [text, setText] = useState('{}'),
    [loadedLocale, setLoadedLocale] = useState(''),
    [error, setError] = useState<unknown>();
  const save = useAction(`translations/${workflow}/${locale}`, 'PUT');
  useEffect(() => {
    if (query.data && loadedLocale !== locale) {
      setText(pretty(query.data.find((v) => v.locale === locale)?.entries ?? {}));
      setLoadedLocale(locale);
    }
  }, [query.data, locale, loadedLocale]);
  if (query.isPending) return <Loading />;
  return (
    <div className="panel stack">
      <Field label="Locale">
        <input
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          placeholder="en_US"
          pattern="[a-z]{2}_[A-Z]{2}"
        />
      </Field>
      <p className="muted">
        Version {query.data?.find((v) => v.locale === locale)?.current_version ?? 'not saved'} ·
        Reference entries with {'{{t.key}}'} in workflow content.
      </p>
      <Field label="Dictionary JSON">
        <textarea
          aria-label="Dictionary JSON"
          rows={14}
          value={text}
          disabled={!editable}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="actions">
        <Button
          className="primary"
          disabled={!editable || save.isPending}
          onClick={async () => {
            try {
              setError(undefined);
              await save.mutateAsync(JSON.parse(text));
            } catch (e) {
              setError(e);
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
            disabled={!editable}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 262144) throw new Error('Maximum dictionary size is 256 KiB');
                setText(pretty(JSON.parse(await file.text())));
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
