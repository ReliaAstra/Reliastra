'use client';

/**
 * The quote is a single round trip, so the skeleton mirrors the finished layout
 * rather than showing a spinner: the page keeps its shape and the customer can
 * read the heading and the method copy while the figures resolve.
 *
 * Placeholders are bars, never numbers. A shimmer that renders `₦—` or a
 * guessed amount would be the exact thing this checkout forbids: a figure on
 * screen that the backend did not publish.
 */
export function CheckoutSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_384px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]"
      role="status"
      aria-live="polite"
      aria-label="Loading your checkout"
      data-testid="checkout-loading"
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-5 sm:p-6">
          <div className="h-2.5 w-20 animate-pulse rounded bg-rs-border-subtle" />
          <div className="mt-3 h-6 w-48 animate-pulse rounded bg-rs-border-subtle" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-xl bg-rs-base" />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-5 sm:p-6">
          <div className="h-2.5 w-40 animate-pulse rounded bg-rs-border-subtle" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-rs-border-subtle" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-rs-border-subtle" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="h-[72px] animate-pulse rounded-xl bg-rs-base" />
        <div className="mt-4 h-[168px] animate-pulse rounded-xl bg-rs-base" />
        <div className="mt-4 h-12 animate-pulse rounded-xl bg-rs-base" />
      </div>
      <span className="sr-only">Loading your checkout</span>
    </div>
  );
}
