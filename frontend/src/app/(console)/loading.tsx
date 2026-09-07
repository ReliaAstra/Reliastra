/**
 * Route-level loading state.
 *
 * A restrained telemetry-retrieval skeleton: the shape of a page head and a
 * table of rows, in the console's own hairline geometry. No spinner, no
 * pulsing cards, nothing that suggests a metric exists before one has been
 * read.
 */
export default function ConsoleLoading() {
  return (
    <div aria-busy="true" aria-label="Retrieving observations">
      <div className="border-b border-[var(--obc-line-2)] py-6">
        <div className="obc-skel h-6 w-52" />
        <div className="mt-4 flex flex-wrap gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="obc-skel h-3 w-32" />
          ))}
        </div>
      </div>

      <div className="obc-section">
        <div className="obc-section-head">
          <div className="obc-skel h-4 w-40" />
        </div>
        <div className="border border-[var(--obc-line)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-6 border-b border-[var(--obc-line)] px-3.5 py-3 last:border-b-0"
            >
              <div className="obc-skel h-3 flex-1" />
              <div className="obc-skel hidden h-3 w-24 sm:block" />
              <div className="obc-skel hidden h-3 w-20 md:block" />
              <div className="obc-skel hidden h-3 w-16 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
