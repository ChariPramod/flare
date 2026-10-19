'use client';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, useApi, type Session } from '../lib/api';
import { Button, Loading } from './ui';
const InboxClient = dynamic(() => import('./subscriber-inbox-client'), {
  ssr: false,
  loading: () => <Loading />,
});
export type InboxAccess = {
  subscriberId: string;
  subscriberHash: string;
  applicationIdentifier: string | null;
  backendUrl: string;
  socketUrl: string;
  socketOptions?: {
    socketType: 'self-hosted';
    transports: ['websocket'];
    auth: { flareSessionId: string };
    reconnectionAttempts: number;
    reconnectionDelayMax: number;
    timeout: number;
  };
};
type InboxSession = Session & { principal: Session['principal'] & { sessionId?: string } };
export function SubscriberInbox({ id, writable }: { id: string; writable: boolean }) {
  const session = useApi<InboxSession>('session', 15000);
  const principal = session.data?.principal;
  const scope = principal
    ? `${principal.sessionId ?? session.data!.user.id}/${principal.orgId}/${principal.environmentId}/${principal.role}/${id}`
    : 'unavailable';
  return (
    <section className="panel inbox-panel" aria-label="In-app Inbox">
      <div>
        <h2>In-app Inbox</h2>
        <p className="muted">
          {writable
            ? 'Opening or updating a notification changes this subscriber’s read state.'
            : 'Read-only preview. Viewing these notifications does not change their read or seen state.'}{' '}
          Email received by your domains is available under Received email.
        </p>
      </div>
      {session.error ? (
        <p role="alert">Inbox access is unavailable. Check your session and try again.</p>
      ) : principal ? (
        <ScopedInbox
          key={scope}
          scope={scope}
          id={id}
          writable={writable && principal.role !== 'viewer'}
        />
      ) : (
        <Loading />
      )}
    </section>
  );
}
function ScopedInbox({ scope, id, writable }: { scope: string; id: string; writable: boolean }) {
  const [generation, setGeneration] = useState(0);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const query = useQuery({
    queryKey: ['api', 'inbox-access', scope, generation],
    queryFn: ({ signal }) =>
      api<InboxAccess>(
        `subscribers/${encodeURIComponent(id)}/inbox-token`,
        'GET',
        undefined,
        undefined,
        signal,
      ),
    retry: false,
    gcTime: 0,
  });
  // The pinned SDK hooks retain their original provider. Remount that subtree
  // when refreshed access changes, without putting credentials in React keys.
  const configuration = JSON.stringify(query.data);
  const client = useRef({ configuration, revision: 0 });
  if (client.current.configuration !== configuration) {
    client.current = { configuration, revision: client.current.revision + 1 };
  }
  return (
    <>
      {failed || query.error ? (
        <p role="alert">
          Inbox is unavailable. Reconnect to check your access and start a fresh session.
        </p>
      ) : query.isPending ? (
        <Loading />
      ) : query.data.applicationIdentifier ? (
        <InboxClient
          key={`${generation}/${client.current.revision}`}
          access={query.data}
          writable={writable}
          onFailure={fail}
        />
      ) : (
        <p className="small muted">
          Configure the Novu application identifier in Environments to connect the inbox.
        </p>
      )}
      <Button
        disabled={query.isFetching}
        onClick={() => {
          setFailed(false);
          setGeneration((value) => value + 1);
        }}
      >
        Reconnect Inbox
      </Button>
    </>
  );
}
