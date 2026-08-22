'use client';

import { cn } from '@/lib/utils';

/**
 * Statuses the badge styles explicitly. Support-ticket states are included
 * alongside the money states so conversations can reuse the same badge, and
 * an unknown status simply falls back to the neutral "pending" styling.
 */
export type KnownStatus =
  | 'active'
  | 'pending'
  | 'cancelled'
  | 'paid'
  | 'payable'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'resolved'
  | 'closed';

interface StatusBadgeProps {
  /** Any server status string; unknown values render with neutral styling. */
  status: KnownStatus | (string & {});
  className?: string;
}

const statusConfig: Record<KnownStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  pending: { label: 'Pending', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700' },
  paid: { label: 'Paid', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  payable: { label: 'Payable', className: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  processing: { label: 'Processing', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  completed: { label: 'Completed', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  failed: { label: 'Failed', className: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' },
  open: { label: 'Open', className: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  in_progress: { label: 'In progress', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  waiting_on_customer: { label: 'Awaiting you', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  resolved: { label: 'Resolved', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  closed: { label: 'Closed', className: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status as KnownStatus] || statusConfig.pending;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
