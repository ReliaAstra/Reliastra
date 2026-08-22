'use client';

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  CheckCheck,
  DollarSign,
  Loader2,
  MessageSquare,
  Megaphone,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { usePartnerStore } from '@/stores/partner-store';
import { usePartnerNotifications } from '@/hooks/use-partner-notifications';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NotificationItem, PartnerPage } from '@/types/partner';

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  partner_referral_signup: Users,
  partner_commission_earned: DollarSign,
  partner_payout_requested: Wallet,
  partner_payout_paid: Wallet,
  partner_payout_failed: Wallet,
  partner_support_reply: MessageSquare,
  partner_announcement: Megaphone,
  partner_marketing: Megaphone,
};

const EVENT_LABELS: Record<string, string> = {
  partner_referral_signup: 'Referral',
  partner_commission_earned: 'Commission',
  partner_payout_requested: 'Payout',
  partner_payout_paid: 'Payout',
  partner_payout_failed: 'Payout',
  partner_support_reply: 'Support',
  partner_announcement: 'Announcement',
  partner_marketing: 'Update',
};

/** Map a backend `action_url` (e.g. `/?page=payouts`) onto in-app navigation. */
function pageFromActionUrl(actionUrl?: string | null): PartnerPage | null {
  if (!actionUrl) return null;
  const match = /[?&]page=([a-z-]+)/.exec(actionUrl);
  return (match?.[1] as PartnerPage) || null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return '';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function NotificationRow({
  item,
  index,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem;
  index: number;
  onOpen: (item: NotificationItem) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = EVENT_ICONS[item.event] || Bell;
  const label = EVENT_LABELS[item.event] || 'Update';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className={cn(
        'group relative flex gap-3 border-b border-border/40 px-4 py-4 last:border-b-0 transition-colors md:px-5',
        item.is_read ? 'bg-transparent' : 'bg-muted/40'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          item.is_read ? 'bg-muted text-muted-foreground' : 'bg-foreground/90 text-background'
        )}
      >
        <Icon className="size-4" />
      </div>

      <button
        onClick={() => onOpen(item)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className={cn('text-sm', item.is_read ? 'font-normal' : 'font-semibold')}>
            {item.title}
          </p>
          <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-[0.12em]">
            {label}
          </Badge>
          {!item.is_read && (
            <span className="size-1.5 rounded-full bg-foreground" aria-label="Unread" />
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {relativeTime(item.created_at)}
          {item.action_label ? ` · ${item.action_label}` : ''}
        </p>
      </button>

      <button
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="mt-0.5 h-6 w-6 shrink-0 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
      >
        <X className="mx-auto size-3.5" />
      </button>
    </motion.div>
  );
}

export function PageNotifications() {
  const navigate = usePartnerStore((s) => s.navigate);
  const browserEnabled = usePartnerStore((s) => s.browserNotificationsEnabled);
  const {
    items,
    unread,
    isLoading,
    isError,
    markRead,
    markAllRead,
    dismiss,
    permission,
    enableBrowserNotifications,
  } = usePartnerNotifications({ browserEnabled });

  // Opening the page marks what the partner can see as read.
  useEffect(() => {
    const unreadIds = items.filter((i) => !i.is_read).map((i) => i.id);
    if (unreadIds.length) {
      const timer = setTimeout(() => void markRead(unreadIds), 1200);
      return () => clearTimeout(timer);
    }
  }, [items, markRead]);

  const showEnablePrompt = useMemo(
    () => permission !== 'granted' && permission !== 'unsupported',
    [permission]
  );

  const handleOpen = (item: NotificationItem) => {
    void markRead([item.id]);
    const page = pageFromActionUrl(item.action_url);
    if (page) navigate(page);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Referrals, commissions, payouts and messages from RELIASTRA.
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
            <CheckCheck className="mr-1.5 size-3.5" />
            Mark all read
          </Button>
        )}
      </motion.div>

      {showEnablePrompt && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <BellOff className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Browser notifications are off. Turn them on to get a desktop alert the
            moment a referral signs up or a payout is sent.
          </p>
          <Button size="sm" variant="outline" onClick={() => void enableBrowserNotifications()}>
            Enable
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}

        {!isLoading && isError && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Unable to load notifications. Please refresh.
            </p>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="py-16 text-center">
            <Bell className="mx-auto mb-3 size-6 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-medium tracking-tight">
              Nothing yet
            </h3>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              You&apos;ll be notified here when someone signs up through your link,
              when you earn commission, and when a payout is sent.
            </p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          items.map((item, index) => (
            <NotificationRow
              key={item.id}
              item={item}
              index={index}
              onOpen={handleOpen}
              onDismiss={(id) => void dismiss(id)}
            />
          ))}
      </div>
    </div>
  );
}
