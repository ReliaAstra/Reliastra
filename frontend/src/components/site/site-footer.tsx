import Link from 'next/link';
import { FOOTER_GROUPS, SOCIAL_LINKS } from './nav-config';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Global footer.
 *
 * Dark, minimal, typographic: the full site map in small columns, contact
 * and legal beneath one oversized wordmark. Server component, generated
 * entirely from `nav-config` (which in turn only references `lib/routes`),
 * so there is nowhere to author a placeholder link.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--ob-line)] bg-[var(--ob-void)]">
      <div className="ob-container pt-16 md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,300px)_1fr] lg:gap-16">
          {/* Identity */}
          <div className="flex flex-col gap-6">
            <p className="max-w-[34ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
              External dependency intelligence: independent observation of the
              third-party services your infrastructure runs on, with evidence
              a third party can verify.
            </p>
            <dl className="flex flex-col gap-3 pt-2">
              <div className="flex gap-3">
                <dt className="ob-label w-16 shrink-0 pt-[3px]">Support</dt>
                <dd className="text-[13px]">
                  <a className="ob-link" href="mailto:support@reliastra.com">
                    support@reliastra.com
                  </a>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="ob-label w-16 shrink-0 pt-[3px]">Security</dt>
                <dd className="text-[13px]">
                  <a className="ob-link" href="mailto:security@reliastra.com">
                    security@reliastra.com
                  </a>
                </dd>
              </div>
            </dl>
            <p className="flex flex-wrap gap-x-5 gap-y-1 pt-2 text-[13px]">
              <Link className="ob-link" href={AUTH_ROUTES.signup}>
                Start monitoring
              </Link>
              <Link className="ob-link" href={AUTH_ROUTES.login}>
                Sign in
              </Link>
            </p>
          </div>

          {/* Site map */}
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 xl:grid-cols-5"
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

        {/* The oversized sign-off: one light wordmark, no other art. */}
        <div className="mt-16 border-t border-[var(--ob-line)] pt-10 md:mt-20 md:pt-12">
          <Link
            href={PUBLIC_ROUTES.home}
            aria-label="RELIASTRA home"
            className="block select-none leading-none"
          >
            <span
              aria-hidden
              className="block whitespace-nowrap font-semibold uppercase tracking-[-0.015em] text-[var(--ob-text)]"
              style={{ fontSize: 'clamp(2.6rem, 9.2vw, 8.5rem)', lineHeight: 0.95 }}
            >
              Reliastra
            </span>
          </Link>
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-[var(--ob-line)] py-8 md:flex-row md:items-center md:justify-between">
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
