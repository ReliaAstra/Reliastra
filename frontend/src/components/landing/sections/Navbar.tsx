'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, ArrowRight, Activity, ChevronDown } from 'lucide-react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/landing/shared/BrandLogo';
import { ThemeToggle } from '@/components/partner/shared/theme-toggle';
import { goTo, scrollToId } from '@/components/landing/theme';

export type NavChild = { label: string; href: string; description?: string };
export type NavEntry =
  | { label: string; href: string }
  | { label: string; children: NavChild[] };

/**
 * Primary navigation - the sitelinks-candidate hierarchy in markup.
 *
 * Product → the category pillar and its capabilities; Resources → docs and
 * proof; Company → trust surfaces; plus Pricing and live vendor tracking.
 * Every entry is a real link (crawlable without JavaScript); dropdowns open
 * on hover AND focus/click so keyboard and touch users get the same map.
 * Labels name their destinations - no "Explore / Solutions / Platform".
 */
export const NAV: NavEntry[] = [  {
    label: 'Product',
    children: [
      { label: 'Overview', href: '/product', description: 'How the platform fits together' },
      { label: 'External Dependency Intelligence', href: '/external-dependency-intelligence', description: 'The category RELIASTRA defines' },
      { label: 'Dependency Monitoring', href: '/dependency-monitoring', description: 'Multi-region checks with quorum verdicts' },
      { label: 'SLA Evidence', href: '/sla-evidence', description: 'Timestamped, checksummed fault reports' },
      { label: 'Incident Evidence', href: '/incident-evidence', description: 'Was it you, or your vendors?' },
      { label: 'Vendor Tracking', href: '/track', description: 'Independent status for public vendors' },
    ],
  },
  {
    label: 'Resources',
    children: [
      { label: 'Documentation', href: '/docs', description: 'Quickstart, monitoring, evidence, API' },
      { label: 'Research', href: '/research', description: 'Methodology, published in public' },
      { label: 'Glossary', href: '/glossary', description: 'Every core concept, defined once' },
      { label: 'Status', href: '/status', description: 'Platform health' },
    ],
  },
  {
    label: 'Company',
    children: [
      { label: 'About', href: '/about', description: 'Why RELIASTRA exists' },
      { label: 'Contact', href: '/contact', description: 'Support, sales, security' },
      { label: 'Security', href: '/security', description: 'How your data is protected' },
    ],
  },
  { label: 'Pricing', href: '/pricing' },
];

function NavDropdown({ entry }: { entry: Extract<NavEntry, { children: NavChild[] }> }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="group relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
      >
        {entry.label}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {/* Always rendered (never conditionally mounted): the links exist in
          the SSR HTML for crawlers and no-JS clients. Tabbing into the panel
          triggers focus-within, which reveals it - no tabindex games needed. */}
      <nav
        aria-label={`${entry.label} submenu`}
        className={cn(
          'absolute left-1/2 top-full z-50 w-80 -translate-x-1/2 pt-2 transition-all duration-150',
          open
            ? 'visible translate-y-0 opacity-100'
            : 'invisible translate-y-1 opacity-0 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100'
        )}
      >
        <div className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-xl dark:border-white/10 dark:bg-[#131318]">
          {entry.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className="block px-4 py-3 transition-colors hover:bg-[#F8F9FA] dark:hover:bg-white/5"
            >
              <span className="block text-sm font-medium text-[#09090B] dark:text-white">
                {child.label}
              </span>
              {child.description && (
                <span className="mt-0.5 block text-xs text-[#71717A] dark:text-[#71717A]">
                  {child.description}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex h-[72px] items-center transition-all duration-300',
        scrolled
          ? 'border-b border-[#E4E4E7]/70 bg-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0A0A0F]/80'
          : 'bg-white/0 dark:bg-transparent'
      )}
    >
      <nav className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 md:px-12" aria-label="Primary">
        {/* Wordmark */}
        <button
          onClick={() => scrollToId('top')}
          className="flex items-center gap-0 transition-opacity hover:opacity-80"
          aria-label="Reliastra home"
        >
          <BrandLogo className="text-[#09090B] dark:text-white" size="lg" />
        </button>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-2 md:flex">
          {NAV.map((entry) =>
            'children' in entry ? (
              <NavDropdown key={entry.label} entry={entry} />
            ) : (
              <Link
                key={entry.label}
                href={entry.href}
                className="px-3 py-2 text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
              >
                {entry.label}
              </Link>
            )
          )}
          <Link
            href="/track"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
          >
            <Activity className="h-3.5 w-3.5" />
            Track
          </Link>
        </div>

        {/* Right Side */}
        <div className="hidden items-center gap-5 md:flex">
          <ThemeToggle className="mr-1" />
          <button
            onClick={() => goTo('login')}
            className="text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
          >
            Sign In
          </button>
          <motion.button
            onClick={() => goTo('signup')}
            className="rounded-[10px] bg-[#0A0A0F] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1A1A2F] dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            Start Free
          </motion.button>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="rounded-lg p-2 transition-colors hover:bg-[#F8F9FA] dark:hover:bg-white/5"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 text-[#09090B] dark:text-white" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[300px] overflow-y-auto border-[#E4E4E7] bg-white p-6 dark:border-white/10 dark:bg-[#0A0A0F]"
            >
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="mt-8 space-y-5">
                {NAV.map((entry) =>
                  'children' in entry ? (
                    <div key={entry.label}>
                      <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#71717A]">
                        {entry.label}
                      </p>
                      {entry.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#52525B] transition-colors hover:bg-[#F8F9FA] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link
                      key={entry.label}
                      href={entry.href}
                      onClick={() => setMobileOpen(false)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#52525B] transition-colors hover:bg-[#F8F9FA] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-white/5 dark:hover:text-white"
                    >
                      {entry.label}
                    </Link>
                  )
                )}
                <Link
                  href="/track"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#52525B] transition-colors hover:bg-[#F8F9FA] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-white/5 dark:hover:text-white"
                >
                  Track vendors
                </Link>
              </div>
              <div className="mt-6 space-y-3 border-t border-[#E4E4E7] pt-6 dark:border-white/10">
                <ThemeToggle />
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    goTo('login');
                  }}
                  className="block w-full rounded-[10px] px-3 py-3 text-left text-sm font-medium text-[#52525B] transition-colors hover:bg-[#F8F9FA] dark:text-[#A1A1AA] dark:hover:bg-white/5"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    goTo('signup');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#0A0A0F] px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-[#0A0A0F]"
                >
                  Start Free
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
