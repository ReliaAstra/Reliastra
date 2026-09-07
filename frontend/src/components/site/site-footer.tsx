import Link from 'next/link';
import { Wordmark } from './wordmark';
import { FOOTER_GROUPS, SOCIAL_LINKS } from './nav-config';
import { AUTH_ROUTES, PUBLIC_ROUTES, partnerUrl } from '@/lib/routes';

/**
 * Global footer.
 *
 * This is the complete public site map, and it is generated entirely from
 * `nav-config` (which in turn only references `lib/routes`). There is no way
 * to author a `#` link, a placeholder, or a slug that does not resolve.
 *
 * Server component: the footer is the same on every page and should never
 * cost a hydration pass.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--ob-line)] bg-[var(--ob-void)]">
      <div className="ob-container py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-16">
          {/* Identity */}
          <div className="flex flex-col gap-6">
            <Link href={PUBLIC_ROUTES.home} aria-label="RELIASTRA home">
              <Wordmark size="lg" />
            </Link>
            <p className="max-w-[34ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
              External Dependency Intelligence. RELIASTRA observes the third-party
              infrastructure your business runs on, attributes failures to the
              service responsible, and produces evidence that holds up outside
              your own logs.
            </p>
            <dl className="flex flex-col gap-3 pt-2">
              <div className="flex gap-3">
                <dt className="ob-label w-16 shrink-0 pt-[3px]">Support</dt>
                <dd className="text-[13px]">
                  <a
                    className="ob-link"
                    href="mailto:support@reliastra.com"
                  >
                    support@reliastra.com
                  </a>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="ob-label w-16 shrink-0 pt-[3px]">Sales</dt>
                <dd className="text-[13px]">
                  <a className="ob-link" href="mailto:sales@reliastra.com">
                    sales@reliastra.com
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          {/* Site map */}
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 xl:grid-cols-6"
          >
            {FOOTER_GROUPS.map((group) => (
              <div key={group.label}>
                <h2 className="ob-label mb-5">{group.label}</h2>
                <ul className="flex flex-col gap-3">
                  {group.links.map((link) => (
                    <li key={`${group.label}-${link.href}-${link.label}`}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] leading-snug text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)]"
                        >
                          {link.label}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-[13px] leading-snug text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)]"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Account entry points, stated explicitly. A visitor should never
            have to guess whether they are creating a customer account or a
            partner account. */}
        <div className="mt-16 grid gap-px border-t border-[var(--ob-line)] pt-10 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:pr-10">
            <p className="ob-label">Customer</p>
            <p className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
              Monitor your own dependencies and generate evidence for your
              organization.
            </p>
            <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <Link className="ob-link" href={AUTH_ROUTES.signup}>
                Create an organization
              </Link>
              <Link className="ob-link" href={AUTH_ROUTES.login}>
                Customer sign in
              </Link>
            </p>
          </div>
          <div className="flex flex-col gap-2 border-t border-[var(--ob-line)] pt-8 sm:border-l sm:border-t-0 sm:pl-10 sm:pt-0">
            <p className="ob-label">Partner</p>
            <p className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
              Consultancies, agencies and MSPs bringing RELIASTRA to the
              organizations they operate for.
            </p>
            <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <Link className="ob-link" href={partnerUrl('signup')}>
                Apply to the partner program
              </Link>
              <Link className="ob-link" href={partnerUrl('login')}>
                Partner sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-[var(--ob-line)] pt-8 md:flex-row md:items-center md:justify-between">
          <p className="ob-label normal-case tracking-[0.05em]">
            © {year} Reliastra, Inc. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href={PUBLIC_ROUTES.status}
              className="ob-label transition-colors hover:text-[var(--ob-text-2)]"
            >
              Platform status
            </Link>
            <Link
              href={PUBLIC_ROUTES.privacy}
              className="ob-label transition-colors hover:text-[var(--ob-text-2)]"
            >
              Privacy
            </Link>
            <Link
              href={PUBLIC_ROUTES.terms}
              className="ob-label transition-colors hover:text-[var(--ob-text-2)]"
            >
              Terms
            </Link>
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ob-label transition-colors hover:text-[var(--ob-text-2)]"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
