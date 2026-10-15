'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Flame, ArrowRight, ShieldCheck, Workflow, Mail, Activity } from 'lucide-react';
import { api, useApi } from '../../lib/api';
import { Button, ErrorBox, Field } from '../../components/ui';
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
  const [next, setNext] = useState('/workflows');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
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
    <main className="login-page">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Flame size={23} />
          </span>
          flare<span className="brand-caption">BY PARETO LABS</span>
        </a>
        <div className="login-copy">
          <div className="eyebrow">A LITTLE SIGNAL. A LOT OF IMPACT.</div>
          <h1>
            The right message.
            <br />
            At the right moment.
          </h1>
          <p>One home for the notifications that connect your product to your people.</p>
          <div className="signal-lines">
            <div>
              <Workflow />
              <span>Orchestrate every channel</span>
              <i />
            </div>
            <div>
              <Mail />
              <span>Make every email count</span>
              <i />
            </div>
            <div>
              <Activity />
              <span>Follow every delivery</span>
              <i />
            </div>
          </div>
        </div>
        <div className="login-footer">
          <span>Built for Pareto Labs</span>
          <span>Your infrastructure. Your control.</span>
        </div>
      </section>
      <section className="login-form">
        <div className="login-box">
          <span className="small muted">YOUR NOTIFICATION WORKSPACE</span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to keep things moving.</p>
          {exchange ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
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
            <form onSubmit={submit}>
              <Field label="Work email">
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@paretolabs.com"
                  {...register('email')}
                />
                {errors.email && <small className="danger">Enter a valid email address.</small>}
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
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
          {config.data?.oidc_url && (
            <a className="button full sso-button" href={config.data.oidc_url}>
              Continue with SSO
            </a>
          )}
          <div className="login-security">
            <ShieldCheck size={15} />
            <span>Secure access to your team’s workspace</span>
          </div>
        </div>
      </section>
    </main>
  );
}
