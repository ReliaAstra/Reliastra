'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Inbox, TriangleAlert } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { timeAgo } from '@/lib/dashboard/format';
import { useDismissInboxItem, useInbox, useMarkInboxRead } from '@/lib/dashboard/queries';
import { cn } from '@/lib/utils';

/**
 * The in-dashboard notification bell.
 *
 * Fed entirely by `GET /v1/notifications/inbox`. It used to render three
 * hardcoded strings from `mockNotifications`, so a customer whose dependency
 * was actively degrading saw the same static "Twilio Messaging degraded"
 * line forever, and the unread badge was a literal `2` that nothing ever
 * updated. Every figure here now comes from the backend.
 */
export function NotificationBell({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const setUnread = useAppStore((s) => s.setUnreadCount);
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const inbox = useInbox();
  const markRead = useMarkInboxRead();
  const dismiss = useDismissInboxItem();

  const items = inbox.data?.items ?? [];
  const unread = inbox.data?.unread ?? 0;

  // Keep the store's count honest — other surfaces read `unreadCount`, and it
  // was previously seeded with a hardcoded 2 and never refreshed.
  useEffect(() => {
    setUnread(unread);
  }, [unread, setUnread]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, onOpenChange]);

  const openItem = async (
    id: string,
    href: string | null
  ) => {
    setBusy(true);
    try {
      await markRead.mutateAsync([id]);
    } finally {
      setBusy(false);
    }
    onOpenChange(false);
    if (href) router.push(href);
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await markRead.mutateAsync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => onOpenChange(!open)}
        className="relative flex h-12 w-12 items-center justify-center text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-rs-down" />
        )}
        {unread > 9 && (
          <span className="absolute right-2 top-2 rounded-full bg-rs-down px-1 text-[9px] text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated shadow-rs-popover">
          <div className="flex items-center justify-between border-b border-rs-border-subtle px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-rs-text-accent hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {inbox.isLoading && (
              <div className="space-y-3 p-4" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-rs-hover" />
                    <div className="h-3 w-full animate-pulse rounded bg-rs-hover" />
                  </div>
                ))}
              </div>
            )}

            {/* A failed request must surface as a failure. Falling back to
                fabricated alerts here is exactly the bug this replaced. */}
            {inbox.isError && (
              <div className="p-4">
                <p className="text-sm text-rs-text">Notifications unavailable.</p>
                <button
                  type="button"
                  onClick={() => inbox.refetch()}
                  className="mt-2 text-xs font-medium text-rs-text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                >
                  Try again
                </button>
              </div>
            )}

            {!inbox.isLoading && !inbox.isError && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Inbox size={20} className="text-rs-text-tertiary" />
                <p className="text-sm text-rs-text-secondary">You're all caught up.</p>
                <p className="text-xs text-rs-text-tertiary">
                  Dependency alerts and support replies land here.
                </p>
              </div>
            )}

            {items.map((n) => {
              const urgent = n.priority === 'urgent' || n.priority === 'high';
              return (
                <div
                  key={n.id}
                  className={cn(
                    'group relative border-b border-rs-border-subtle last:border-0',
                    !n.is_read && 'bg-rs-brand-subtle/40'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openItem(n.id, n.action_url)}
                    className="block w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rs-focus"
                  >
                    <div className="flex items-start gap-2">
                      {urgent && (
                        <TriangleAlert
                          size={14}
                          className="mt-0.5 shrink-0 text-rs-down"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-rs-text">{n.title}</span>
                          {!n.is_read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rs-brand" />
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-rs-text-tertiary">
                          {n.body}
                        </p>
                        <p className="mt-1 text-xs text-rs-text-tertiary">
                          {timeAgo(n.created_at)}
                          {n.action_label ? ` · ${n.action_label}` : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => dismiss.mutate(n.id)}
                    className="absolute right-2 top-2 hidden rounded p-1 text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text group-hover:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                  >
                    <span aria-hidden className="text-xs leading-none">
                      ×
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
