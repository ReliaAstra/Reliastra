import { cn } from '@/lib/utils';

export function RsSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        // Spec: skeleton fill --rs-hover, shaped like content, shimmer via ::after
        'rs-skeleton rounded-lg bg-rs-hover',
        className
      )}
      aria-hidden
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
      <div className="flex h-11 items-center border-b border-rs-border-subtle bg-rs-elevated px-4">
        <RsSkeleton className="h-3 w-20" />
      </div>
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
