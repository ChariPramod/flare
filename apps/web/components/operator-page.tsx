'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAction, useApi, pretty, api } from '../lib/api';
import { Badge, Button, ErrorBox, Field, Loading, PageHeader } from './ui';
import { OperatorRoutePanel } from './operator-route-panel';
import { OperatorEvidencePanel } from './operator-evidence-panel';

type Policy = {
  org_id: string;
  name: string;
  state: 'pending_review' | 'approved' | 'suspended';
  revision: number;
  daily_limit: number;
  per_minute_limit: number;
  complaint_threshold: number;
  hard_bounce_rate: number;
  hard_bounce_min: number;
  marketing_enabled: boolean;
  default_traffic_class: 'transactional' | 'marketing' | null;
  trust_tier: 'customer' | 'pareto';
  route_bindings: Record<string, { id: string; revision: number }>;
  usage: { reserved: number; sent_24h: number };
  feedback: {
    recipients_24h: number;
    hard_bounces: number;
    complaints: number;
    unknown: number;
    latest_at: string | null;
  };
};
type OperatorSession = {
  user: { id: string; name: string; email: string };
  step_up_required: boolean;
  verified_until: string | null;
};

export function OperatorPage() {
  const session = useApi<OperatorSession>('operator/session', 15000);
  const router = useRouter();
  const client = useQueryClient();
  const rejected = Boolean(
    session.error && 'status' in session.error && session.error.status === 401,
  );
  useEffect(() => {
    if (rejected) {
      client.clear();
      router.replace('/login');
    }
  }, [rejected, client, router]);
  const proof = useAction('operator/step-up');
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (session.isPending || rejected) return <Loading />;
  const locked =
    Boolean(session.error) ||
    !session.data ||
    session.data.step_up_required ||
    !session.data.verified_until ||
    Date.parse(session.data.verified_until) <= now;
  return (
    <main className="page">
      <Link href="/workflows" className="back-link">
        ← Workspace
      </Link>
      <PageHeader
        title="Platform sending controls"
        description="Review organization sending access, capacity and provider routing."
        actions={
          <Button
            onClick={() => {
              void api('operator/logout', 'POST', {}).finally(() => {
                location.assign('/login');
              });
            }}
          >
            Sign out
          </Button>
        }
      />
      <ErrorBox error={session.error} />
      {!session.data || session.error ? (
        <p>
          Platform access requires an allowlisted user with MFA enabled.{' '}
          <Link href="/login">Sign in</Link> or{' '}
          <Link href="/settings">manage account security</Link>.
        </p>
      ) : locked ? (
        <section className="panel">
          <h2>Verify operator access</h2>
          <p>
            Enter a fresh authenticator or recovery code. Verification lasts 15 minutes and applies
            only to this session.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              proof.mutate({ code }, { onSettled: () => setCode('') });
            }}
          >
            <Field label="Operator authenticator or recovery code">
              <input
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={128}
                required
              />
            </Field>
            <ErrorBox error={proof.error} />
            <Button className="primary" disabled={!code || proof.isPending}>
              Verify operator access
            </Button>
          </form>
        </section>
      ) : (
        <>
          <p className="muted">
            Verified as {session.data.user.email} until{' '}
            {new Date(session.data.verified_until!).toLocaleTimeString()}.
          </p>
          <div className="stack">
            <OperatorRoutePanel />
            <Policies />
          </div>
        </>
      )}
    </main>
  );
}

function Policies() {
  const query = useApi<Policy[]>('operator/sending-policies');
  const [org, setOrg] = useState('');
  return (
    <>
      <ErrorBox error={query.error} />
      <Field label="Organization sending policy">
        <select value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">Choose an organization</option>
          {query.data?.map((p) => (
            <option key={p.org_id} value={p.org_id}>
              {p.name} · {p.state}
            </option>
          ))}
        </select>
      </Field>
      {org && !query.error && <PolicyDetail key={org} org={org} />}
    </>
  );
}

function PolicyDetail({ org }: { org: string }) {
  const query = useApi<Policy>(`operator/sending-policies/${org}`);
  const audit = useApi<unknown[]>(`operator/sending-policies/${org}/audit`);
  const update = useAction(`operator/sending-policies/${org}`, 'PATCH');
  const restore = useAction(`operator/sending-policies/${org}/restore-suppression`);
  const [credentialId, setCredentialId] = useState('');
  const credential = useAction(
    `operator/organizations/${org}/credentials/${encodeURIComponent(credentialId)}`,
    'PATCH',
  );
  const policy = query.data;
  if (query.isPending) return <Loading />;
  if (!policy || query.error) return <ErrorBox error={query.error} />;
  return (
    <div className="stack">
      <section className="panel">
        <h2>{policy.name}</h2>
        <p>
          <Badge>{policy.state}</Badge> · Revision {policy.revision}
        </p>
        <p>
          Accepted recipients in 24 hours: {policy.usage.sent_24h}. Reserved capacity:{' '}
          {policy.usage.reserved}.
        </p>
        <p>
          Feedback: {policy.feedback.hard_bounces} hard bounces, {policy.feedback.complaints}{' '}
          complaints, {policy.feedback.unknown} unknown outcomes from{' '}
          {policy.feedback.recipients_24h} recipients.
        </p>
        <form
          key={policy.revision}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const route_bindings: Record<string, { id: string; revision: number }> = {};
            for (const name of ['transactional', 'marketing', 'critical']) {
              const id = String(form.get(`${name}_route`) ?? '').trim();
              if (id) route_bindings[name] = { id, revision: Number(form.get(`${name}_revision`)) };
            }
            const values = {
              state: form.get('state'),
              daily_limit: Number(form.get('daily_limit')),
              per_minute_limit: Number(form.get('per_minute_limit')),
              complaint_threshold: Number(form.get('complaint_threshold')),
              hard_bounce_rate: Number(form.get('hard_bounce_rate')),
              hard_bounce_min: Number(form.get('hard_bounce_min')),
              marketing_enabled: form.has('marketing_enabled'),
              default_traffic_class: form.get('default_traffic_class') || null,
              trust_tier: form.get('trust_tier'),
            };
            // Keep unchanged route grants out of unrelated policy updates. A disabled
            // binding must not prevent an operator from suspending the organization.
            const changes = Object.fromEntries(
              Object.entries(values).filter(
                ([key, value]) => value !== policy[key as keyof Policy],
              ),
            );
            const sameBindings =
              Object.keys(route_bindings).length === Object.keys(policy.route_bindings).length &&
              Object.entries(route_bindings).every(
                ([purpose, binding]) =>
                  policy.route_bindings[purpose]?.id === binding.id &&
                  policy.route_bindings[purpose]?.revision === binding.revision,
              );
            update.mutate({
              ...changes,
              ...(!sameBindings ? { route_bindings } : {}),
              expected_revision: policy.revision,
              reason: form.get('reason'),
            });
          }}
        >
          <div className="form-grid">
            <Field label="Sending state">
              <select name="state" defaultValue={policy.state}>
                {['pending_review', 'approved', 'suspended'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Daily recipient limit">
              <input
                name="daily_limit"
                type="number"
                min={1}
                max={1000000}
                defaultValue={policy.daily_limit}
                required
              />
            </Field>
            <Field label="Recipients per minute">
              <input
                name="per_minute_limit"
                type="number"
                min={1}
                max={10000}
                defaultValue={policy.per_minute_limit}
                required
              />
            </Field>
            <Field label="Complaint threshold">
              <input
                name="complaint_threshold"
                type="number"
                min={1}
                max={100}
                defaultValue={policy.complaint_threshold}
                required
              />
            </Field>
            <Field label="Hard bounce rate threshold">
              <input
                name="hard_bounce_rate"
                type="number"
                min={0}
                max={1}
                step={0.001}
                defaultValue={policy.hard_bounce_rate}
                required
              />
            </Field>
            <Field label="Minimum hard bounce sample">
              <input
                name="hard_bounce_min"
                type="number"
                min={1}
                max={10000}
                defaultValue={policy.hard_bounce_min}
                required
              />
            </Field>
            <Field label="Trust tier">
              <select name="trust_tier" defaultValue={policy.trust_tier}>
                <option value="customer">Customer</option>
                <option value="pareto">Pareto</option>
              </select>
            </Field>
            <Field label="Default traffic class">
              <select
                name="default_traffic_class"
                defaultValue={policy.default_traffic_class ?? ''}
              >
                <option value="">Require explicit classification</option>
                <option value="transactional">Transactional</option>
                <option value="marketing">Marketing</option>
              </select>
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              name="marketing_enabled"
              defaultChecked={policy.marketing_enabled}
            />{' '}
            Allow marketing sends
          </label>
          <h3>Provider routes</h3>
          <p className="muted">
            Assign registered route IDs and pinned revisions. Blank fields remove that assignment.
            Critical routing also requires an operator-approved credential.
          </p>
          {['transactional', 'marketing', 'critical'].map((name) => (
            <div key={name} className="form-grid">
              <Field label={`${name} route ID`}>
                <input
                  name={`${name}_route`}
                  defaultValue={policy.route_bindings?.[name]?.id ?? ''}
                />
              </Field>
              <Field label={`${name} route revision`}>
                <input
                  name={`${name}_revision`}
                  type="number"
                  min={1}
                  defaultValue={policy.route_bindings?.[name]?.revision ?? 1}
                />
              </Field>
            </div>
          ))}
          <Field label="Policy change reason">
            <textarea name="reason" required minLength={10} maxLength={2000} />
          </Field>
          <ErrorBox error={update.error} />
          <Button className="primary" disabled={update.isPending}>
            Save sending policy
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>Credential sending permissions</h2>
        <p>
          Bind an existing API key to a traffic class. Critical sending is reserved for explicitly
          approved Pareto credentials.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            credential.mutate({
              expected_revision: policy.revision,
              reason: form.get('reason'),
              traffic_class: form.get('traffic_class') || null,
              critical_sending: form.has('critical_sending'),
            });
          }}
        >
          <Field label="API key ID">
            <input
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              required
            />
          </Field>
          <Field label="Credential traffic class">
            <select name="traffic_class">
              <option value="">Use organization default</option>
              <option value="transactional">Transactional</option>
              <option value="marketing">Marketing</option>
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" name="critical_sending" /> Allow critical transactional sending
          </label>
          <Field label="Credential change reason">
            <textarea name="reason" required minLength={10} maxLength={2000} />
          </Field>
          <ErrorBox error={credential.error} />
          <Button disabled={credential.isPending}>Update credential permissions</Button>
        </form>
      </section>
      <section className="panel">
        <h2>Restore a protected suppression</h2>
        <p>Use only after reviewing provider feedback and documenting why sending may resume.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            restore.mutate({
              ...Object.fromEntries(new FormData(e.currentTarget)),
              expected_revision: policy.revision,
            });
          }}
        >
          <Field label="Suppressed email">
            <input type="email" name="email" required />
          </Field>
          <Field label="Restoration reason">
            <textarea name="reason" required minLength={10} maxLength={2000} />
          </Field>
          <ErrorBox error={restore.error} />
          <Button disabled={restore.isPending}>Restore suppression</Button>
        </form>
      </section>
      <OperatorEvidencePanel org={org} />
      <section className="panel">
        <h2>Sending policy audit</h2>
        <ErrorBox error={audit.error} />
        <pre className="code-block">{pretty(audit.data ?? [])}</pre>
      </section>
    </div>
  );
}
