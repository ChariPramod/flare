'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, FlaskConical, RefreshCw } from 'lucide-react';
import { api, date, useApi } from '../lib/api';
import { useDrafts, useEditorDraft } from './drafts';
import { Badge, Button, ErrorBox, Field, Loading, Modal } from './ui';
import styles from './campaign-preflight.module.css';

type Preflight = {
  revision: string;
  sandbox: boolean;
  checked_at: string;
  ready: boolean;
  can_test: boolean;
  checks: { id: string; status: 'pass' | 'warning' | 'blocked'; message: string; href: string }[];
};
type TestResult = {
  data: { id: string; status: string }[];
  sandbox: boolean;
  template_version: number;
  replay_until: string;
};
type TestDraft = {
  addresses: string;
  request?: {
    key: string;
    revision: string;
    sandbox: boolean;
    recipients: string[];
    started: number;
  };
  result?: TestResult;
};
export function CampaignPreflight({ id, writable }: { id: string; writable: boolean }) {
  const query = useApi<Preflight>(`broadcasts/${id}/preflight`);
  const [open, setOpen] = useState(false);
  const checks = query.data;
  return (
    <section className="panel" aria-label="Pre-send checklist">
      <div className="panel-heading">
        <h2>Before you send</h2>
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={15} /> {query.isFetching ? 'Checking…' : 'Refresh checklist'}
        </Button>
      </div>
      <p className="muted">
        Review your saved email, sending setup and audience. These checks never send a message.
      </p>
      <ErrorBox error={query.error} />
      {query.isPending && <Loading />}
      {checks && (
        <>
          <div className="inline-tags">
            <Badge tone={checks.ready ? 'verified' : 'held'}>
              {checks.ready ? 'Ready to review' : 'Needs attention'}
            </Badge>
            <span className="small muted">
              Checked {date(checks.checked_at)} ·{' '}
              {checks.sandbox ? 'Mailpit sandbox' : 'Real email transport'}
            </span>
          </div>
          <ul className={styles.checklist}>
            {checks.checks.map((check) => (
              <li key={check.id}>
                {check.status === 'pass' ? (
                  <CheckCircle2 size={18} aria-hidden="true" />
                ) : (
                  <CircleAlert size={18} aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {check.status === 'pass'
                      ? 'Pass'
                      : check.status === 'warning'
                        ? 'Note'
                        : 'Action needed'}
                  </strong>
                  <p>{check.message}</p>
                </div>
                <Link href={check.href}>
                  Review<span className="sr-only"> {check.id}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="small muted">
            A snapshot, not a capacity reservation. Approval, preferences, quotas and sender
            readiness are checked again before delivery. Scheduling may hold until the requirements
            pass.
          </p>
          <div className={styles.testCallout}>
            <div>
              <h3>Try one email first</h3>
              <p>
                Send the saved version to up to three explicit addresses. Tests stay out of campaign
                results.
              </p>
            </div>
            <Button
              disabled={!writable || !!query.error || query.isFetching}
              onClick={() => setOpen(true)}
            >
              <FlaskConical size={16} /> Review test email
            </Button>
          </div>
          {open && (
            <TestEmail
              id={id}
              preflight={checks}
              writable={writable}
              close={() => setOpen(false)}
              refresh={() => query.refetch()}
            />
          )}
          <details className={styles.example}>
            <summary>Use the API</summary>
            <p className="small muted">
              Use your API origin and an environment-specific full-access key. Fetch the checklist
              first; copy its revision into the test request. Previewing or fetching a checklist
              never sends.
            </p>
            <pre>{`curl "$FLARE_API_URL/v1/broadcasts/${id}/preflight" \\\n  -H "Authorization: Bearer $FLARE_API_KEY" \\\n  -H "X-Environment-Id: $FLARE_ENVIRONMENT_ID"\n\ncurl -X POST "$FLARE_API_URL/v1/broadcasts/${id}/test" \\\n  -H "Authorization: Bearer $FLARE_API_KEY" \\\n  -H "X-Environment-Id: $FLARE_ENVIRONMENT_ID" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: <unique-test-intent>" \\\n  -d '{"revision":"<revision-from-checklist>","sandbox":${checks.sandbox},"recipients":["you@example.com"]}'`}</pre>
          </details>
        </>
      )}
    </section>
  );
}

function TestEmail({
  id,
  preflight,
  writable,
  close,
  refresh,
}: {
  id: string;
  preflight: Preflight;
  writable: boolean;
  close: () => void;
  refresh: () => Promise<unknown>;
}) {
  const registry = useDrafts();
  const draft = useEditorDraft<TestDraft>(`campaign-test:${id}`, { addresses: '' });
  const value = draft.value!;
  const pending = useRef(false);
  const [error, setError] = useState<unknown>();
  const addresses = value.addresses
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const valid =
    addresses.length > 0 &&
    addresses.length <= 3 &&
    new Set(addresses).size === addresses.length &&
    addresses.every(
      (address) => address.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address),
    );
  const expired = value.request && Date.now() - value.request.started >= 24 * 60 * 60 * 1000;
  const busy = draft.pending;
  const locked = Boolean(value.request);
  const reset = () => {
    if (
      window.confirm(
        'Start a separate test? A previously accepted test may already have been delivered. Review Emails before sending again.',
      )
    ) {
      draft.saved(value, { addresses: value.addresses });
      setError(undefined);
    }
  };
  return (
    <Modal
      open
      title="Send a controlled test"
      description="Only the addresses listed here receive this test. Your campaign audience is not contacted."
      pending={busy}
      onOpenChange={(open) => !open && close()}
    >
      <form
        className={styles.testForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            pending.current ||
            busy ||
            !valid ||
            !writable ||
            value.result ||
            expired ||
            (!value.request && !preflight.can_test)
          )
            return;
          const request = value.request ?? {
            key: crypto.randomUUID(),
            revision: preflight.revision,
            sandbox: preflight.sandbox,
            recipients: addresses,
            started: Date.now(),
          };
          const submitted = { ...value, request };
          draft.setValue(submitted);
          const finish = draft.startSaving();
          pending.current = true;
          const generation = registry.generation();
          setError(undefined);
          void api<TestResult>(
            `broadcasts/${id}/test`,
            'POST',
            {
              revision: request.revision,
              sandbox: request.sandbox,
              recipients: request.recipients,
            },
            request.key,
          )
            .then((result) => {
              if (registry.generation() === generation)
                draft.saved(submitted, { ...submitted, result });
            })
            .catch((error) => {
              if (registry.generation() === generation) setError(error);
            })
            .finally(() => {
              finish();
              pending.current = false;
              void refresh();
            });
        }}
      >
        <p className="info-banner">
          {(value.request?.sandbox ?? preflight.sandbox)
            ? 'Mailpit sandbox: mail is captured locally and does not reach external mailboxes.'
            : 'Real delivery: these tests use your approved marketing route and normal sending allowance.'}
        </p>
        <Field
          label="Test recipient addresses"
          hint="One to three distinct addresses, separated by commas or newlines."
          error={
            value.addresses && !valid
              ? 'Enter one to three valid, distinct email addresses.'
              : undefined
          }
        >
          <textarea
            rows={3}
            value={value.addresses}
            disabled={busy || locked}
            onChange={(event) => draft.setValue({ addresses: event.target.value })}
            placeholder="you@example.com"
            required
          />
        </Field>
        <p className="small muted">
          The subject starts with [TEST]. Names use “Test Recipient” and configured fallbacks, never
          another contact’s private values. Preference links are disabled. Existing opt-outs and
          suppressions still apply.
        </p>
        {!preflight.can_test && !locked && (
          <p className="error-box">
            Resolve the sending or content blockers in the checklist before testing.
          </p>
        )}
        {locked && !value.result && (
          <p className="info-banner">
            This test has a saved submission identity. Retry uses the same recipients and saved
            content revision for 24 hours, including after a lost response.
          </p>
        )}
        {expired && !value.result && (
          <p className="error-box">
            The retry window has expired. Review Emails before starting a separate test.
          </p>
        )}
        <ErrorBox error={error} />
        {value.result && (
          <div role="status">
            <h3>Test request accepted</h3>
            <p>
              Template v{value.result.template_version}. Acceptance does not establish delivery.
            </p>
            <ul>
              {value.result.data.map((item) => (
                <li key={item.id}>
                  <Link href={`/emails/${item.id}`}>View test email</Link> ·{' '}
                  <Badge>{item.status}</Badge>
                </li>
              ))}
            </ul>
            {value.result.sandbox && (
              <a href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">
                Open local Mailpit
              </a>
            )}
          </div>
        )}
        <div className="dialog-actions">
          {locked && (
            <Button type="button" disabled={busy} onClick={reset}>
              Start a separate test
            </Button>
          )}
          {!value.result && (
            <Button
              type="submit"
              className="primary"
              disabled={
                busy || !valid || !writable || Boolean(expired) || (!locked && !preflight.can_test)
              }
            >
              {busy
                ? 'Submitting test…'
                : locked
                  ? 'Retry same test'
                  : preflight.sandbox
                    ? 'Send test to Mailpit'
                    : 'Send test email'}
            </Button>
          )}
          <Button type="button" disabled={busy} onClick={close}>
            Close
          </Button>
        </div>
      </form>
    </Modal>
  );
}
