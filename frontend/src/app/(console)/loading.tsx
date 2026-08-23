export default function ConsoleLoading() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true" aria-label="Loading dashboard">
      {/* Header skeleton */}
      <div className="mb-8 flex items-end justify-between">
        <div className="space-y-2.5">
          <div className="rs-skeleton h-7 w-52 rounded-md" />
          <div className="rs-skeleton h-4 w-80 rounded" />
        </div>
        <div className="rs-skeleton h-9 w-36 rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5"
          >
            <div className="rs-skeleton mb-4 h-9 w-9 rounded-lg" />
            <div className="rs-skeleton mb-2 h-3 w-24 rounded" />
            <div className="rs-skeleton h-8 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Trial banner slot */}
      <div className="rs-skeleton mb-8 h-[104px] rounded-xl" />

      {/* Health table */}
      <div className="mb-3 flex items-center justify-between">
        <div className="rs-skeleton h-5 w-44 rounded" />
        <div className="rs-skeleton h-4 w-16 rounded" />
      </div>
      <div className="overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-4 py-4 ${
              i < 4 ? 'border-b border-rs-border-subtle' : ''
            }`}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <div className="rs-skeleton h-4 w-40 rounded" />
              <div className="rs-skeleton h-3 w-64 max-w-full rounded" />
            </div>
            <div className="rs-skeleton hidden h-6 w-16 rounded-full sm:block" />
            <div className="rs-skeleton hidden h-4 w-14 rounded sm:block md:block" />
            <div className="rs-skeleton hidden h-4 w-16 rounded lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
