'use client';
import { useState } from 'react';
import { useApi, useAction, date } from '../lib/api';
import { Badge, Button, Field, ErrorBox, Modal } from './ui';
type Route = {
  id: string;
  revision: number;
  name: string;
  traffic_class: 'transactional' | 'marketing';
  trust_tier: 'customer' | 'pareto';
  critical: boolean;
  transport_instances: string[];
  physical_ips: string[];
  proof_reference: string | null;
  verified_at: string | null;
  disabled_at: string | null;
  created_at: string;
};
const list = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
export function OperatorRoutePanel() {
  const query = useApi<Route[]>('operator/mail-routes');
  const create = useAction('operator/mail-routes');
  const [selected, setSelected] = useState('');
  const [disable, setDisable] = useState<Route | null>(null);
  const latest = new Map<string, Route>();
  for (const route of query.data ?? [])
    if (!latest.has(route.id) || latest.get(route.id)!.revision < route.revision)
      latest.set(route.id, route);
  const existing = latest.get(selected);
  return (
    <section className="panel" aria-label="Provider route registry">
      <h2>Provider route registry</h2>
      <p>
        Bind named transport instances to a traffic purpose and reviewed physical sending IPs.
        Labels alone do not establish provider or IP isolation.
      </p>
      <ErrorBox error={query.error} />
      {query.data?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Instances and IP evidence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((route) => (
                <tr key={`${route.id}/${route.revision}`}>
                  <td>
                    <strong>{route.name}</strong>
                    <small className="muted block">
                      {route.id} · Revision {route.revision}
                    </small>
                  </td>
                  <td>
                    {route.trust_tier} · {route.traffic_class}
                    {route.critical ? ' · critical' : ''}
                  </td>
                  <td>
                    <Badge>
                      {route.disabled_at
                        ? 'Disabled'
                        : route.verified_at
                          ? 'Verified'
                          : 'Unverified'}
                    </Badge>
                    {route.disabled_at && (
                      <small className="muted block">{date(route.disabled_at)}</small>
                    )}
                  </td>
                  <td>
                    <div>{route.transport_instances.join(', ')}</div>
                    <small className="muted block">
                      {route.physical_ips.join(', ') || 'No physical IP evidence'}
                    </small>
                  </td>
                  <td>
                    <Button
                      disabled={Boolean(route.disabled_at)}
                      onClick={() => setDisable(route)}
                      aria-label={`Disable ${route.name} revision ${route.revision}`}
                    >
                      Disable revision
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : query.data ? (
        <p className="muted">No provider routes have been registered.</p>
      ) : null}
      <details>
        <summary>Create or revise a provider route</summary>
        <Field label="Existing provider route">
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Create a new route</option>
            {[...latest.values()].map((route) => (
              <option key={route.id} value={route.id}>
                {route.name} · Revision {route.revision}
              </option>
            ))}
          </select>
        </Field>
        <form
          key={`${selected}/${existing?.revision ?? 0}`}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            create.mutate({
              ...(existing ? { id: existing.id } : {}),
              expected_revision: existing?.revision ?? 0,
              name: form.get('name'),
              traffic_class: existing?.traffic_class ?? form.get('traffic_class'),
              trust_tier: existing?.trust_tier ?? form.get('trust_tier'),
              critical: existing?.critical ?? form.has('critical'),
              transport_instances: list(form.get('transport_instances')),
              physical_ips: list(form.get('physical_ips')),
              ...(form.get('proof_reference')
                ? { proof_reference: form.get('proof_reference') }
                : {}),
              verified: form.has('verified'),
              reason: form.get('reason'),
            });
          }}
        >
          <Field label="Provider route name">
            <input name="name" required maxLength={120} defaultValue={existing?.name ?? ''} />
          </Field>
          <div className="form-grid">
            <Field label="Route traffic class">
              <select
                name="traffic_class"
                disabled={Boolean(existing)}
                defaultValue={existing?.traffic_class ?? 'transactional'}
              >
                <option value="transactional">Transactional</option>
                <option value="marketing">Marketing</option>
              </select>
            </Field>
            <Field label="Route trust tier">
              <select
                name="trust_tier"
                disabled={Boolean(existing)}
                defaultValue={existing?.trust_tier ?? 'customer'}
              >
                <option value="customer">Customer</option>
                <option value="pareto">Pareto</option>
              </select>
            </Field>
          </div>
          <label className="check">
            <input
              name="critical"
              type="checkbox"
              disabled={Boolean(existing)}
              defaultChecked={existing?.critical ?? false}
            />{' '}
            Critical Pareto transactional route
          </label>
          <p className="muted">
            A route’s traffic class, trust tier and critical status cannot change across revisions.
          </p>
          <Field
            label="Named transport instance IDs"
            hint="One ID per line or separated by commas. Names must match configured real transport instances; do not enter credentials."
          >
            <textarea
              name="transport_instances"
              required
              defaultValue={existing?.transport_instances.join('\n') ?? ''}
            />
          </Field>
          <Field
            label="Physical sending IPs"
            hint="Public provider egress addresses, one per line or separated by commas."
          >
            <textarea name="physical_ips" defaultValue={existing?.physical_ips.join('\n') ?? ''} />
          </Field>
          <Field
            label="Route proof reference"
            hint="Reference the reviewed provider evidence. Do not include access tokens or passwords."
          >
            <input
              name="proof_reference"
              minLength={10}
              maxLength={2000}
              defaultValue={existing?.proof_reference ?? ''}
            />
          </Field>
          <label className="check">
            <input
              name="verified"
              type="checkbox"
              defaultChecked={Boolean(existing?.verified_at)}
            />{' '}
            Physical sending evidence reviewed
          </label>
          <Field label="Route change reason">
            <textarea name="reason" required minLength={10} maxLength={2000} />
          </Field>
          <ErrorBox error={create.error} />
          <Button className="primary" disabled={create.isPending}>
            Publish route revision
          </Button>
        </form>
      </details>
      {disable && <DisableRoute route={disable} close={() => setDisable(null)} />}
    </section>
  );
}
function DisableRoute({ route, close }: { route: Route; close: () => void }) {
  const disable = useAction(`operator/mail-routes/${route.id}/${route.revision}/disable`);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Disable provider route revision"
      description={`${route.name} · Revision ${route.revision}. Messages pinned to this revision will be held before another transport attempt.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          disable.mutate(Object.fromEntries(new FormData(e.currentTarget)), { onSuccess: close });
        }}
      >
        <Field label="Route disable reason">
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </Field>
        <ErrorBox error={disable.error} />
        <Button className="danger" disabled={disable.isPending}>
          Disable route revision
        </Button>
      </form>
    </Modal>
  );
}
