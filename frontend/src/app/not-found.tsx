import Link from 'next/link';
import { SiteShell } from '@/components/site/site-shell';
import { Container } from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

export const metadata = {
  title: 'Signal lost - 404',
  robots: { index: false, follow: true },
};

/**
 * 404.
 *
 * An infrastructure company's error page should read like an infrastructure
 * error: a status code, an accurate statement of what happened, and a route
 * back. No apology, no emoji, no illustration.
 *
 * Two things the previous version got wrong are fixed here:
 * - Its primary CTA pointed at `/dashboard`, a protected route. An anonymous
 *   visitor who hit a bad link was sent to a login redirect. The primary
 *   action is now the public homepage.
 * - It rendered with no header and no footer, so a lost visitor had no
 *   navigation at all. It now renders inside the standard site shell.
 *
 * The copy is also technically honest: a 404 from the web tier says nothing
 * about the state of the measurement network, and the page says exactly that
 * rather than claiming everything is "operational".
 */
export default function RootNotFound() {
  return (
    <SiteShell>
      <Container className="flex min-h-[62vh] flex-col justify-center py-20">
        <div className="max-w-[62ch]">
          <p
            className="ob-mono text-[13px] text-[var(--ob-signal)]"
            aria-hidden
          >
            HTTP 404
          </p>

          <h1 className="ob-display mt-5">
            Signal
            <br />
            lost.
          </h1>

          <p className="ob-lede mt-8">
            The requested resource could not be located. The link may be
            outdated, the path may have been renamed, or the address may
            contain a typo.
          </p>

          <p className="ob-body mt-4 max-w-[58ch]">
            This response comes from the web tier only. It carries no
            information about the state of the measurement network or of any
            monitored dependency.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className="ob-btn ob-btn-signal">
              Return to RELIASTRA
            </Link>
            <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-outline">
              Public dependency index
            </Link>
          </div>

          <nav
            aria-label="Common destinations"
            className="mt-14 border-t border-[var(--ob-line)] pt-7"
          >
            <p className="ob-label mb-4">Common destinations</p>
            <ul className="grid gap-x-12 gap-y-2.5 sm:grid-cols-2">
              {[
                [PUBLIC_ROUTES.product, 'Product'],
                [PUBLIC_ROUTES.pricing, 'Pricing'],
                [PUBLIC_ROUTES.research, 'Research'],
                [PUBLIC_ROUTES.docs, 'Documentation'],
                [PUBLIC_ROUTES.contact, 'Contact'],
                [AUTH_ROUTES.login, 'Sign in'],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-[14.5px] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-signal)]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </SiteShell>
  );
}
