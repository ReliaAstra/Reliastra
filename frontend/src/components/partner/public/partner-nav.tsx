'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';
import { navigatePartner } from '@/components/partner/public/navigation';
import { Wordmark } from '@/components/site/wordmark';
import { partnerUrl } from '@/lib/routes';

const navLinks: { label: string; page: PartnerPage; href: string }[] = [
  { label: 'Overview', page: 'home', href: partnerUrl('home') },
  { label: 'How it works', page: 'how-it-works', href: partnerUrl('how-it-works') },
  { label: 'Commission', page: 'commission', href: partnerUrl('commission') },
  { label: 'Earn', page: 'earn', href: partnerUrl('earn') },
  { label: 'Tiers', page: 'tiers', href: partnerUrl('tiers') },
  { label: 'Premium', page: 'premium', href: partnerUrl('premium') },
  { label: 'FAQ', page: 'faq', href: partnerUrl('faq') },
];

/**
 * Partner network navigation.
 *
 * Structurally identical to the main site header so the partner surface reads
 * as the same company: the same wordmark, the same 64/76px bar, the same
 * hairline underline for the current page, one accent CTA.
 *
 * Preserved behaviours:
 * - Every destination is a real `/partner/*` URL (crawlable, shareable,
 *   refresh-safe). `activePage` lets file-routed pages mark the active link
 *   before the store syncs; the `/` shell omits it and stays store-driven.
 * - `support` is dual-mode, so it keeps runtime navigation rather than a link.
 *
 * Removed:
 * - The theme toggle. The public surface is dark-only; offering a light mode
 *   that the rest of the public site does not honour was an inconsistency,
 *   not a feature.
 * - The ⌘K search trigger, which duplicated the CommandPalette's own global
 *   shortcut while adding a control most visitors could not interpret.
 */
export function PartnerNav({ activePage }: { activePage?: PartnerPage } = {}) {
  const storePage = usePartnerStore((s) => s.currentPage);
  const currentPage = activePage ?? storePage;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock the page behind the open mobile sheet.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleSupport = () => {
    setMobileOpen(false);
    navigatePartner('support');
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b transition-colors duration-300',
        scrolled
          ? 'border-[var(--ob-line)] bg-[var(--ob-void)]/95 supports-[backdrop-filter]:bg-[var(--ob-void)]/80 supports-[backdrop-filter]:backdrop-blur-md'
          : 'border-transparent bg-[var(--ob-void)]'
      )}
    >
      <nav
        aria-label="Partner network"
        className="ob-container flex h-16 items-center justify-between gap-8"
      >
        <Link
          href={partnerUrl('home')}
          className="flex shrink-0 items-center gap-2.5"
          aria-label="RELIASTRA Partner Network home"
        >
          <Wordmark size="sm" />
          <span className="ob-label hidden border-l border-[var(--ob-line-2)] pl-2.5 text-[var(--ob-text-4)] sm:inline">
            Partners
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-7 xl:flex">
          {navLinks.map((link) => {
            const isActive = currentPage === link.page;
            return (
              <li key={link.page}>
                <Link
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative py-2 text-[13.5px] transition-colors',
                    isActive
                      ? 'text-[var(--ob-text)]'
                      : 'text-[var(--ob-text-3)] hover:text-[var(--ob-text)]'
                  )}
                >
                  {link.label}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -bottom-[13px] h-px bg-[var(--ob-signal)]"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop actions */}
        <div className="hidden shrink-0 items-center gap-5 xl:flex">
          <Link
            href="/"
            className="text-[13px] text-[var(--ob-text-4)] transition-colors hover:text-[var(--ob-text-2)]"
          >
            ← Main site
          </Link>
          <button
            type="button"
            onClick={handleSupport}
            className="text-[13.5px] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)]"
          >
            Support
          </button>
          <Link
            href={partnerUrl('login')}
            className="text-[13.5px] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)]"
          >
            Sign in
          </Link>
          <Link href={partnerUrl('signup')} className="ob-btn ob-btn-signal ob-btn-sm">
            Apply now
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="partner-mobile-nav"
          className="ob-label -mr-2 px-2 py-3 text-[var(--ob-text-2)] xl:hidden"
        >
          {mobileOpen ? 'Close' : 'Menu'}
        </button>
      </nav>

      {/* Mobile sheet — a full-height panel, not a cramped dropdown */}
      {mobileOpen && (
        <div
          id="partner-mobile-nav"
          className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t border-[var(--ob-line)] bg-[var(--ob-void)] xl:hidden"
        >
          <div className="ob-container flex flex-col py-8">
            <p className="ob-label mb-2">Program</p>
            <ul className="flex flex-col">
              {navLinks.map((link) => (
                <li key={link.page}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={currentPage === link.page ? 'page' : undefined}
                    className={cn(
                      'block border-t border-[var(--ob-line)] py-4 text-[17px] tracking-[-0.01em] transition-colors',
                      currentPage === link.page
                        ? 'text-[var(--ob-signal)]'
                        : 'text-[var(--ob-text-2)]'
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3">
              <Link
                href={partnerUrl('signup')}
                onClick={() => setMobileOpen(false)}
                className="ob-btn ob-btn-signal ob-btn-block"
              >
                Apply now
              </Link>
              <Link
                href={partnerUrl('login')}
                onClick={() => setMobileOpen(false)}
                className="ob-btn ob-btn-outline ob-btn-block"
              >
                Partner sign in
              </Link>
              <button
                type="button"
                onClick={handleSupport}
                className="ob-btn ob-btn-outline ob-btn-block"
              >
                Contact support
              </button>
            </div>

            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="ob-label mt-8 border-t border-[var(--ob-line)] pt-6 text-[var(--ob-text-4)]"
            >
              ← Back to the main site
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
