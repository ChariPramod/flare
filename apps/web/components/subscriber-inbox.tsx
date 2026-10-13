'use client';
import dynamic from 'next/dynamic';
import { useApi } from '../lib/api';
import { ErrorBox, Loading } from './ui';
const Inbox = dynamic(() => import('@novu/react').then((module) => module.Inbox), { ssr: false });
type InboxAccess = {
  subscriberId: string;
  subscriberHash: string;
  applicationIdentifier: string | null;
  backendUrl: string;
  socketUrl: string;
};
export function SubscriberInbox({ id }: { id: string }) {
  const query = useApi<InboxAccess>(`subscribers/${encodeURIComponent(id)}/inbox-token`);
  return (
    <section className="panel inbox-panel">
      <div>
        <h2>In-app inbox</h2>
        <p className="muted">Preview this subscriber’s live notifications and read state.</p>
      </div>
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : query.data?.applicationIdentifier ? (
        <Inbox
          subscriber={id}
          subscriberHash={query.data.subscriberHash}
          applicationIdentifier={query.data.applicationIdentifier}
          backendUrl={query.data.backendUrl}
          socketUrl={query.data.socketUrl}
        />
      ) : (
        <p className="small muted">
          Configure the Novu application identifier in Environments to connect the inbox.
        </p>
      )}
    </section>
  );
}
