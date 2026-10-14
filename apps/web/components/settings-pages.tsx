'use client';
import { useState } from 'react';
import { Plus, Copy, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { useApi, useAction, api, date, pretty } from '../lib/api';
import type { Session } from '../lib/api';
import { PageHeader, DataTable, Button, ConfirmButton, Badge, Modal, Field, ErrorBox } from './ui';
type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  permission: string;
  domain_id: string | null;
  allow_publish?: boolean;
  created_at: string;
  last_used_at: string;
  revoked_at: string | null;
};
type Environment = {
  id: string;
  name: string;
  novu_configured: boolean;
  novu_application_id: string | null;
  bridge_url: string | null;
};
export function SettingsPages({ section, session }: { section: string; session: Session }) {
  if (section === 'api-keys')
    return (
      <Keys
        canManage={session.principal.role !== 'viewer'}
        canPublish={['owner', 'admin'].includes(session.principal.role)}
      />
    );
  if (section === 'environments' || section === 'bridge')
    return (
      <Environments
        bridgeOnly={section === 'bridge'}
        canManage={session.principal.role !== 'viewer'}
      />
    );
  if (section === 'team')
    return <Team canManage={['owner', 'admin'].includes(session.principal.role)} />;
  return <Account session={session} />;
}
function Keys({ canManage, canPublish }: { canManage: boolean; canPublish: boolean }) {
  const query = useApi<ApiKey[]>('api-keys'),
    domains = useApi<{ id: string; name: string }[]>('domains'),
    create = useAction<ApiKey & { token: string }>('api-keys');
  const [open, setOpen] = useState(false),
    [permission, setPermission] = useState('sending_access'),
    [secret, setSecret] = useState('');
  return (
    <>
      <PageHeader
        title="API keys"
        description="Give your applications the access they need."
        actions={
          <Button className="primary" disabled={!canManage} onClick={() => setOpen(true)}>
            <Plus size={15} />
            Create API key
          </Button>
        }
      />
      <ErrorBox error={query.error} />
      <DataTable
        data={query.data ?? []}
        columns={[
          {
            accessorKey: 'name',
            header: 'Name',
            cell: ({ getValue }) => (
              <span className="entity-cell">
                <KeyRound size={16} />
                <strong>{String(getValue())}</strong>
              </span>
            ),
          },
          {
            accessorKey: 'prefix',
            header: 'Key',
            cell: ({ getValue }) => <code>{String(getValue())}••••••••</code>,
          },
          {
            accessorKey: 'permission',
            header: 'Permission',
            cell: ({ row, getValue }) => (
              <Badge>
                {String(getValue()).replaceAll('_', ' ')}
                {row.original.allow_publish ? ' · publication' : ''}
              </Badge>
            ),
          },
          {
            accessorKey: 'domain_id',
            header: 'Domain',
            cell: ({ getValue }) =>
              domains.data?.find((d) => d.id === getValue())?.name ?? 'All domains',
          },
          {
            accessorKey: 'last_used_at',
            header: 'Last used',
            cell: ({ getValue }) => date(getValue()),
          },
          {
            id: 'revoke',
            cell: ({ row }) =>
              row.original.revoked_at ? (
                <Badge>Revoked</Badge>
              ) : (
                <ConfirmButton
                  className="compact danger"
                  disabled={!canManage}
                  title="Revoke API key?"
                  description="Applications using this key will lose access immediately."
                  onConfirm={async () => {
                    await api(`api-keys/${row.original.id}`, 'DELETE');
                    await query.refetch();
                  }}
                >
                  Revoke
                </ConfirmButton>
              ),
          },
        ]}
      />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Create an API key"
        description="Permission and domain scope are fixed when the key is created."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            create.mutate(
              {
                ...form,
                domain_id: form.domain_id || undefined,
                allow_publish: form.allow_publish === 'on',
              },
              {
                onSuccess: (result) => {
                  setSecret(result.token);
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field label="Name">
            <input name="name" required placeholder="Production application" />
          </Field>
          <Field label="Permission">
            <select
              name="permission"
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
            >
              <option value="sending_access">Sending access</option>
              <option value="full_access">Full access</option>
            </select>
          </Field>
          {permission === 'sending_access' && (
            <Field label="Domain">
              <select name="domain_id">
                <option value="">All domains</option>
                {domains.data?.map((domain) => (
                  <option value={domain.id} key={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {canPublish && permission === 'full_access' && (
            <Field
              label="Allow publication"
              hint="Delegate Development-to-Production publication. This permission cannot be changed after creation."
            >
              <input type="checkbox" name="allow_publish" />
            </Field>
          )}
          <ErrorBox error={create.error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={create.isPending}>
              Create key
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(secret)}
        onOpenChange={(v) => !v && setSecret('')}
        title="Save your API key"
        description="This is the only time the full key will be shown."
      >
        <div className="secret-box">
          <code>{secret}</code>
          <button
            className="icon-button"
            aria-label="Copy API key"
            onClick={() => void navigator.clipboard.writeText(secret)}
          >
            <Copy size={17} />
          </button>
        </div>
        <div className="dialog-actions">
          <Button onClick={() => setSecret('')}>I’ve saved my key</Button>
        </div>
      </Modal>
    </>
  );
}
function Environments({ bridgeOnly, canManage }: { bridgeOnly: boolean; canManage: boolean }) {
  const query = useApi<Environment[]>('environments');
  const [selected, setSelected] = useState<Environment | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader
        title={bridgeOnly ? 'Bridge' : 'Environments'}
        description={
          bridgeOnly
            ? 'Connect externally managed workflow code to your environment.'
            : 'Keep development and production isolated. Publish only when you’re ready.'
        }
      />
      <ErrorBox error={query.error} />
      <div className="environment-grid">
        {query.data?.map((env) => (
          <section className="panel" key={env.id}>
            <div className="panel-heading">
              <h2>{env.name}</h2>
              <Badge tone={env.novu_configured ? 'verified' : 'pending'}>
                {env.novu_configured ? 'Engine configured' : 'Setup required'}
              </Badge>
            </div>
            <dl>
              <div>
                <dt>Environment ID</dt>
                <dd className="mono small">{env.id}</dd>
              </div>
              <div>
                <dt>Application ID</dt>
                <dd>{env.novu_application_id ?? 'Not configured'}</dd>
              </div>
              <div>
                <dt>Bridge URL</dt>
                <dd>{env.bridge_url ?? 'Not configured'}</dd>
              </div>
            </dl>
            <Button disabled={!canManage} onClick={() => setSelected(env)}>
              Configure {env.name}
            </Button>
          </section>
        ))}
      </div>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelected(null)}
        title={`Configure ${selected?.name}`}
        description="Service credentials are encrypted. Leave an existing key blank to preserve it."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            setBusy(true);
            const body = Object.fromEntries(
              Object.entries(form).filter(([, value]) => value !== ''),
            );
            void api(`environments/${selected?.id}`, 'PATCH', body)
              .then(() => {
                void query.refetch();
                setSelected(null);
              }, setError)
              .finally(() => setBusy(false));
          }}
        >
          <Field
            label="Novu webhook signing secret"
            hint="Optional. Verifies native engine callbacks; existing secret is retained when left blank."
          >
            <input
              name="novu_webhook_secret"
              type="password"
              autoComplete="new-password"
              placeholder="whsec_…"
            />
          </Field>
          <Field label="Novu API key">
            <input
              name="novu_api_key"
              type="password"
              autoComplete="off"
              placeholder={
                selected?.novu_configured
                  ? '•••••••• (leave blank to keep)'
                  : 'Paste the environment’s Novu key'
              }
            />
          </Field>
          <Field label="Novu application identifier">
            <input name="novu_application_id" defaultValue={selected?.novu_application_id ?? ''} />
          </Field>
          <Field label="Bridge URL">
            <input
              name="bridge_url"
              type="url"
              defaultValue={selected?.bridge_url ?? ''}
              placeholder="https://bridge.example.com/api/novu"
            />
          </Field>
          <ErrorBox error={error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={busy}>
              Save configuration
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
type Member = { id: string; name: string; email: string; role: string; created_at: string };
function Team({ canManage }: { canManage: boolean }) {
  const query = useApi<Member[]>('team'),
    invite = useAction<{ accept_url: string }>('team/invites');
  const [open, setOpen] = useState(false),
    [link, setLink] = useState(''),
    [error, setError] = useState<unknown>();
  return (
    <>
      <PageHeader
        title="Team"
        description="Build your notification experience together."
        actions={
          <Button className="primary" disabled={!canManage} onClick={() => setOpen(true)}>
            <Plus size={15} />
            Invite member
          </Button>
        }
      />
      <ErrorBox error={query.error || error} />
      <DataTable
        data={query.data ?? []}
        columns={[
          {
            accessorKey: 'name',
            header: 'Member',
            cell: ({ row }) => (
              <div className="entity-cell">
                <span className="user-avatar">{row.original.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{row.original.name}</strong>
                  <small>{row.original.email}</small>
                </span>
              </div>
            ),
          },
          {
            accessorKey: 'role',
            header: 'Role',
            cell: ({ row }) => (
              <select
                aria-label={`Role for ${row.original.email}`}
                value={row.original.role}
                disabled={!canManage}
                onChange={(e) => {
                  void api(`team/${row.original.id}`, 'PATCH', { role: e.target.value }).then(
                    () => query.refetch(),
                    setError,
                  );
                }}
              >
                {['owner', 'admin', 'developer', 'viewer'].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            ),
          },
          { accessorKey: 'created_at', header: 'Joined', cell: ({ getValue }) => date(getValue()) },
          {
            id: 'remove',
            cell: ({ row }) => (
              <ConfirmButton
                className="compact danger"
                disabled={!canManage}
                aria-label={`Remove ${row.original.email}`}
                title="Remove team member?"
                description="This person will lose access to this organization."
                onConfirm={async () => {
                  await api(`team/${row.original.id}`, 'DELETE');
                  await query.refetch();
                }}
              >
                <Trash2 size={16} />
              </ConfirmButton>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Invite a teammate"
        description="Create a secure invitation link to share with your teammate."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(Object.fromEntries(new FormData(e.currentTarget)), {
              onSuccess: (result) => {
                setLink(result.accept_url);
                setOpen(false);
              },
            });
          }}
        >
          <Field label="Email">
            <input name="email" type="email" required />
          </Field>
          <Field label="Role">
            <select name="role">
              <option value="developer">Developer</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </Field>
          <ErrorBox error={invite.error} />
          <div className="dialog-actions">
            <Button className="primary" disabled={invite.isPending}>
              Create invitation
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(link)}
        onOpenChange={(v) => !v && setLink('')}
        title="Invitation ready"
        description="Share this link directly with your teammate."
      >
        <div className="secret-box">
          <code>{link}</code>
          <button
            className="icon-button"
            aria-label="Copy invitation"
            onClick={() => void navigator.clipboard.writeText(link)}
          >
            <Copy size={16} />
          </button>
        </div>
      </Modal>
    </>
  );
}
function Account({ session }: { session: Session }) {
  const setup = useAction<{ secret: string; uri: string }>('auth/mfa/setup'),
    enable = useAction<{ recovery_codes: string[] }>('auth/mfa/enable'),
    disable = useAction('auth/mfa/disable');
  const [password, setPassword] = useState(''),
    [code, setCode] = useState('');
  const audit = useApi<{ id: string; action: string; created_at: string }[]>('audit-logs');
  return (
    <>
      <PageHeader title="Settings" description="Your account and workspace security." />
      <div className="detail-grid">
        <section className="panel">
          <h2>Profile</h2>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{session.user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{session.user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>
                <Badge>{session.principal.role}</Badge>
              </dd>
            </div>
          </dl>
          <h2 className="section-title">
            <ShieldCheck size={18} />
            Two-factor authentication
          </h2>
          <p className="muted">Add an authenticator app to protect your account.</p>
          <Badge tone={session.user.mfa_enabled ? 'verified' : 'inactive'}>
            {session.user.mfa_enabled ? 'Enabled' : 'Not enabled'}
          </Badge>
          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {setup.data && !session.user.mfa_enabled && (
            <>
              <div className="secret-box">
                <code>{setup.data.secret}</code>
                <button
                  className="icon-button"
                  aria-label="Copy authenticator secret"
                  onClick={() => void navigator.clipboard.writeText(setup.data!.secret)}
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="muted small">
                Enter this setup key in your authenticator app, then enter its six-digit code.
              </p>
            </>
          )}
          <Field label="Authenticator or recovery code">
            <input
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <ErrorBox error={setup.error || enable.error || disable.error} />
          {session.user.mfa_enabled ? (
            <Button
              className="danger"
              disabled={disable.isPending}
              onClick={() =>
                disable.mutate(
                  { password, code },
                  {
                    onSuccess: () => {
                      setup.reset();
                      enable.reset();
                      setPassword('');
                      setCode('');
                    },
                  },
                )
              }
            >
              Disable two-factor authentication
            </Button>
          ) : setup.data ? (
            <Button
              className="primary"
              disabled={enable.isPending}
              onClick={() =>
                enable.mutate(
                  { code },
                  {
                    onSuccess: () => {
                      setup.reset();
                      setPassword('');
                      setCode('');
                    },
                  },
                )
              }
            >
              Enable two-factor authentication
            </Button>
          ) : (
            <Button
              disabled={!password || setup.isPending}
              onClick={() => setup.mutate({ password })}
            >
              Set up authenticator
            </Button>
          )}
          {enable.data && (
            <div className="info-banner">
              <div>
                <strong>Save these recovery codes</strong>
                <pre>{pretty(enable.data.recovery_codes)}</pre>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Recent audit activity</h2>
          <ErrorBox error={audit.error} />
          <div className="timeline">
            {audit.data?.slice(0, 15).map((event) => (
              <div key={event.id}>
                <i />
                <strong>{event.action.replaceAll('.', ' · ')}</strong>
                <small>{date(event.created_at)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
