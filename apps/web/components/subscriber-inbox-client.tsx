'use client';
import { Inbox, NovuProvider, useNotifications, useNovu, type BellRenderer } from '@novu/react';
import { useCallback, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Button, Loading } from './ui';
import { date } from '../lib/api';
import type { InboxAccess } from './subscriber-inbox';

function Lifecycle({ onFailure }: { onFailure: () => void }) {
  const novu = useNovu();
  const generation = useRef(0);
  const instance = useRef(novu);
  useEffect(() => {
    const current = ++generation.current;
    instance.current = novu;
    let active = true;
    let checking = false;
    const disconnect = () => {
      void novu.socket.disconnect().catch(() => undefined);
    };
    const retired = () => instance.current !== novu || generation.current === current;
    const cleanups = [
      novu.on('session.initialize.resolved', ({ error }) => {
        if (!active && retired()) queueMicrotask(disconnect);
        else if (active && error) onFailure();
      }),
      novu.on('socket.connect.pending', () => {
        if (!active && retired()) queueMicrotask(disconnect);
      }),
      novu.on('socket.connect.resolved', ({ error }) => {
        if (!active && retired()) disconnect();
        else if (active && error) onFailure();
      }),
    ];
    const check = async () => {
      if (!active || checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        // count() is an uncached read; it also detects an expired/lost HTTP binding.
        const result = await novu.notifications.count();
        if (active && result.error) onFailure();
      } catch {
        if (active) onFailure();
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => void check(), 15000);
    const visible = () => void check();
    document.addEventListener('visibilitychange', visible);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      // The pinned provider does not close its socket on unmount. disconnect()
      // queues behind initialization; retain guards while that queue settles so
      // a late bootstrap/connect cannot leave a retired client connected.
      const remove = () => cleanups.forEach((cleanup) => cleanup());
      // StrictMode immediately replays this effect on the same SDK instance.
      // Only a replay on the same instance may keep its connection alive.
      queueMicrotask(() => {
        if (instance.current === novu && generation.current !== current) {
          remove();
          return;
        }
        const deadline = setTimeout(remove, 20000);
        void novu.socket
          .disconnect()
          .catch(() => undefined)
          .finally(() => {
            disconnect();
            novu.notifications.clearCache();
            clearTimeout(deadline);
            remove();
          });
      });
    };
  }, [novu, onFailure]);
  return null;
}
function ReadOnlyInbox({ onFailure }: { onFailure: () => void }) {
  const { notifications, isLoading, isFetching, hasMore, fetchMore } = useNotifications({
    limit: 10,
    onError: onFailure,
  });
  return (
    <div aria-label="Read-only notifications">
      {isLoading ? (
        <Loading />
      ) : notifications?.length ? (
        <ul className="timeline">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <strong>{notification.subject || 'Notification'}</strong>
              <p>{notification.body}</p>
              <span className="small muted">{date(notification.createdAt)}</span>
              <span className="small muted"> · {notification.isRead ? 'Read' : 'Unread'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No notifications yet.</p>
      )}
      {hasMore && (
        <Button disabled={isFetching} onClick={() => void fetchMore()}>
          Load more notifications
        </Button>
      )}
    </div>
  );
}
const renderBell: BellRenderer = (unreadCount) => {
  const total = unreadCount?.total ?? 0;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <Bell size={18} aria-hidden="true" />
      {total > 0 && (
        <span
          aria-hidden="true"
          style={{ position: 'absolute', top: -7, right: -7, fontSize: 10, fontWeight: 700 }}
        >
          {total > 99 ? '99+' : total}
        </span>
      )}
      <span className="visually-hidden">Open notifications</span>
    </span>
  );
};
export default function SubscriberInboxClient({
  access,
  writable,
  onFailure,
}: {
  access: InboxAccess;
  writable: boolean;
  onFailure: () => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const fail = useCallback(() => {
    if (active.current) onFailure();
  }, [onFailure]);
  return (
    <NovuProvider
      applicationIdentifier={access.applicationIdentifier!}
      subscriber={access.subscriberId}
      subscriberHash={access.subscriberHash}
      backendUrl={access.backendUrl}
      socketUrl={access.socketUrl}
      socketOptions={access.socketOptions}
    >
      <Lifecycle onFailure={fail} />
      {writable ? <Inbox renderBell={renderBell} /> : <ReadOnlyInbox onFailure={fail} />}
    </NovuProvider>
  );
}
