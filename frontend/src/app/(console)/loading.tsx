export default function ConsoleLoading() {
  return (
    <div aria-busy="true" aria-label="Retrieving observations">
      <div className="border-b border-rs-border-subtle py-6">
        <div className="rs-skeleton h-6 w-52" />
        <div className="mt-4 flex flex-wrap gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rs-skeleton h-3 w-32" />
          ))}
        </div>
      </div>

      <div className="rs-section-spacing">
        <div className="flex items-center justify-between border-b border-rs-border-subtle pb-3">
          <div className="rs-skeleton h-4 w-40" />
        </div>
        <div className="rs-card overflow-hidden p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-6 border-b border-rs-border-subtle px-4 py-3 last:border-b-0"
            >
              <div className="rs-skeleton h-3 flex-1" />
              <div className="rs-skeleton hidden h-3 w-24 sm:block" />
              <div className="rs-skeleton hidden h-3 w-20 md:block" />
              <div className="rs-skeleton hidden h-3 w-16 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
