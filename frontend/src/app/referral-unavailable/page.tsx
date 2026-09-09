import Link from 'next/link';
import { SiteShell } from '@/components/site/site-shell';
import { Container } from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

export const metadata = {
  title: 'Referral link unavailable',
  robots: { index: false, follow: true, noarchive: true },
};

/**
 * Shown when `/r/{code}` cannot be attributed: unknown, inactive, or
 * malformed. Deliberately NOT the generic 404 — a mistyped partner link
 * must not look like the rest of the site is missing.
 */
export default function ReferralUnavailablePage() {
  return (
    <SiteShell>
      <Container className="flex min-h-[62vh] flex-col justify-center py-20">
        <div className="max-w-[62ch]">
          <p className="ob-mono text-[13px] text-[var(--ob-signal)]" aria-hidden>
            Referral
          </p>

          <h1 className="ob-display mt-5">
            This referral
            <br />
            link is not active.
          </h1>

          <p className="ob-lede mt-8">
            The code in this address could not be attributed to a RELIASTRA
            partner. It may be mistyped, the partner account may no longer
            be in the program, or the link may have been deactivated.
          </p>

          <p className="ob-body mt-4 max-w-[58ch]">
            You can continue to RELIASTRA without a referral. Creating an
            organization does not require a partner link.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href={PUBLIC_ROUTES.home} className="ob-btn ob-btn-signal">
              Return to RELIASTRA
            </Link>
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-outline">
              Create an organization
            </Link>
          </div>
        </div>
      </Container>
    </SiteShell>
  );
}
