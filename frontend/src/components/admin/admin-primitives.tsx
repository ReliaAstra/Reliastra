'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ADMIN_PERIODS,
  formatCompactNumber,
  formatPercent,
  healthTone,
  humanize,
} from '@/lib/admin-utils';
import type { AdminPeriod, HealthStatus } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function useAdminPeriod(): AdminPeriod {
  const params = useSearchParams();
  const value = params.get('range');
  return value === '7d' || value === '30d' || value === '90d' || value === '365d' ? value : '30d';
}

export function DateRangeControl({ className }: { className?: string }) {
  const period = useAdminPeriod();
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  const setPeriod = (value: AdminPeriod) => {
    const next = new URLSearchParams(params.toString());
    next.set('range', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-card',
        className
      )}
      aria-label="Analytics date range"
    >
      {ADMIN_PERIODS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={period === option.value}
          onClick={() => setPeriod(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
            period === option.value
              ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function AdminCard({
  className,
  children,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.02)] dark:border-white/10 dark:bg-card',
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 py-4 sm:px-6', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  trend,
  context,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  trend?: number | null;
  context?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'attention';
}) {
  const positive = (trend ?? 0) >= 0;
  return (
    <AdminCard className={cn('min-h-[146px] p-5 sm:p-5', tone === 'attention' && 'border-amber-200 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
            <Icon className="size-3.5" strokeWidth={1.8} />
          </span>
        )}
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums dark:text-white sm:text-[28px]">
        {value}
      </p>
      <div className="mt-3 flex min-h-4 items-center gap-1.5 text-xs">
        {trend !== undefined && trend !== null && (
          <span className={cn('inline-flex items-center font-medium tabular-nums', positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
            {positive ? <ArrowUpRight className="mr-0.5 size-3" /> : <ArrowDownRight className="mr-0.5 size-3" />}
            {formatPercent(trend, { sign: true })}
          </span>
        )}
        {context && <span className="text-slate-500 dark:text-slate-400">{context}</span>}
      </div>
    </AdminCard>
  );
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status?: HealthStatus;
  label?: string;
  className?: string;
}) {
  const tone = healthTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
        tone === 'healthy' && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
        tone === 'critical' && 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
        tone === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
        className
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'healthy' && 'bg-emerald-500',
          tone === 'warning' && 'bg-amber-500',
          tone === 'critical' && 'bg-rose-500',
          tone === 'neutral' && 'bg-slate-400'
        )}
      />
      {label || humanize(status)}
    </span>
  );
}

export function HealthDot({ status }: { status?: HealthStatus }) {
  const tone = healthTone(status);
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full ring-4',
        tone === 'healthy' && 'bg-emerald-500 ring-emerald-500/10',
        tone === 'warning' && 'bg-amber-500 ring-amber-500/10',
        tone === 'critical' && 'bg-rose-500 ring-rose-500/10',
        tone === 'neutral' && 'bg-slate-400 ring-slate-400/10'
      )}
      aria-hidden="true"
    />
  );
}

export function SectionFailure({
  title = 'Data unavailable.',
  description = 'This section could not be loaded. The rest of the dashboard is still available.',
  onRetry,
  compact = false,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-3 text-left', compact ? 'p-4' : 'p-6')} role="status">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
        <AlertCircle className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 h-8 gap-1.5 text-xs">
            <RefreshCw className="size-3" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function SectionSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-5 sm:p-6', className)} aria-label="Loading section" aria-busy="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-4', index === 0 ? 'w-2/5' : index === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  icon: Icon = CircleAlert,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-white/10 sm:px-6">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {formatCompactNumber(total)} total · page {page} of {pages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ImpactDialog({
  open,
  onOpenChange,
  title,
  description,
  what,
  why,
  impact,
  confirmLabel,
  onConfirm,
  destructive = false,
  reasonRequired = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  what: ReactNode;
  why: ReactNode;
  impact: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<unknown> | void;
  destructive?: boolean;
  reasonRequired?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason('');
      setSubmitting(false);
    }
  }, [open]);

  const submit = async () => {
    if (reasonRequired && reason.trim().length < 3) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xl border-slate-200 dark:border-white/10">
        <AlertDialogHeader>
          <AlertDialogTitle className="tracking-[-0.02em]">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <dl className="overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-white/10">
          <div className="grid gap-1 border-b border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-[74px_1fr]">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">What</dt>
            <dd className="text-slate-800 dark:text-slate-100">{what}</dd>
          </div>
          <div className="grid gap-1 border-b border-slate-200 px-3 py-3 dark:border-white/10 sm:grid-cols-[74px_1fr]">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Why</dt>
            <dd className="text-slate-600 dark:text-slate-300">{why}</dd>
          </div>
          <div className="grid gap-1 bg-slate-50/70 px-3 py-3 dark:bg-white/[0.03] sm:grid-cols-[74px_1fr]">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Impact</dt>
            <dd className="text-slate-600 dark:text-slate-300">{impact}</dd>
          </div>
        </dl>
        {reasonRequired && (
          <div className="space-y-2">
            <label htmlFor="admin-action-reason" className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Reason <span className="text-rose-600">required</span>
            </label>
            <Input
              id="admin-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Document why this action is necessary"
              autoFocus
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={submitting || (reasonRequired && reason.trim().length < 3)}
            onClick={submit}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
