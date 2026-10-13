'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Flame,
  Send,
  Workflow,
  Users,
  Layers,
  Activity,
  Plug,
  Mail,
  Globe,
  ShieldBan,
  Webhook,
  FileText,
  BarChart3,
  KeyRound,
  Settings,
  ChevronsUpDown,
  Search,
  Sun,
  Moon,
  ArrowUpRight,
  LogOut,
  ChevronRight,
  Command,
  PanelLeftClose,
  PanelLeft,
  Box,
  Code2,
} from 'lucide-react';
import { api, useApi } from '../lib/api';
import type { Session, WorkflowRow } from '../lib/api';
import { Button, Badge, Modal, ErrorBox, Loading } from './ui';
import {
  Workflows,
  Subscribers,
  ActivityPage,
  Domains,
  Emails,
  SettingsPages,
  Topics,
  Integrations,
  Suppressions,
} from './pages';
import { WebhooksPage, LogsPage, MetricsPage } from './operations-pages';
import { AudiencePage, TemplatesPage, BroadcastsPage } from './audience-pages';
import { LayoutsPage, TranslationsPage } from './content-pages';
import { InboundPage } from './inbound-pages';
import { AutomationsPage } from './automation-pages';
import { WorkflowEditor } from './workflow-editor';
const groups: { name: string; items: [string, string, typeof Workflow][] }[] = [
  {
    name: 'WORKSPACE',
    items: [
      ['workflows', 'Workflows', Workflow],
      ['subscribers', 'Subscribers', Users],
      ['topics', 'Topics', Layers],
      ['activity', 'Activity feed', Activity],
      ['integrations', 'Integrations', Plug],
      ['layouts', 'Layouts', Layers],
      ['translations', 'Translations', FileText],
    ],
  },
  {
    name: 'EMAIL',
    items: [
      ['emails', 'Emails', Mail],
      ['domains', 'Domains', Globe],
      ['audience', 'Audience', Users],
      ['broadcasts', 'Broadcasts', Send],
      ['automations', 'Automations', Workflow],
      ['templates', 'Templates', Code2],
      ['inbound', 'Inbound', Mail],
      ['suppressions', 'Suppressions', ShieldBan],
      ['webhooks', 'Webhooks', Webhook],
      ['logs', 'Logs', FileText],
      ['metrics', 'Metrics', BarChart3],
    ],
  },
  {
    name: 'DEVELOPER',
    items: [
      ['api-keys', 'API keys', KeyRound],
      ['environments', 'Environments', Box],
      ['bridge', 'Bridge', Code2],
      ['team', 'Team', Users],
      ['settings', 'Settings', Settings],
    ],
  },
];
export function Dashboard({ section, id }: { section: string; id?: string }) {
  const session = useApi<Session>('session');
  const environments =
    useApi<{ id: string; name: string; novu_configured: boolean; bridge_url: string | null }[]>(
      'environments',
    );
  const router = useRouter(),
    client = useQueryClient();
  const [search, setSearch] = useState(false),
    [query, setQuery] = useState(''),
    [publishing, setPublishing] = useState(false),
    [theme, setTheme] = useState('light'),
    [collapsed, setCollapsed] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    const theme = localStorage.getItem('flare-theme') ?? 'light';
    setTheme(theme);
    document.documentElement.dataset.theme = theme;
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearch((value) => !value);
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    if (session.error && 'status' in session.error && session.error.status === 401)
      router.replace('/login');
  }, [session.error, router]);
  if (session.isPending) return <Loading />;
  if (!session.data)
    return (
      <main className="page">
        <ErrorBox error={session.error} />
        <Link href="/login">Return to sign in</Link>
      </main>
    );
  const data = session.data,
    organization = data.organizations.find((v) => v.id === data.principal.orgId),
    environment = organization?.environments.find((v) => v.id === data.principal.environmentId);
  const writable = data.principal.role !== 'viewer';
  const canPublish = ['owner', 'admin'].includes(data.principal.role) && !data.principal.production;
  const activeEnvironment = environments.data?.find((v) => v.id === data.principal.environmentId);
  const change = async (orgId: string, environmentId: string) => {
    setError(undefined);
    try {
      await api('session/switch', 'POST', { orgId, environmentId });
      client.clear();
      router.push(`/${section}`);
      router.refresh();
    } catch (e) {
      setError(e);
    }
  };
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('flare-theme', next);
    document.documentElement.dataset.theme = next;
  };
  const title = groups.flatMap((g) => g.items).find((v) => v[0] === section)?.[1] ?? 'Workspace';
  let content: React.ReactNode;
  if (section === 'workflows')
    content = id ? (
      <WorkflowEditor
        key={`${data.principal.environmentId}/${id}`}
        id={id}
        editable={writable && !data.principal.production}
      />
    ) : (
      <Workflows editable={writable && !data.principal.production} />
    );
  else if (section === 'subscribers') content = <Subscribers id={id} writable={writable} />;
  else if (section === 'activity') content = <ActivityPage id={id} />;
  else if (section === 'domains') content = <Domains id={id} writable={writable} />;
  else if (section === 'emails') content = <Emails id={id} writable={writable} />;
  else if (section === 'audience') content = <AudiencePage id={id} writable={writable} />;
  else if (section === 'templates')
    content = <TemplatesPage id={id} editable={writable && !data.principal.production} />;
  else if (section === 'layouts')
    content = <LayoutsPage id={id} editable={writable && !data.principal.production} />;
  else if (section === 'translations')
    content = <TranslationsPage editable={writable && !data.principal.production} />;
  else if (section === 'inbound') content = <InboundPage id={id} writable={writable} />;
  else if (section === 'automations')
    content = (
      <AutomationsPage
        id={id}
        editable={writable && !data.principal.production}
        writable={writable}
      />
    );
  else if (section === 'broadcasts') content = <BroadcastsPage id={id} writable={writable} />;
  else if (section === 'topics') content = <Topics writable={writable} />;
  else if (section === 'integrations') content = <Integrations writable={writable} />;
  else if (section === 'webhooks') content = <WebhooksPage id={id} writable={writable} />;
  else if (section === 'logs') content = <LogsPage id={id} />;
  else if (section === 'metrics' || section === 'analytics') content = <MetricsPage />;
  else if (section === 'suppressions') content = <Suppressions writable={writable} />;
  else content = <SettingsPages section={section} session={data} />;
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <Link href="/workflows" className="brand">
          <span className="brand-mark">
            <Flame size={23} />
          </span>
          <span>flare</span>
          <span className="brand-version">BETA</span>
        </Link>
        <div className="workspace-selectors">
          <label className="organization-select">
            <span className="org-avatar">{organization?.name.slice(0, 1)}</span>
            <select
              aria-label="Organization"
              value={organization?.id}
              onChange={(e) => {
                const next = data.organizations.find((v) => v.id === e.target.value);
                if (next?.environments[0]) void change(next.id, next.environments[0].id);
              }}
            >
              {data.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown size={13} />
          </label>
          <label className="environment-select">
            <span
              className={`status-dot ${data.principal.production ? 'production' : 'development'}`}
            />
            <select
              aria-label="Environment"
              value={environment?.id}
              onChange={(e) => void change(data.principal.orgId, e.target.value)}
            >
              {organization?.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown size={12} />
          </label>
        </div>
        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.name}>
              <div className="nav-label">{group.name}</div>
              {group.items.map(([href, label, Icon]) => (
                <Link
                  key={href}
                  aria-label={label}
                  href={`/${href}`}
                  className={`nav-link ${section === href ? 'active' : ''}`}
                  aria-current={section === href ? 'page' : undefined}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {href === 'workflows' && section === href && <span className="nav-active-dot" />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="small muted">PARETO LABS</span>
          <span className="small muted">
            Self-hosted <span className="status-dot development" />
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button"
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <div className="compact-context">
            <select
              aria-label="Organization on tablet"
              value={organization?.id}
              onChange={(e) => {
                const org = data.organizations.find((value) => value.id === e.target.value);
                if (org?.environments[0]) void change(org.id, org.environments[0].id);
              }}
            >
              {data.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Environment on tablet"
              value={environment?.id}
              onChange={(e) => void change(data.principal.orgId, e.target.value)}
            >
              {organization?.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </div>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{title}</span>
            {id && (
              <>
                <ChevronRight size={13} />
                <span className="mono">{id}</span>
              </>
            )}
          </div>
          <div className="top-actions">
            <button className="command-search" onClick={() => setSearch(true)}>
              <Search size={14} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="bridge-status">
              <span
                className={`status-dot ${activeEnvironment?.bridge_url ? 'development' : ''}`}
              />
              {activeEnvironment?.bridge_url ? 'Bridge configured' : 'No bridge'}
            </span>
            {canPublish && (
              <Button className="compact" onClick={() => setPublishing(true)}>
                Publish changes
                <ArrowUpRight size={14} />
              </Button>
            )}
            <button className="icon-button" aria-label="Toggle color theme" onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <Menu.Root>
              <Menu.Trigger className="user-avatar" aria-label="Account menu">
                {data.user.name.slice(0, 2).toUpperCase()}
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="menu" align="end">
                  <div className="menu-user">
                    <strong>{data.user.name}</strong>
                    <small>{data.user.email}</small>
                    <Badge>{data.principal.role}</Badge>
                  </div>
                  <Menu.Item className="menu-item" onSelect={() => router.push('/settings')}>
                    <Settings size={15} />
                    Account settings
                  </Menu.Item>
                  <Menu.Item
                    className="menu-item"
                    onSelect={() => {
                      void api('auth/logout', 'POST', {}).finally(() => {
                        client.clear();
                        router.replace('/login');
                      });
                    }}
                  >
                    <LogOut size={15} />
                    Sign out
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </header>
        <ErrorBox error={error} />
        <main
          className={id && section === 'workflows' ? 'editor-main' : 'page'}
          key={`${data.principal.environmentId}/${section}/${id ?? ''}`}
        >
          {content}
        </main>
      </div>
      <Modal
        open={search}
        onOpenChange={setSearch}
        title="Go to…"
        description="Jump to a workspace page. Press ⌘ K from anywhere."
      >
        <div className="command-input">
          <Command size={18} />
          <input
            autoFocus
            aria-label="Search pages"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="command-results">
          {groups
            .flatMap((g) => g.items)
            .filter((v) => v[1].toLowerCase().includes(query.toLowerCase()))
            .map(([href, label, Icon]) => (
              <button
                key={href}
                onClick={() => {
                  router.push(`/${href}`);
                  setSearch(false);
                  setQuery('');
                }}
              >
                <Icon size={18} />
                {label}
                <ChevronRight size={15} />
              </button>
            ))}
        </div>
      </Modal>
      {publishing && <Publish open={publishing} close={() => setPublishing(false)} />}
    </div>
  );
}
function Publish({ open, close }: { open: boolean; close: () => void }) {
  const diff = useApi<{
    workflows: {
      identifier: string;
      development: WorkflowRow['definition'];
      production: WorkflowRow['definition'] | null;
    }[];
  }>('publish/diff');
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const changed =
    diff.data?.workflows.filter(
      (v) => JSON.stringify(v.development) !== JSON.stringify(v.production),
    ) ?? [];
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Publish to Production"
      description="Review and select the workflows to promote. Subscribers and integrations stay in their environment."
    >
      <ErrorBox error={error || diff.error} />
      <div className="stack">
        {changed.map((w) => (
          <label className="selection-row" key={w.identifier}>
            <input
              type="checkbox"
              checked={selected.includes(w.identifier)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, w.identifier]
                    : selected.filter((v) => v !== w.identifier),
                )
              }
            />
            <span>
              <strong>{w.development.name}</strong>
              <small>{w.identifier}</small>
            </span>
            <Badge>{w.production ? 'updated' : 'new'}</Badge>
          </label>
        ))}
        {!changed.length && !diff.isPending && (
          <p className="muted">All workflows are up to date.</p>
        )}
      </div>
      <div className="dialog-actions">
        <Button onClick={close}>Cancel</Button>
        <Button
          className="primary"
          disabled={!selected.length || busy}
          onClick={() => {
            setBusy(true);
            void api('publish', 'POST', { workflows: selected })
              .then(() => {
                void client.invalidateQueries();
                close();
              }, setError)
              .finally(() => setBusy(false));
          }}
        >
          {busy
            ? 'Publishing…'
            : `Publish ${selected.length} workflow${selected.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </Modal>
  );
}
