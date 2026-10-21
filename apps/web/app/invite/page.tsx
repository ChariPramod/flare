'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useApi } from '../../lib/api';
import { Button, ErrorBox, Field, Loading } from '../../components/ui';
import styles from '../../components/public-entry.module.css';
export default function Invite() {
  const session = useApi('session');
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(location.search).get('token') ?? '');
  }, []);
  const sessionUnavailable = Boolean(
    session.error && (!('status' in session.error) || session.error.status !== 401),
  );
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
        {token === null || session.isPending ? (
          <Loading />
        ) : !token ? (
          <div role="alert">
            <h2>Invitation link missing</h2>
            <p>
              Open the complete link from your invitation, or ask your workspace owner to send a new
              one.
            </p>
            <Link href="/login">Return to sign in</Link>
          </div>
        ) : sessionUnavailable ? (
          <div>
            <ErrorBox error={session.error} />
            <p>We couldn’t check your account. Retry before accepting this invitation.</p>
            <Button
              type="button"
              disabled={session.isFetching}
              onClick={() => void session.refetch()}
            >
              Retry account check
            </Button>
          </div>
        ) : (
          <form
            aria-busy={busy || undefined}
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(undefined);
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
                  <input name="name" required maxLength={120} autoComplete="name" disabled={busy} />
                </Field>
                <Field label="Create password" hint="At least 12 characters.">
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={256}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </Field>
              </>
            )}
            <ErrorBox error={error} />
            <Button className="primary full" disabled={!token || busy || session.isPending}>
              {busy ? 'Joining…' : 'Accept invitation'}
            </Button>
          </form>
        )}
        {token && !sessionUnavailable && !session.isPending && !session.data && (
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
