import { cn } from '@/lib/utils';

export function RsSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-rs-hover', className)}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
      <div className="h-11 border-b border-rs-border-subtle bg-rs-elevated" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex h-14 items-center gap-4 border-b border-rs-border-subtle px-4 last:border-0"
        >
          <RsSkeleton className="h-4 w-40" />
          <RsSkeleton className="ml-auto h-4 w-20" />
          <RsSkeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
      <RsSkeleton className="mb-4 h-9 w-9 rounded-lg" />
      <RsSkeleton className="mb-2 h-3 w-24" />
      <RsSkeleton className="h-8 w-20" />
    </div>
  );
}
