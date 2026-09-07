import Link from 'next/link';

export default function ConsoleNotFound() {
  return (
    <div className="obc-section">
      <div className="max-w-2xl border border-[var(--obc-line)] bg-[var(--obc-base)] px-6 py-10">
        <p className="obc-label text-[var(--obc-text-3)]">Record not found</p>
        <p className="obc-body mt-3">
          This screen does not exist, or the record it points at has been removed or has passed the
          retention window for your plan. Evidence records that have expired cannot be recovered.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard" className="obc-btn obc-btn-primary">
            Overview
          </Link>
          <Link href="/incidents" className="obc-btn">
            Incidents
          </Link>
          <Link href="/evidence" className="obc-btn">
            Evidence records
          </Link>
        </div>
      </div>
    </div>
  );
}
