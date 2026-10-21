'use client';
import { useState } from 'react';
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
    [saved, setSaved] = useState(false);
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
        <ErrorBox error={error || query.error} />
        {query.isPending ? (
          <Loading />
        ) : (
          query.data && (
            <form
              key={JSON.stringify(query.data)}
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setSaved(false);
                const form = new FormData(e.currentTarget);
                void api(`preferences/${encodeURIComponent(token)}`, 'PATCH', {
                  unsubscribed: form.get('unsubscribed') === 'on',
                  topics: Object.fromEntries(
                    query.data!.topics.map((t) => [t.id, form.get(t.id) === 'on']),
                  ),
                })
                  .then(() => {
                    setSaved(true);
                    return query.refetch();
                  }, setError)
                  .finally(() => setBusy(false));
              }}
            >
              <p className={styles.recipient}>{query.data.email}</p>
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
                    defaultChecked={t.enabled}
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
                  defaultChecked={query.data.unsubscribed}
                />
              </label>
              <Button className={`primary ${styles.save}`} disabled={busy}>
                Save preferences
              </Button>
              {saved && <p role="status">Your preferences have been saved.</p>}
            </form>
          )
        )}
      </section>
      <footer className={styles.footer}>Thoughtful updates. On your terms.</footer>
    </main>
  );
}
