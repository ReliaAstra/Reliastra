'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import {
  SUPPORT_ALERT_POLL_MS,
  alertNotificationBody,
  alertNotificationTitle,
  nextAlertCursor,
  notificationSupport,
  readAlertCursor,
  showSupportAlertNotification,
  writeAlertCursor,
} from '@/lib/support-alerts';

/**
 * Watches for incoming support email and announces it.
 *
 * Mounted once, in the admin shell, so it runs on every admin page: an
 * operator checking revenue still hears about a support email the moment it
 * arrives. When something is new it does three things at once - Chrome
 * notification (if the browser allows it), an in-app toast, and a refresh of
 * the support queries - and advances the stored cursor so the same email is
 * never announced twice.
 *
 * Deliberately the *only* timer in the support surface. The inbox and a ticket
 * are fetched on demand; this one cheap read keeps them current without either
 * of them polling.
 *
 * The cursor lives in a ref, not state: it is not part of rendering (putting
 * it in the query key would force a fresh request every time it moves), and
 * `queryFn` runs outside render where reading it is exactly right.
 */
export function SupportAlertWatcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cursor = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('unsupported');

  useEffect(() => {
    // Read the persisted cursor once, on the client: mail that arrived while
    // the console was closed is still announced when it reopens.
    cursor.current = readAlertCursor();
    setPermission(notificationSupport());
    setReady(true);
  }, []);

  const alertsQuery = useQuery({
    queryKey: ['admin', 'support', 'alerts'],
    queryFn: () => adminApi.supportAlerts(cursor.current),
    enabled: ready,
    refetchInterval: SUPPORT_ALERT_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const data = alertsQuery.data;

  useEffect(() => {
    if (!data) return;

    const advanced = nextAlertCursor(cursor.current, data);
    if (advanced) {
      cursor.current = advanced;
      writeAlertCursor(advanced);
    }

    if (data.new_count === 0 || data.latest.length === 0) return;

    // The inbox is stale by definition now; refresh it and the overview so the
    // queue and the attention badge agree with what was just announced.
    queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'attention'] });

    const openTicket = (id: string) => router.push(`/admin/support/${id}`);

    // One notification per arrival is too noisy for a batch: the newest gets
    // the Chrome notification and the toast names the total.
    const [newest, ...rest] = data.latest;
    const shown = permission === 'granted' && showSupportAlertNotification(newest, () => openTicket(newest.id));

    toast(alertNotificationTitle(data), {
      description:
        shown || permission === 'granted'
          ? alertNotificationBody(data)
          : `${alertNotificationBody(data)} - enable desktop alerts for instant notice.`,
      duration: 15_000,
      action: { label: 'Answer now', onClick: () => openTicket(newest.id) },
    });

    // The rest are announced too, so a batch is not silently truncated - the
    // per-ticket `tag` keeps them from stacking duplicates of the same email.
    if (permission === 'granted') {
      rest.slice(0, 3).forEach((item) => showSupportAlertNotification(item, () => openTicket(item.id)));
    }
  }, [data, permission, queryClient, router]);

  return null;
}
