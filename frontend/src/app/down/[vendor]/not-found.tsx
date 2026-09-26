import Link from 'next/link';
import { ObservatoryShell } from '@/components/observatory/primitives';
import { PUBLIC_ROUTES } from '@/lib/routes';

export const metadata = {
  title: 'No such question - RELIASTRA observatory',
  robots: { index: false, follow: true },
};

/**
 * A slug the public catalog does not name.
 *
 * Deliberately a different page from "the measurement network is
 * unreachable": one means RELIASTRA has no record to answer from, the other
 * means the record could not be read. No nearest-match is offered, because
 * a reliability answer about the wrong service is worse than none.
 */
export default function QuestionNotFound() {
  return (
    <ObservatoryShell>
      <div className="ob-container py-20 md:py-28">
        <p className="ob-label obs-label-signal">HTTP 404</p>
        <h1 className="ob-h1 mt-5 max-w-[26ch]">
          RELIASTRA does not measure a dependency at this address, so there is no answer here.
        </h1>
        <p className="ob-lede mt-6 max-w-[62ch]">
          Direct answers exist only for dependencies RELIASTRA probes and publishes records for.
          An approximate answer about a different service would be worse than none.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-signal">
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
