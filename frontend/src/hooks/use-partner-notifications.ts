'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerApi } from '@/lib/partner-api';
import type { NotificationItem, NotificationListResponse } from '@/types/partner';

const POLL_INTERVAL_MS = 20_000;
/** Notifications already surfaced as a desktop toast, so we never repeat one. */
const SEEN_STORAGE_KEY = 'partner_notified_ids';

type BrowserPermission = 'default' | 'granted' | 'denied' | 'unsupported';

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    // Keep the list bounded — only recent ids matter for de-duplication.
    window.localStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify(Array.from(ids).slice(-200))
    );
  } catch {
    /* storage full or unavailable — de-duplication degrades, nothing breaks */
  }
}

export function browserNotificationPermission(): BrowserPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as BrowserPermission;
}

/**
 * Ask the browser for notification permission.
 *
 * Must be called from a user gesture (a click) — Chrome ignores permission
 * prompts that are not user-initiated.
 */
export async function requestBrowserNotifications(): Promise<BrowserPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  try {
    const result = await Notification.requestPermission();
    return result as BrowserPermission;
  } catch {
    return 'denied';
  }
}

/**
 * Partner notification feed.
 *
 * Polls the backend every 20s and — when the partner has both enabled browser
 * notifications in Settings and granted the Chrome permission — raises a
 * desktop notification for each newly arrived unread item. The in-app feed is
 * always the source of truth; the desktop popup is a mirror of it, which is
 * why nothing is ever shown twice (ids are remembered in localStorage).
 */
export function usePartnerNotifications(options?: { browserEnabled?: boolean }) {
  const queryClient = useQueryClient();
  const seenRef = useRef<Set<string> | null>(null);
  const primedRef = useRef(false);
  const [permission, setPermission] = useState<BrowserPermission>('default');

  useEffect(() => {
    seenRef.current = readSeen();
    setPermission(browserNotificationPermission());
  }, []);

  const query = useQuery<NotificationListResponse>({
    queryKey: ['partner-notifications'],
    queryFn: () => partnerApi.getNotifications(1, 20),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  // Raise desktop notifications for items we have not popped before.
  useEffect(() => {
    if (!options?.browserEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!items.length) return;

    const seen = seenRef.current ?? readSeen();

    // The first successful poll only primes the cache: we must not spam the
    // partner with a popup for every historical notification on page load.
    if (!primedRef.current) {
      primedRef.current = true;
      items.forEach((item) => seen.add(item.id));
      seenRef.current = seen;
      writeSeen(seen);
      return;
    }

    const fresh = items.filter((item) => !item.is_read && !seen.has(item.id));
    fresh.slice(0, 3).forEach((item: NotificationItem) => {
      try {
        const notification = new Notification(item.title, {
          body: item.body,
          tag: item.id,
          icon: '/favicon.ico',
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {
        /* some browsers require a service worker — silently skip */
      }
      seen.add(item.id);
    });
    if (fresh.length) {
      seenRef.current = seen;
      writeSeen(seen);
    }
  }, [items, options?.browserEnabled]);

  const markAllRead = useCallback(async () => {
    await partnerApi.markNotificationsRead();
    await queryClient.invalidateQueries({ queryKey: ['partner-notifications'] });
  }, [queryClient]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      await partnerApi.markNotificationsRead(ids);
      await queryClient.invalidateQueries({ queryKey: ['partner-notifications'] });
    },
    [queryClient]
  );

  const dismiss = useCallback(
    async (id: string) => {
      await partnerApi.dismissNotification(id);
      await queryClient.invalidateQueries({ queryKey: ['partner-notifications'] });
    },
    [queryClient]
  );

  const enableBrowserNotifications = useCallback(async () => {
    const result = await requestBrowserNotifications();
    setPermission(result);
    return result;
  }, []);

  return {
    items,
    unread,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    permission,
    markRead,
    markAllRead,
    dismiss,
    enableBrowserNotifications,
    refetch: query.refetch,
  };
}
