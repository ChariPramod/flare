'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CornerDownLeft, Search, SearchX, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from './ui';
import styles from './command-palette.module.css';

export type NavigationGroup = { name: string; items: [string, string, LucideIcon][] };

const details: Record<string, { description: string; keywords: string }> = {
  overview: {
    description: 'Your workspace at a glance',
    keywords: 'home dashboard quota readiness',
  },
  workflows: {
    description: 'Build and test notification flows',
    keywords: 'canvas steps channels trigger',
  },
  subscribers: {
    description: 'People, preferences and their Inbox',
    keywords: 'users recipients notifications in-app',
  },
  topics: { description: 'Group subscribers for notifications', keywords: 'membership groups' },
  activity: {
    description: 'Follow workflow runs and channel progress',
    keywords: 'timeline history events status',
  },
  integrations: {
    description: 'Connect delivery providers',
    keywords: 'channels credentials smtp sms push chat',
  },
  layouts: {
    description: 'Shared wrappers for email content',
    keywords: 'header footer body design',
  },
  translations: {
    description: 'Manage content in different languages',
    keywords: 'locale localization dictionary',
  },
  emails: {
    description: 'Send email and inspect each message',
    keywords: 'outbound compose schedule attachments',
  },
  domains: {
    description: 'Verify senders and check DNS readiness',
    keywords: 'spf dkim dmarc ownership',
  },
  audience: {
    description: 'Contacts, properties and segments',
    keywords: 'import csv mailing lists',
  },
  broadcasts: {
    description: 'Plan email campaigns for your audience',
    keywords: 'marketing bulk recipients',
  },
  automations: {
    description: 'Build event-driven email sequences',
    keywords: 'journey rules wait steps',
  },
  templates: {
    description: 'Create and version reusable email content',
    keywords: 'html drafts editor design',
  },
  inbound: {
    description: 'Read incoming messages and attachments',
    keywords: 'inbound receive mime forwarding',
  },
  suppressions: {
    description: 'Review addresses blocked from sending',
    keywords: 'bounce complaint unsubscribe restrictions',
  },
  webhooks: {
    description: 'Deliver events to your applications',
    keywords: 'callbacks endpoints replay signature',
  },
  logs: {
    description: 'Inspect requests and troubleshoot errors',
    keywords: 'diagnostics debugging http search',
  },
  metrics: {
    description: 'Understand delivery and engagement',
    keywords: 'analytics opens clicks performance',
  },
  'dead-letters': {
    description: 'Inspect failed work and eligible retries',
    keywords: 'recovery redrive queue errors',
  },
  'api-keys': {
    description: 'Manage credentials for your applications',
    keywords: 'tokens access authentication scope',
  },
  environments: {
    description: 'Configure Development and Production',
    keywords: 'novu application settings',
  },
  bridge: {
    description: 'Configure the workflow engine connection',
    keywords: 'endpoint url novu application',
  },
  team: {
    description: 'Invite teammates and manage their roles',
    keywords: 'members permissions access',
  },
  settings: {
    description: 'Your profile, security and audit history',
    keywords: 'account mfa password authenticator two factor',
  },
};

export function CommandPalette({
  groups,
  section,
  onClose,
  onNavigate,
  returnTarget,
}: {
  groups: NavigationGroup[];
  section: string;
  onClose: () => void;
  onNavigate: (href: string) => void;
  returnTarget: HTMLElement | null;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = groups.flatMap((group) =>
    group.items.flatMap(([href, label, Icon]) => {
      const detail = details[href];
      const searchable =
        `${label} ${group.name} ${detail?.description ?? ''} ${detail?.keywords ?? ''}`.toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term))
        ? [{ href, label, Icon, group: group.name, description: detail?.description ?? label }]
        : [];
    }),
  );
  const selected = results[active];
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);
  const reset = () => {
    setQuery('');
    setActive(0);
    input.current?.focus();
  };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Search workspace"
      description="Find a page by name or what you want to do."
      onCloseAutoFocus={(event) => {
        if (returnTarget?.isConnected) {
          event.preventDefault();
          returnTarget.focus();
        }
      }}
    >
      <div className={styles.inputRow}>
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-label="Search pages"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-${selected.href}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Try workflows, DNS or preferences…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (results.length)
                setActive(
                  (index) =>
                    (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
                    results.length,
                );
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (selected) onNavigate(`/${selected.href}`);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear page search"
            onClick={reset}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label="Workspace pages"
        className={styles.results}
      >
        {groups.map((group) => {
          const matches = results.filter((result) => result.group === group.name);
          if (!matches.length) return null;
          return (
            <div key={group.name} role="group" aria-label={group.name}>
              <div className={styles.groupLabel} aria-hidden="true">
                {group.name}
              </div>
              {matches.map(({ href, label, Icon, description }) => (
                <button
                  type="button"
                  key={href}
                  id={`${listId}-${href}`}
                  role="option"
                  aria-label={label}
                  aria-describedby={`${listId}-${href}-description`}
                  aria-selected={selected?.href === href}
                  tabIndex={-1}
                  className={styles.option}
                  onPointerMove={() =>
                    setActive(results.findIndex((result) => result.href === href))
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNavigate(`/${href}`)}
                >
                  <span className={styles.optionIcon}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className={styles.optionText}>
                    <strong>{label}</strong>
                    <span id={`${listId}-${href}-description`}>{description}</span>
                  </span>
                  {href === section && <span className={styles.current}>Current</span>}
                  <CornerDownLeft size={15} aria-hidden="true" className={styles.enterIcon} />
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {!results.length && (
        <div className={styles.empty}>
          <SearchX size={26} aria-hidden="true" />
          <strong>No matching pages</strong>
          <p>Try a page name or a word like “email”, “team” or “DNS”.</p>
          <button type="button" className="button compact" onClick={reset}>
            Show all pages
          </button>
        </div>
      )}
      <div className={styles.footer}>
        <span role="status" aria-live="polite">
          {results.length} {results.length === 1 ? 'page' : 'pages'}
        </span>
        <span className={styles.keyHints} aria-hidden="true">
          <kbd>
            <ArrowUp size={11} />
            <ArrowDown size={11} />
          </kbd>{' '}
          Move
          <kbd>
            <CornerDownLeft size={12} />
          </kbd>{' '}
          Open
          <kbd>Esc</kbd> Close
        </span>
      </div>
    </Modal>
  );
}
