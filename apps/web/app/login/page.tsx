'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { api, useApi } from '../../lib/api';
import { Button, ErrorBox, Field } from '../../components/ui';
import styles from './login.module.css';
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  code: z.string().optional(),
});
export default function Login() {
  const router = useRouter();
  const config = useApi<{ oidc_url: string | null }>('auth/config');
  const [exchange, setExchange] = useState('');
  const [mfa, setMfa] = useState('');
  const [next, setNext] = useState('/overview');
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSessionExpired(params.get('reason') === 'session-expired');
    setExchange(params.get('code') ?? '');
    const target = params.get('next');
    if (target?.startsWith('/invite?')) setNext(target);
    if (params.has('code')) history.replaceState(null, '', '/login');
  }, []);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (values) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ operator_only?: boolean }>('auth/login', 'POST', {
        ...values,
        ...(!values.code ? { code: undefined } : {}),
      });
      router.replace(result.operator_only ? '/operator' : next);
      router.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  });
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Flare home">
          Flare<span>BY PARETO LABS</span>
        </a>
        <span className={styles.headerNote}>Your notification workspace</span>
      </header>
      <div className={styles.content}>
        <section className={styles.story} aria-labelledby="welcome-heading">
          <div className={styles.eyebrow}>A LITTLE SIGNAL. A LOT OF IMPACT.</div>
          <h1 id="welcome-heading">
            The right message.
            <br />
            <em>At the right moment.</em>
          </h1>
          <p className={styles.introduction}>
            A considered approach to notification operations. Bring your channels, content and
            delivery into one place.
          </p>
          <ol className={styles.capabilities}>
            <li>
              <span aria-hidden="true">01</span>
              <div>
                <h2>Connect the journey</h2>
                <p>Build workflows across email, Inbox and your connected channels.</p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <div>
                <h2>Make it personal</h2>
                <p>Keep your content, audiences and preferences working together.</p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <div>
                <h2>Follow the details</h2>
                <p>See each operation from acceptance through its recorded outcome.</p>
              </div>
            </li>
          </ol>
        </section>
        <section className={styles.formPanel} aria-labelledby="sign-in-heading">
          <div className={styles.formHeading}>
            <span className={styles.eyebrow}>WORKSPACE ACCESS</span>
            <h2 id="sign-in-heading">Welcome back</h2>
            <p>Sign in to keep things moving.</p>
          </div>
          {sessionExpired && (
            <p className="session-notice" role="status">
              Your session has ended. Sign in again to return to your workspace.
            </p>
          )}
          {exchange ? (
            <form
              aria-busy={busy || undefined}
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError(undefined);
                void api<{ operator_only?: boolean }>('auth/exchange', 'POST', {
                  code: exchange,
                  ...(mfa ? { mfa_code: mfa } : {}),
                })
                  .then((result) => {
                    router.replace(result.operator_only ? '/operator' : next);
                    router.refresh();
                  })
                  .catch(setError)
                  .finally(() => setBusy(false));
              }}
            >
              <Field
                label="Authenticator or recovery code"
                hint="Leave empty if you have not enabled two-factor authentication."
              >
                <input
                  autoComplete="one-time-code"
                  disabled={busy}
                  value={mfa}
                  onChange={(e) => setMfa(e.target.value)}
                />
              </Field>
              <ErrorBox error={error} />
              <Button className="primary full" disabled={busy}>
                Complete SSO sign-in
              </Button>
              <p className="muted small">
                This sign-in link is valid for one minute and one attempt. Restart SSO if it
                expires.
              </p>
            </form>
          ) : (
            <form onSubmit={submit} noValidate aria-busy={busy || undefined}>
              <Field
                label="Work email"
                error={errors.email ? 'Enter a valid email address.' : undefined}
              >
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@paretolabs.com"
                  disabled={busy}
                  {...register('email')}
                />
              </Field>
              <Field label="Password" error={errors.password ? 'Enter your password.' : undefined}>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={busy}
                  {...register('password')}
                />
              </Field>
              <Field
                label="Authenticator or recovery code"
                hint="Only required if you enabled two-factor authentication."
              >
                <input
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  disabled={busy}
                  {...register('code')}
                />
              </Field>
              <ErrorBox error={error} />
              <Button type="submit" className="primary full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {config.error && (
            <div className={styles.configError}>
              <p role="status">
                Single sign-on options could not be loaded. You can retry or use your password.
              </p>
              <Button
                type="button"
                className="compact"
                onClick={() => void config.refetch()}
                disabled={config.isFetching}
              >
                {config.isFetching ? 'Retrying…' : 'Retry sign-in options'}
              </Button>
            </div>
          )}
          {config.data?.oidc_url && (
            <a className={`button full ${styles.sso}`} href={config.data.oidc_url}>
              Continue with SSO
            </a>
          )}
          <div className={styles.security}>
            <ShieldCheck size={15} />
            <span>Secure access to your team’s workspace</span>
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <span>Purposeful communication, powered by Flare.</span>
        <span>Your infrastructure. Your control.</span>
      </footer>
    </main>
  );
}
