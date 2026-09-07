import Link from 'next/link';
import { ObservatoryShell } from '@/components/observatory/primitives';
import { PUBLIC_ROUTES } from '@/lib/routes';

export const metadata = {
  title: 'No such dependency record - RELIASTRA observatory',
  robots: { index: false, follow: true },
};

/**
 * A vendor that is not in the public catalog. This is a different fact from
 * "the measurement network is unreachable", and the two must never share a
 * page: one means we have no record, the other means we cannot read the one we
 * have.
 */
export default function VendorNotFound() {
  return (
    <ObservatoryShell>
      <div className="ob-container py-20 md:py-28">
        <p className="ob-label obs-label-signal">HTTP 404</p>
        <h1 className="ob-h1 mt-5 max-w-[22ch]">
          RELIASTRA does not publish a record for this dependency.
        </h1>
        <p className="ob-lede mt-6 max-w-[62ch]">
          Either the identifier does not match a tracked dependency, or the record is not public. No
          approximate match is shown, because a reliability record for the wrong service is worse
          than none.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-signal">
            Browse tracked dependencies
          </Link>
          <Link href={PUBLIC_ROUTES.contact} className="ob-btn ob-btn-outline">
            Request a dependency
          </Link>
        </div>
      </div>
    </ObservatoryShell>
  );
}
