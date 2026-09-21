'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  notificationSupport,
  requestNotificationPermission,
  type NotificationSupport,
} from '@/lib/support-alerts';

/**
 * The switch that makes the Chrome notification possible.
 *
 * A browser will only show desktop notifications after the site asks - from a
 * user gesture - and the answer is remembered per browser. So the inbox states
 * the current state plainly and offers the one action that changes it:
 * `default` → ask, `granted` → done, `denied` → explain what the browser is
 * blocking and where to unblock it. Nothing here pretends to be a preference
 * toggle: it reports the browser's decision.
 */
export function SupportNotificationControl({ className }: { className?: string }) {
  const [support, setSupport] = useState<NotificationSupport>('unsupported');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setSupport(notificationSupport());
  }, []);

  if (support === 'unsupported') {
    return (
      <span className={className}>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <BellOff className="size-3.5" /> Desktop alerts unavailable in this browser
        </span>
      </span>
    );
  }

  if (support === 'granted') {
    return (
      <span className={className}>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <BellRing className="size-3.5" /> Desktop alerts on
        </span>
      </span>
    );
  }

  if (support === 'denied') {
    return (
      <span className={className}>
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <BellOff className="size-3.5" />
          Desktop alerts blocked - allow notifications for this site in Chrome settings
        </span>
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={requesting}
      onClick={async () => {
        setRequesting(true);
        setSupport(await requestNotificationPermission());
        setRequesting(false);
      }}
    >
      <BellRing className="size-3.5" />
      {requesting ? 'Asking…' : 'Enable desktop alerts'}
    </Button>
  );
}
