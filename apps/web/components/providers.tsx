'use client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AUTHENTICATION_REQUIRED } from '../lib/api';
import { ThemeProvider } from './theme-provider';
import { DraftProvider } from './drafts';
export function Providers({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [client] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onSuccess: (_data, _variables, _context, mutation) => {
            const message = mutation.meta?.successMessage;
            if (typeof message === 'string' && message) setNotice(message);
          },
        }),
        defaultOptions: { queries: { staleTime: 10000, refetchOnWindowFocus: false } },
      }),
  );
  useEffect(() => {
    function revalidateSession() {
      const session = client.getQueryCache().find({ queryKey: ['api', 'session'], exact: true });
      // A provider or transfer grant can expire independently of the user's session.
      // Let the authenticated shell redirect only after the session endpoint confirms it.
      if (session?.isActive() && session.state.fetchStatus === 'idle')
        void client.refetchQueries({ queryKey: ['api', 'session'], exact: true, type: 'active' });
    }
    window.addEventListener(AUTHENTICATION_REQUIRED, revalidateSession);
    return () => window.removeEventListener(AUTHENTICATION_REQUIRED, revalidateSession);
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <DraftProvider>{children}</DraftProvider>
      </ThemeProvider>
      {notice && (
        <div className="toast" role="status">
          ✓ {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
    </QueryClientProvider>
  );
}
