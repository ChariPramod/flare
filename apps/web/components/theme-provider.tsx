'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const changed = 'flare:theme-changed';
function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
function subscribe(notify: () => void) {
  const stored = (event: StorageEvent) => {
    if (event.key !== 'flare-theme' && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light';
    notify();
  };
  window.addEventListener(changed, notify);
  window.addEventListener('storage', stored);
  return () => {
    window.removeEventListener(changed, notify);
    window.removeEventListener('storage', stored);
  };
}
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as const);
  function toggleTheme() {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('flare-theme', next);
    } catch {
      // The current document still supports theme changes when storage is unavailable.
    }
    window.dispatchEvent(new Event(changed));
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requires ThemeProvider');
  return context;
}
