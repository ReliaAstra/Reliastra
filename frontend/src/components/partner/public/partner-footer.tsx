'use client';

import Link from 'next/link';
import { Wordmark } from '@/components/site/wordmark';
import {
  EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  partnerRouteUrl,
  partnerUrl,
} from '@/lib/routes';

const footerSections: {
  heading: string;
  links: { label: string; href: string }[];
}[] = [
  {
    heading: 'Program',
    links: [
      { label: 'Overview', href: partnerUrl('home') },
      { label: 'How it works', href: partnerUrl('how-it-works') },
      { label: 'Commission', href: partnerUrl('commission') },
      { label: 'Earn', href: partnerUrl('earn') },
      { label: 'Resources', href: partnerUrl('resources') },
      { label: 'FAQ', href: partnerUrl('faq') },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Apply to the network', href: partnerUrl('signup') },
      { label: 'Partner sign in', href: partnerUrl('login') },
      { label: 'Reset password', href: partnerUrl('forgot-password') },
    ],
  },
  {
    heading: 'RELIASTRA',
    links: [
      { label: 'Main site', href: '/' },
      { label: 'Product', href: PUBLIC_ROUTES.product },
      { label: 'Pricing', href: PUBLIC_ROUTES.pricing },
      { label: 'Research', href: PUBLIC_ROUTES.research },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Partner privacy', href: partnerRouteUrl('privacy') },
      { label: 'Partner terms', href: partnerRouteUrl('terms') },
      { label: 'Privacy Policy', href: PUBLIC_ROUTES.privacy },
      { label: 'Terms of Service', href: PUBLIC_ROUTES.terms },
    ],
  },
];

/**
 * Partner network footer.
 *
 * Rebuilt to match the main site footer: hairline column rules, small
 * uppercase headings, no gradient divider, and a link set that connects the
 * partner surface back to the main site rather than dead-ending in it.
 *
 * Every href is built from `lib/routes`. The GitHub organization is the only
 * external profile linked, because it is the only one that exists.
 */
export function PartnerFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--ob-line)] bg-[var(--ob-void)]">
      <div className="ob-container py-16">
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
          <div className="flex flex-col gap-5">
            <Link
              href={partnerUrl('home')}
              aria-label="RELIASTRA Partner Network home"
              className="w-fit"
            >
              <Wordmark size="sm" />
            </Link>
            <p className="max-w-[38ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-4)]">
              A partnership programme for consultants, agencies and technology
              advisors. Refer the infrastructure teams you already advise and
              earn recurring commission on their subscriptions.
            </p>
          </div>

          {footerSections.map((section) => (
            <nav key={section.heading} aria-label={section.heading}>
              <h2 className="ob-label mb-4">{section.heading}</h2>
              <ul className="flex flex-col gap-2.5">
                {section.links.map((link) => (
                  <li key={`${section.heading}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-[13.5px] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-signal)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-[var(--ob-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="ob-mono text-[var(--ob-text-4)]">
            © {new Date().getFullYear()} Reliastra, Inc.
          </p>
          <a
            href={EXTERNAL_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="ob-label text-[var(--ob-text-4)] transition-colors hover:text-[var(--ob-signal)]"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
