import Link from 'next/link';

export default function ConsoleNotFound() {
  return (
    <div className="rs-section-spacing">
      <div className="rs-card max-w-2xl px-6 py-10">
        <p className="rs-label">Record not found</p>
        <p className="rs-body mt-3 text-rs-text-secondary">
          This screen does not exist, or the record it points at has been removed or has passed the
          retention window for your plan. Evidence records that have expired cannot be recovered.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard" className="rs-button rs-button-primary rs-button-sm">
            Overview
          </Link>
          <Link href="/incidents" className="rs-button rs-button-secondary rs-button-sm">
            Incidents
          </Link>
          <Link href="/evidence" className="rs-button rs-button-secondary rs-button-sm">
            Evidence records
          </Link>
        </div>
      </div>
    </div>
  );
}
