'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
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
  PanelLeftClose,
  PanelLeft,
  Box,
  Code2,
  LayoutDashboard,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { api, useApi } from '../lib/api';
import type { Session } from '../lib/api';
import { Button, Badge, ErrorBox, Loading } from './ui';
import { CommandPalette } from './command-palette';
import type { NavigationGroup } from './command-palette';
import navigationStyles from './command-palette.module.css';
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
import { DeadLettersPage } from './dead-letters-page';
import { WebhooksPage, LogsPage, MetricsPage } from './operations-pages';
import { AudiencePage, TemplatesPage, BroadcastsPage } from './audience-pages';
import { PublicationPanel } from './publication-panel';
import { LayoutsPage, TranslationsPage } from './content-pages';
import { InboundPage } from './inbound-pages';
import { AutomationsPage } from './automation-pages';
import { WorkflowEditor } from './workflow-editor';
import { OverviewPage } from './overview-page';
const groups: NavigationGroup[] = [
  {
    name: 'WORKSPACE',
    items: [
      ['overview', 'Overview', LayoutDashboard],
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
      ['inbound', 'Received email', Mail],
      ['suppressions', 'Suppressions', ShieldBan],
      ['webhooks', 'Webhooks', Webhook],
      ['logs', 'Logs', FileText],
      ['metrics', 'Metrics', BarChart3],
      ['dead-letters', 'Dead letters', ShieldBan],
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
    [publishing, setPublishing] = useState(false),
    [theme, setTheme] = useState('light'),
    [shortcut, setShortcut] = useState('Ctrl K'),
    [collapsed, setCollapsed] = useState(false),
    [navigationOpen, setNavigationOpen] = useState(false),
    [error, setError] = useState<unknown>();
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const publishFromNavigation = useRef(false);
  const publicationReturnTarget = useRef<HTMLElement | null>(null);
  const searchReturnTarget = useRef<HTMLElement | null>(null);
  const sessionRejected = Boolean(
    session.error && 'status' in session.error && session.error.status === 401,
  );
  useEffect(() => {
    try {
      const theme = localStorage.getItem('flare-theme') === 'dark' ? 'dark' : 'light';
      setTheme(theme);
      document.documentElement.dataset.theme = theme;
      setCollapsed(localStorage.getItem('flare-sidebar-collapsed') === 'true');
    } catch {
      // Preferences are optional when browser storage is restricted.
    }
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.repeat) {
        // Keep another dialog's draft and focus scope intact.
        if (!search && document.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        if (!search && document.activeElement instanceof HTMLElement)
          searchReturnTarget.current = document.activeElement;
        setSearch((value) => !value);
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [search]);
  useEffect(() => {
    if (sessionRejected) {
      client.clear();
      router.replace('/login?reason=session-expired');
    }
  }, [sessionRejected, client, router]);
  if (session.isPending || sessionRejected) return <Loading />;
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
    if (orgId === data.principal.orgId && environmentId === data.principal.environmentId) return;
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
    try {
      localStorage.setItem('flare-theme', next);
    } catch {
      /* The current page still updates. */
    }
    document.documentElement.dataset.theme = next;
  };
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('flare-sidebar-collapsed', String(next));
    } catch {
      /* Keep this session usable. */
    }
  };
  const title = groups.flatMap((g) => g.items).find((v) => v[0] === section)?.[1] ?? 'Workspace';
  let content: React.ReactNode;
  if (section === 'overview')
    content = (
      <OverviewPage
        session={data}
        environmentName={environment?.name ?? 'Environment unavailable'}
      />
    );
  else if (section === 'workflows')
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
  else if (section === 'activity') content = <ActivityPage id={id} writable={writable} />;
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
  else if (section === 'dead-letters') content = <DeadLettersPage writable={writable} />;
  else if (section === 'metrics' || section === 'analytics') content = <MetricsPage />;
  else if (section === 'suppressions') content = <Suppressions writable={writable} />;
  else content = <SettingsPages section={section} session={data} />;
  const navigation = (
    <>
      <Link
        href="/overview"
        className="brand"
        aria-label="Flare overview"
        onClick={() => setNavigationOpen(false)}
      >
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
      <nav aria-label="Workspace pages">
        {groups.map((group) => (
          <div className="nav-group" key={group.name}>
            <div className="nav-label">{group.name}</div>
            {group.items.map(([href, label, Icon]) => (
              <Link
                key={href}
                aria-label={label}
                title={collapsed ? label : undefined}
                onClick={() => setNavigationOpen(false)}
                href={`/${href}`}
                className={`nav-link ${section === href ? 'active' : ''}`}
                aria-current={section === href ? 'page' : undefined}
              >
                <Icon size={17} />
                <span>{label}</span>
                {section === href && <span className="nav-active-dot" />}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {canPublish && (
        <Button
          className="drawer-publication primary"
          onClick={() => {
            publishFromNavigation.current = true;
            publicationReturnTarget.current = navigationTrigger.current;
            setNavigationOpen(false);
          }}
        >
          Publish changes <ArrowUpRight size={15} aria-hidden="true" />
        </Button>
      )}
      <div className="sidebar-bottom">
        <span className="small muted">PARETO LABS</span>
        <span className="small muted">Notification workspace</span>
      </div>
    </>
  );
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside id="workspace-navigation" className="sidebar" aria-label="Workspace navigation">
        {navigation}
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button desktop-sidebar-toggle"
            aria-label="Toggle sidebar"
            aria-controls="workspace-navigation"
            aria-expanded={!collapsed}
            onClick={toggleSidebar}
          >
            {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <Dialog.Root open={navigationOpen} onOpenChange={setNavigationOpen}>
            <Dialog.Trigger asChild>
              <button
                ref={navigationTrigger}
                className="icon-button mobile-navigation-toggle"
                aria-label="Open navigation"
              >
                <MenuIcon size={20} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="navigation-overlay" />
              <Dialog.Content
                className="navigation-drawer"
                onCloseAutoFocus={(event) => {
                  if (!publishFromNavigation.current) return;
                  event.preventDefault();
                  publishFromNavigation.current = false;
                  // Let the closing scope leave Radix’s stack before opening the next dialog.
                  queueMicrotask(() => {
                    if (!navigationTrigger.current?.isConnected) return;
                    navigationTrigger.current.focus();
                    setPublishing(true);
                  });
                }}
              >
                <Dialog.Title className="visually-hidden">Workspace navigation</Dialog.Title>
                <Dialog.Description className="visually-hidden">
                  Choose your organization, environment or workspace page.
                </Dialog.Description>
                <Dialog.Close
                  className="icon-button navigation-close"
                  aria-label="Close navigation"
                >
                  <X size={20} />
                </Dialog.Close>
                {navigation}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="mobile-workspace-context">
            <strong>{title}</strong>
            <span>
              <i
                className={`status-dot ${data.principal.production ? 'production' : 'development'}`}
              />
              {environment?.name ?? 'Environment unavailable'}
            </span>
          </div>
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
            <button
              className={navigationStyles.searchTrigger}
              aria-label="Search pages"
              aria-haspopup="dialog"
              aria-expanded={search}
              title={`Search pages (${shortcut})`}
              onClick={(event) => {
                searchReturnTarget.current = event.currentTarget;
                setSearch(true);
              }}
            >
              <Search size={16} aria-hidden="true" />
              <span>Search pages</span>
              <kbd aria-hidden="true">{shortcut}</kbd>
            </button>
            <span className="bridge-status">
              <span
                className={`status-dot ${activeEnvironment?.bridge_url ? 'development' : ''}`}
              />
              {activeEnvironment?.bridge_url ? 'Bridge configured' : 'No bridge'}
            </span>
            {canPublish && (
              <Button
                className="compact"
                onClick={(event) => {
                  publicationReturnTarget.current = event.currentTarget;
                  setPublishing(true);
                }}
              >
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
          id="main-content"
          tabIndex={-1}
          className={id && section === 'workflows' ? 'editor-main' : 'page'}
          key={`${data.principal.environmentId}/${section}/${id ?? ''}`}
        >
          {content}
        </main>
      </div>
      {search && (
        <CommandPalette
          groups={groups}
          section={section}
          returnTarget={searchReturnTarget.current}
          onClose={() => setSearch(false)}
          onNavigate={(href) => {
            router.push(href);
            setSearch(false);
          }}
        />
      )}
      {publishing && (
        <PublicationPanel
          open={publishing}
          close={() => setPublishing(false)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            publicationReturnTarget.current?.focus();
          }}
        />
      )}
    </div>
  );
}
