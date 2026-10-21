'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '../lib/api';
import { Button, ErrorBox, Loading } from './ui';
import styles from './public-entry.module.css';
export function PreferencePage({ token }: { token: string }) {
  const query = useApi<{
      email: string;
      unsubscribed: boolean;
      topics: { id: string; name: string; description: string; enabled: boolean }[];
    }>(`preferences/${encodeURIComponent(token)}`),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [draft, setDraft] = useState<{ unsubscribed: boolean; topics: Record<string, boolean> }>();
  useEffect(() => {
    setDraft(undefined);
    setSaved(false);
    setError(undefined);
  }, [token]);
  useEffect(() => {
    if (query.data && !draft)
      setDraft({
        unsubscribed: query.data.unsubscribed,
        topics: Object.fromEntries(query.data.topics.map((topic) => [topic.id, topic.enabled])),
      });
  }, [query.data, draft]);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          Flare<span>NOTIFICATION PREFERENCES</span>
        </span>
        <span className={styles.eyebrow}>YOUR INBOX, YOUR CHOICE</span>
      </header>
      <section className={`${styles.card} ${styles.preferences}`}>
        <p className={styles.eyebrow}>STAY IN THE LOOP</p>
        <h1>Email preferences</h1>
        <p className={styles.description}>Choose the updates you want to receive.</p>
        <ErrorBox error={error || (!saved && query.error)} />
        {query.error && !query.data && (
          <Button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            Retry preferences
          </Button>
        )}
        {query.isPending || (query.data && !draft) ? (
          <Loading />
        ) : (
          query.data &&
          draft && (
            <form
              aria-busy={busy || undefined}
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setSaved(false);
                setError(undefined);
                void api(`preferences/${encodeURIComponent(token)}`, 'PATCH', draft)
                  .then(() => {
                    setSaved(true);
                    return query.refetch();
                  }, setError)
                  .finally(() => setBusy(false));
              }}
            >
              <p className={styles.recipient}>{query.data.email}</p>
              <fieldset className="form-fields" disabled={busy}>
                {query.data.topics.map((t) => (
                  <label className={styles.preferenceRow} key={t.id}>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.description}</small>
                    </span>
                    <input
                      aria-label={t.name}
                      type="checkbox"
                      name={t.id}
                      checked={draft.topics[t.id] ?? false}
                      onChange={(event) => {
                        setSaved(false);
                        setDraft({
                          ...draft,
                          topics: { ...draft.topics, [t.id]: event.target.checked },
                        });
                      }}
                    />
                  </label>
                ))}
                <label className={styles.preferenceRow}>
                  <span>
                    <strong>Unsubscribe from all broadcasts</strong>
                    <small>This overrides individual topic choices.</small>
                  </span>
                  <input
                    type="checkbox"
                    name="unsubscribed"
                    checked={draft.unsubscribed}
                    onChange={(event) => {
                      setSaved(false);
                      setDraft({ ...draft, unsubscribed: event.target.checked });
                    }}
                  />
                </label>
                <Button className={`primary ${styles.save}`} disabled={busy}>
                  {busy ? 'Saving preferences…' : 'Save preferences'}
                </Button>
              </fieldset>
              {saved && (
                <p role="status">
                  Your preferences have been saved.
                  {query.error &&
                    ' The latest view could not be refreshed; your submitted choices are retained.'}
                </p>
              )}
            </form>
          )
        )}
      </section>
      <footer className={styles.footer}>Thoughtful updates. On your terms.</footer>
    </main>
  );
}
