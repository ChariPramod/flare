'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useApi, type Session } from '../lib/api';
import { Button } from './ui';

type Entry = { baseline: unknown; value: unknown };
type CommittedEntry = { previous: string | undefined; value: unknown };
function createDraftStore() {
  const entries = new Map<string, Entry>();
  const committed = new Map<string, CommittedEntry>();
  const pending = new Map<string, number>();
  let epoch = 0;
  const active = new Map<string, number>();
  const listeners = new Set<() => void>();
  let revision = 0;
  const emit = () => {
    revision++;
    listeners.forEach((listener) => listener());
  };
  return {
    entries,
    committed,
    pending,
    active,
    generation: () => epoch,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => revision,
    update(key: string, initial: unknown, change: (current: unknown) => unknown) {
      const previous = entries.get(key);
      const baseline = previous ? previous.baseline : initial;
      const value = change(previous ? previous.value : initial);
      if (JSON.stringify(value) === JSON.stringify(baseline)) entries.delete(key);
      else entries.set(key, { baseline, value });
      emit();
    },
    discard(key: string) {
      if (entries.delete(key)) emit();
    },
    retireCommitted(key: string, expected: CommittedEntry) {
      if (committed.get(key) !== expected) return;
      committed.delete(key);
      emit();
    },
    saved(
      key: string,
      submitted: unknown,
      initial: unknown,
      acknowledged: unknown,
      generation: number,
    ) {
      if (generation !== epoch) return;
      committed.set(key, { previous: JSON.stringify(initial), value: acknowledged });
      const current = entries.get(key);
      if (current) {
        if (JSON.stringify(current.value) === JSON.stringify(submitted)) entries.delete(key);
        else entries.set(key, { baseline: acknowledged, value: current.value });
      }
      emit();
    },
    startSaving(key: string) {
      const generation = epoch;
      pending.set(key, (pending.get(key) ?? 0) + 1);
      emit();
      return () => {
        if (generation !== epoch) return;
        const count = (pending.get(key) ?? 1) - 1;
        if (count) pending.set(key, count);
        else pending.delete(key);
        emit();
      };
    },
    clearAll() {
      epoch++;
      entries.clear();
      committed.clear();
      pending.clear();
      emit();
    },
    confirmClearAll() {
      return (
        !(entries.size || pending.size) ||
        window.confirm(
          'Discard all unsaved drafts in this tab and continue? This includes drafts kept on other pages. An already submitted save may still complete.',
        )
      );
    },
    confirmNavigation() {
      return (
        ![...active.keys()].some((key) => entries.has(key)) ||
        window.confirm(
          'Leave this editor? Your unsaved draft will stay in this tab. Save or discard it when you return. Reloading, signing out or switching workspace clears these drafts.',
        )
      );
    },
  };
}
const DraftContext = createContext<ReturnType<typeof createDraftStore> | null>(null);

/** Drafts deliberately never leave memory: no localStorage, IndexedDB or autosave. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDraftStore);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!(store.entries.size || store.pending.size)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const target = new URL(anchor.href, location.href);
      if (
        target.origin !== location.origin ||
        !['http:', 'https:'].includes(target.protocol) ||
        (target.pathname === location.pathname && target.search === location.search)
      )
        return;
      if (!store.confirmNavigation()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', navigate, true);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('click', navigate, true);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [store]);
  return <DraftContext.Provider value={store}>{children}</DraftContext.Provider>;
}

export function useDrafts() {
  const store = useContext(DraftContext);
  if (!store) throw new Error('DraftProvider is required');
  return store;
}

export function useEditorDraft<T>(resource: string, initial: T | undefined) {
  const store = useDrafts();
  const session = useApi<Session>('session');
  const identity = session.data;
  const key = identity
    ? JSON.stringify([
        identity.user.id,
        identity.principal.orgId,
        identity.principal.environmentId,
        resource,
      ])
    : '';
  useSyncExternalStore(store.subscribe, store.snapshot, () => 0);
  useEffect(() => {
    if (!key) return;
    store.active.set(key, (store.active.get(key) ?? 0) + 1);
    return () => {
      const count = (store.active.get(key) ?? 1) - 1;
      if (count) store.active.set(key, count);
      else store.active.delete(key);
    };
  }, [store, key]);
  const entry = store.entries.get(key);
  const accepted = store.committed.get(key);
  const generation = store.generation();
  const initialValue = JSON.stringify(initial);
  useEffect(() => {
    // Once a read moves beyond the pre-save value, the fallback has served its
    // purpose. Retaining it would resurrect old content if the server later
    // legitimately returns to that value. Identity protects a newer save.
    if (accepted && initialValue !== undefined && initialValue !== accepted.previous)
      store.retireCommitted(key, accepted);
  }, [store, key, accepted, initialValue]);
  // Accepted writes stay visible when their follow-up read fails. They are clean,
  // memory-only snapshots, and a newer server value supersedes them.
  const baseline = accepted && initialValue === accepted.previous ? (accepted.value as T) : initial;
  return {
    value: (entry ? entry.value : baseline) as T | undefined,
    pending: store.pending.has(key),
    dirty: Boolean(entry),
    setValue: (value: SetStateAction<T>) => {
      if (
        !key ||
        baseline === undefined ||
        generation !== store.generation() ||
        store.pending.has(key)
      )
        return;
      store.update(key, baseline, (current) =>
        typeof value === 'function' ? (value as (previous: T) => T)(current as T) : value,
      );
    },
    discard: () => {
      if (!store.pending.has(key)) store.discard(key);
    },
    saved: (submitted: T, acknowledged = submitted) =>
      store.saved(key, submitted, initial, acknowledged, generation),
    startSaving: () => store.startSaving(key),
  };
}

export function DraftNotice({
  dirty,
  onDiscard,
  pending = false,
}: {
  dirty: boolean;
  onDiscard: () => void;
  pending?: boolean;
}) {
  if (!dirty) return null;
  return (
    <div className="info-banner" role="status">
      <div>
        <strong>Unsaved changes</strong>
        <p>This draft stays only in this tab. Save explicitly before reloading or signing out.</p>
      </div>
      <Button
        type="button"
        className="compact"
        disabled={pending}
        onClick={() => {
          if (window.confirm('Discard this draft and restore the saved version?')) onDiscard();
        }}
      >
        Discard changes
      </Button>
    </div>
  );
}
