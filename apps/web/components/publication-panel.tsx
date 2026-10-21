'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, useApi, pretty, date } from '../lib/api';
import { Modal, Button, ErrorBox, Badge } from './ui';
type DiffItem = {
  changed?: boolean;
  identifier: string;
  development: unknown;
  production: unknown;
  dependencies?: {
    layouts: { identifier: string; version: number }[];
    templates: { identifier: string; version: number }[];
    translations: { key: string }[];
  };
};
type Diff = {
  diff_token: string;
  workflows: DiffItem[];
  automations: DiffItem[];
  layouts: DiffItem[];
  translations: DiffItem[];
};
export function PublicationPanel({
  open,
  close,
  onCloseAutoFocus,
}: {
  open: boolean;
  close: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const diff = useApi<Diff>('publish/diff'),
    recent = useApi<{ id: string; status: string; created_at: string }[]>('publications', 5000);
  const [selected, setSelected] = useState<Record<string, string[]>>({
      workflows: [],
      automations: [],
      layouts: [],
      translations: [],
    }),
    [operation, setOperation] = useState<string | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const accepting = useRef(false);
  const count = Object.values(selected).reduce((n, v) => n + v.length, 0);
  return (
    <Modal
      open={open}
      pending={busy}
      onOpenChange={(v) => !v && close()}
      onCloseAutoFocus={onCloseAutoFocus}
      title="Publish to Production"
      description="Review selected resources and their required content. Subscribers, integrations and topics stay in their environment."
      wide
    >
      <ErrorBox error={!operation && (error ?? diff.error)} />
      {operation ? (
        <PublicationStatus
          key={operation}
          id={operation}
          onPendingChange={setBusy}
          review={() => {
            setOperation(null);
            void diff.refetch();
          }}
        />
      ) : (
        <>
          <div className="stack">
            {(['workflows', 'layouts', 'translations', 'automations'] as const).map((kind) => (
              <section key={kind}>
                <h3>{kind[0]!.toUpperCase() + kind.slice(1)}</h3>
                {(diff.data?.[kind] ?? [])
                  .filter(
                    (v) =>
                      v.changed ?? JSON.stringify(v.development) !== JSON.stringify(v.production),
                  )
                  .map((item) => (
                    <label className="selection-row" key={item.identifier}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={selected[kind]!.includes(item.identifier)}
                        onChange={(e) =>
                          setSelected({
                            ...selected,
                            [kind]: e.target.checked
                              ? [...selected[kind]!, item.identifier]
                              : selected[kind]!.filter((v) => v !== item.identifier),
                          })
                        }
                      />
                      <span>
                        <strong>{item.identifier}</strong>
                        {item.dependencies && (
                          <small>
                            Includes{' '}
                            {item.dependencies.layouts
                              .map((v) => `${v.identifier} v${v.version}`)
                              .concat(
                                item.dependencies.templates.map(
                                  (v) => `${v.identifier} v${v.version}`,
                                ),
                              )
                              .join(', ') || 'compiled workflow content'}
                            {item.dependencies.translations.length
                              ? ' and locale dictionaries'
                              : ''}
                          </small>
                        )}
                        <details>
                          <summary>View diff</summary>
                          <pre className="code-preview">
                            {pretty({ development: item.development, production: item.production })}
                          </pre>
                        </details>
                      </span>
                      <Badge>{item.production ? 'updated' : 'new'}</Badge>
                    </label>
                  ))}
              </section>
            ))}
          </div>
          <div className="dialog-actions">
            <Button disabled={busy} onClick={close}>
              Close
            </Button>
            <Button
              className="primary"
              disabled={!count || busy}
              onClick={async () => {
                if (accepting.current) return;
                accepting.current = true;
                setBusy(true);
                setError(undefined);
                try {
                  const result = await api<{ id: string }>('publish', 'POST', {
                    ...selected,
                    diff_token: diff.data?.diff_token,
                  });
                  setOperation(result.id);
                  // Acceptance is complete once the durable ID is known. A history
                  // refresh must not trap this dialog or turn acceptance into an error.
                  void recent.refetch();
                } catch (e) {
                  setError(e);
                } finally {
                  accepting.current = false;
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Accepting publication…' : `Publish ${count} selected`}
            </Button>
          </div>
        </>
      )}
      <h3>Recent publications</h3>
      <ErrorBox error={recent.error} />
      {recent.error && (
        <Button
          className="compact"
          disabled={busy || recent.isFetching}
          onClick={() => void recent.refetch()}
        >
          Retry publication history
        </Button>
      )}
      {recent.data?.slice(0, 5).map((item) => (
        <p key={item.id}>
          <Button className="compact" disabled={busy} onClick={() => setOperation(item.id)}>
            {item.status} · {date(item.created_at)}
          </Button>
        </p>
      ))}
    </Modal>
  );
}
function PublicationStatus({
  id,
  review,
  onPendingChange,
}: {
  id: string;
  review: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const query = useApi<{
      status: string;
      error: string | null;
      items: {
        id: string;
        identifier: string;
        kind: string;
        status: string;
        attempts: number;
        error: string | null;
      }[];
    }>(`publications/${id}`, 2000),
    client = useQueryClient(),
    [error, setError] = useState<unknown>(),
    [retrying, setRetrying] = useState(false),
    [retryAccepted, setRetryAccepted] = useState(false);
  const accepting = useRef(false);
  return (
    <div className="stack">
      <p>
        Publication <code>{id}</code>
      </p>
      <Badge>{query.data?.status ?? 'Loading'}</Badge>
      <ErrorBox error={error} />
      <ErrorBox error={query.error} />
      <ErrorBox error={query.data?.error} />
      {query.error && (
        <Button
          className="compact"
          disabled={retrying || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh publication status
        </Button>
      )}
      {retryAccepted && (
        <p role="status">Retry accepted. Closing this dialog does not cancel the operation.</p>
      )}
      {query.data?.items.map((item) => (
        <div className="selection-row" key={item.id}>
          <strong>
            {item.kind} · {item.identifier}
          </strong>
          <Badge>{item.status}</Badge>
          <small>{item.attempts} attempts</small>
          {item.error && <p>{item.error}</p>}
        </div>
      ))}
      {query.data?.status === 'completed' && (
        <p>All selected resources and engine updates are verified.</p>
      )}
      {query.data?.status === 'failed' && (
        <Button disabled={retrying} onClick={review}>
          Review corrected resources for replacement
        </Button>
      )}
      {query.data?.status === 'failed' && (
        <Button
          disabled={retrying || query.isFetching || Boolean(query.error)}
          onClick={async () => {
            if (accepting.current) return;
            accepting.current = true;
            setRetrying(true);
            onPendingChange(true);
            setError(undefined);
            setRetryAccepted(false);
            try {
              await api(`publications/${id}/retry`, 'POST', {});
              setRetryAccepted(true);
              void client.invalidateQueries();
            } catch (e) {
              setError(e);
            } finally {
              accepting.current = false;
              setRetrying(false);
              onPendingChange(false);
            }
          }}
        >
          {retrying ? 'Accepting retry…' : 'Retry publication'}
        </Button>
      )}
    </div>
  );
}
