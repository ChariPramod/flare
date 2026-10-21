'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useApi } from '../../lib/api';
import { Button, ErrorBox, Field } from '../../components/ui';
import styles from '../../components/public-entry.module.css';
export default function Invite() {
  const session = useApi('session');
  const router = useRouter();
  const [token, setToken] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(location.search).get('token') ?? '');
  }, []);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Flare home">
          Flare<span>BY PARETO LABS</span>
        </Link>
        <span className={styles.eyebrow}>WORKSPACE INVITATION</span>
      </header>
      <section className={styles.card}>
        <p className={styles.eyebrow}>BETTER TOGETHER</p>
        <h1>Join your team</h1>
        <p className={styles.description}>Accept your invitation to a Flare workspace.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void api(session.data ? 'team/accept-invite' : 'auth/accept-invite', 'POST', {
              ...data,
              token,
            })
              .then(() => {
                router.replace('/overview');
                router.refresh();
              })
              .catch(setError)
              .finally(() => setBusy(false));
          }}
        >
          {!session.data && (
            <>
              <Field label="Your name">
                <input name="name" required maxLength={120} autoComplete="name" />
              </Field>
              <Field label="Create password" hint="At least 12 characters.">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
          <ErrorBox error={error} />
          <Button className="primary full" disabled={!token || busy || session.isPending}>
            {busy ? 'Joining…' : 'Accept invitation'}
          </Button>
        </form>
        {!session.data && (
          <p className="small muted">
            Already have an account?{' '}
            <Link
              className="strong"
              href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}
            >
              Sign in first
            </Link>
            .
          </p>
        )}
      </section>
      <footer className={styles.footer}>Your next chapter starts with a conversation.</footer>
    </main>
  );
}
