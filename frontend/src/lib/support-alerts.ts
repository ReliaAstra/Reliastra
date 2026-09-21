/**
 * Browser (Chrome) notifications for incoming support email.
 *
 * The admin asked to hear about a support email the moment it lands, so they
 * can answer it immediately from the inbox. Email already covers a closed
 * browser; this covers the case the email cannot: the console is open, in
 * another tab, and the operator should not have to poll the page.
 *
 * Two design rules keep it honest:
 *
 * 1. **One notifier.** The OS notification, the in-app toast and the queue
 *    refresh all come from the same reading of `GET /v1/admin/support/alerts`.
 *    Nothing else in the admin console keeps a timer on support.
 * 2. **No re-announcing.** The cursor is persisted per browser, so a ticket
 *    announced once is never announced again after a reload - a desk that
 *    repeats itself is a desk people mute.
 *
 * Everything here is SSR-safe and framework-free: the React glue lives in
 * `components/admin/support-alert-watcher.tsx`, and the pure decisions are
 * unit-tested in `lib/__tests__/support-alerts.test.ts`.
 */

import type { SupportAlertItem, SupportAlertsResponse } from '@/types/admin';

/** localStorage key holding the ISO cursor of the last announced email. */
export const SUPPORT_ALERT_CURSOR_KEY = 'reliastra.admin.support.cursor';

/** How often the shell asks whether anything new arrived. */
export const SUPPORT_ALERT_POLL_MS = 20_000;

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

/** Whether this browser can raise a desktop notification, and on what terms. */
export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission as Exclude<NotificationSupport, 'unsupported'>;
}

/** Ask once, from a user gesture - Chrome ignores a request that is not. */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported';
  const permission = await window.Notification.requestPermission();
  return permission as NotificationSupport;
}

export function readAlertCursor(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(SUPPORT_ALERT_CURSOR_KEY);
    return value && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    // Private mode / storage disabled: fall back to "no cursor", which the
    // first poll replaces with the server's clock.
    return null;
  }
}

export function writeAlertCursor(iso: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SUPPORT_ALERT_CURSOR_KEY, iso);
  } catch {
    // Nothing to do: the next poll simply starts from the server's clock.
  }
}

/**
 * Cursor to advance to after a poll, or `null` when there is nothing to save.
 *
 * The server clamps a stale or future cursor, so its echoed `since` is the
 * truth - advancing to it can only ever move forward.
 */
export function nextAlertCursor(previous: string | null, response: SupportAlertsResponse): string | null {
  const candidate = response.server_time || response.since;
  if (!candidate || Number.isNaN(Date.parse(candidate))) return null;
  if (previous && Date.parse(candidate) <= Date.parse(previous)) return null;
  return candidate;
}

/** Title for a Chrome notification about new mail. */
export function alertNotificationTitle(response: SupportAlertsResponse): string {
  if (response.new_count === 1 && response.latest.length === 1) {
    return `${response.latest[0].ticket_number} - new support email`;
  }
  return `${response.new_count} new support emails`;
}

/**
 * Body copy for a Chrome notification.
 *
 * With several arrivals it leads with the newest and counts the rest, so the
 * operator knows whether one reply or a batch is waiting.
 */
export function alertNotificationBody(response: SupportAlertsResponse): string {
  const [first] = response.latest;
  if (!first) return 'Open the support inbox to read it.';
  const who = first.requester_name?.trim() || first.requester_email;
  const line = `${who}: ${first.subject}`;
  const rest = response.new_count - 1;
  return rest > 0 ? `${line} (+${rest} more)` : line;
}

/** Ticket id, used as the notification tag so one ticket never stacks twice. */
export function alertNotificationTag(item: SupportAlertItem): string {
  return `reliastra-support-${item.id}`;
}

/**
 * Raise the Chrome notification for a new support email.
 *
 * Returns whether one was actually shown. Clicking it focuses the console and
 * hands the ticket back to the caller, which navigates (`router.push` from the
 * component) - the notification lives outside React, so routing stays with
 * whichever component owns the router. Never throws: a notification failure
 * must not break the poll that drives the queue refresh.
 */
export function showSupportAlertNotification(
  item: SupportAlertItem,
  onOpen?: (item: SupportAlertItem) => void
): boolean {
  if (notificationSupport() !== 'granted') return false;
  try {
    const notification = new window.Notification(item.ticket_number, {
      body: alertNotificationBody({
        server_time: item.created_at,
        since: item.created_at,
        new_count: 1,
        awaiting_reply_count: 0,
        highest_priority: item.priority,
        latest: [item],
      }),
      tag: alertNotificationTag(item),
      // A support email is the one notification worth holding on screen: the
      // whole point is an answer within the minute.
      requireInteraction: true,
      icon: '/social/reliastra-social-square.png',
      badge: '/social/reliastra-social-square.png',
    } as NotificationOptions);
    notification.onclick = () => {
      window.focus();
      onOpen?.(item);
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Ticket links for the in-app toast, newest first. */
export function alertTicketLinks(response: SupportAlertsResponse): string[] {
  return response.latest.map((item) => item.id);
}
