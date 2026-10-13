'use client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
        mutationCache: new MutationCache({ onSuccess: () => setNotice('Changes saved') }),
        defaultOptions: { queries: { staleTime: 10000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
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
