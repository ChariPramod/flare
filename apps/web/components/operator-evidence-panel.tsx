'use client';
import { useState } from 'react';
import { useAction, useApi, date } from '../lib/api';
import { Badge, Button, ErrorBox, Field, Loading, Modal } from './ui';

type Evidence = {
  proof_reference: string;
  checked_at: string;
  header_from_domain: string;
  dkim_domain: string;
  dkim_pass: boolean;
  mail_from_domain: string;
  spf_pass: boolean;
  dmarc_pass: boolean;
  ses?: { status: string; behavior_on_mx_failure: string; checked_at: string };
};
type Instance = {
  transport_instance: string;
  instance: { id: string; kind: string } | null;
  evidence: Evidence | null;
  checked_at: string | null;
  revoked_at: string | null;
  readiness: {
    ready: boolean;
    blockers: string[];
    dkim_aligned: boolean | null;
    spf_aligned: boolean | null;
  };
};
type Result = {
  domain: { id: string; name: string; environment: string };
  policy_revision: number;
  evidence: Instance[];
};
export function OperatorEvidencePanel({ org }: { org: string }) {
  const [domain, setDomain] = useState('');
  return (
    <section className="panel" aria-label="Domain transport evidence">
      <h2>Domain transport evidence</h2>
      <p>
        Review evidence from a trusted receiving mailbox for each named transport. These records are
        operator attestations, not automatic cryptographic verification. Sending approval and route
        isolation remain separate requirements.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDomain(String(new FormData(e.currentTarget).get('domain')).trim());
        }}
      >
        <Field
          label="Evidence domain ID"
          hint="Use a registered domain ID belonging to the selected organization."
        >
          <input
            name="domain"
            required
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          />
        </Field>
        <Button>Load domain evidence</Button>
      </form>
      {domain && <DomainEvidence key={domain} org={org} domain={domain} />}
    </section>
  );
}
function DomainEvidence({ org, domain }: { org: string; domain: string }) {
  const path = `operator/organizations/${org}/domains/${domain}/evidence`;
  const query = useApi<Result>(path);
  const [instance, setInstance] = useState('');
  const [revoke, setRevoke] = useState<Instance | null>(null);
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorBox error={query.error} />;
  const data = query.data;
  const selected = data.evidence.find((row) => row.transport_instance === instance);
  return (
    <div className="stack">
      <h3>
        {data.domain.name} · {data.domain.environment}
      </h3>
      <p className="muted">
        Production evidence checks apply even when preparing a Development domain. Policy revision{' '}
        {data.policy_revision}.
      </p>
      {data.evidence.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transport</th>
                <th>Evidence gate</th>
                <th>Review details</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.map((row) => (
                <tr key={row.transport_instance}>
                  <td>
                    {row.transport_instance}
                    <small className="muted block">{row.instance?.kind ?? 'Not configured'}</small>
                  </td>
                  <td>
                    <Badge>
                      {row.revoked_at
                        ? 'Revoked'
                        : row.readiness.ready
                          ? 'Evidence passes'
                          : 'Blocked'}
                    </Badge>
                    {row.readiness.blockers.map((blocker) => (
                      <small className="block" key={blocker}>
                        {blocker.replaceAll('_', ' ')}
                      </small>
                    ))}
                  </td>
                  <td>
                    <span>Reviewed {date(row.checked_at)}</span>
                    {row.evidence && (
                      <>
                        <small className="muted block">{row.evidence.proof_reference}</small>
                        <small className="block">
                          DKIM aligned: {String(row.readiness.dkim_aligned ?? 'unknown')} · SPF
                          aligned: {String(row.readiness.spf_aligned ?? 'unknown')}
                        </small>
                        {row.evidence.ses && (
                          <small className="block">
                            SES provider probe: {row.evidence.ses.status} ·{' '}
                            {row.evidence.ses.behavior_on_mx_failure}
                          </small>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <Button
                      disabled={!row.evidence || Boolean(row.revoked_at)}
                      onClick={() => setRevoke(row)}
                      aria-label={`Revoke evidence for ${row.transport_instance}`}
                    >
                      Revoke evidence
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No real named transport instances are configured.</p>
      )}
      <Field label="Evidence transport instance">
        <select value={instance} onChange={(e) => setInstance(e.target.value)}>
          <option value="">Choose a configured transport</option>
          {data.evidence
            .filter((row) => row.instance)
            .map((row) => (
              <option key={row.transport_instance} value={row.transport_instance}>
                {row.transport_instance} · {row.instance!.kind}
              </option>
            ))}
        </select>
      </Field>
      {selected?.instance && (
        <EvidenceForm
          key={`${instance}/${data.policy_revision}`}
          path={path}
          data={data}
          row={selected}
        />
      )}
      {revoke && (
        <RevokeEvidence
          path={path}
          revision={data.policy_revision}
          row={revoke}
          close={() => setRevoke(null)}
        />
      )}
    </div>
  );
}
function EvidenceForm({ path, data, row }: { path: string; data: Result; row: Instance }) {
  const update = useAction(path);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        update.mutate({
          expected_revision: data.policy_revision,
          reason: form.get('reason'),
          evidence: {
            kind: 'received_headers',
            provenance: 'operator_attested_receiver_headers',
            transport_instance: row.transport_instance,
            proof_reference: form.get('proof_reference'),
            checked_at: new Date(String(form.get('checked_at'))).toISOString(),
            header_from_domain: data.domain.name,
            dkim_domain: form.get('dkim_domain'),
            mail_from_domain: form.get('mail_from_domain'),
            dkim_pass: form.has('dkim_pass'),
            spf_pass: form.has('spf_pass'),
            dmarc_pass: form.has('dmarc_pass'),
          },
        });
      }}
    >
      <h3>Record received-header evidence</h3>
      <p>
        Header From must be {data.domain.name}. Record only public domains and authentication
        results from the trusted receiver; do not paste complete headers, message bodies or
        credentials. Saving evidence does not itself approve sending.
      </p>
      {row.instance?.kind === 'ses' && (
        <p>
          Saving runs a read-only SES identity probe using this transport’s configured credentials.
          Provider MAIL FROM settings cannot be supplied in this form.
        </p>
      )}
      <Field label="Received evidence reference">
        <input
          name="proof_reference"
          required
          maxLength={1024}
          defaultValue={row.evidence?.proof_reference ?? ''}
        />
      </Field>
      <Field
        label="Evidence observation time"
        hint="When the trusted receiver observed the results, in your local time zone. Stale or future observations are rejected."
      >
        <input name="checked_at" type="datetime-local" required />
      </Field>
      <div className="form-grid">
        <Field label="Observed DKIM signing domain">
          <input name="dkim_domain" required defaultValue={row.evidence?.dkim_domain ?? ''} />
        </Field>
        <Field label="Observed envelope MAIL FROM domain">
          <input
            name="mail_from_domain"
            required
            defaultValue={row.evidence?.mail_from_domain ?? ''}
          />
        </Field>
      </div>
      {(['dkim', 'spf', 'dmarc'] as const).map((method) => (
        <label className="check" key={method}>
          <input type="checkbox" name={`${method}_pass`} /> Trusted receiver reports{' '}
          {method.toUpperCase()} pass
        </label>
      ))}
      <Field label="Evidence review reason">
        <textarea name="reason" required minLength={10} maxLength={2000} />
      </Field>
      <ErrorBox error={update.error} />
      <Button className="primary" disabled={update.isPending}>
        Record domain evidence
      </Button>
    </form>
  );
}
function RevokeEvidence({
  path,
  revision,
  row,
  close,
}: {
  path: string;
  revision: number;
  row: Instance;
  close: () => void;
}) {
  const revoke = useAction(`${path}/${encodeURIComponent(row.transport_instance)}/revoke`);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Revoke domain transport evidence"
      description={`Production sends using ${row.transport_instance} will require fresh evidence before another transport attempt.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          revoke.mutate(
            { expected_revision: revision, reason: new FormData(e.currentTarget).get('reason') },
            { onSuccess: close },
          );
        }}
      >
        <Field label="Evidence revocation reason">
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </Field>
        <ErrorBox error={revoke.error} />
        <Button className="danger" disabled={revoke.isPending}>
          Revoke domain evidence
        </Button>
      </form>
    </Modal>
  );
}
