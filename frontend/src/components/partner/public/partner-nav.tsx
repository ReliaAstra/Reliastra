'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';
import { navigatePartner } from '@/components/landing/theme';
import { ReliastraLogo } from '../shared/reliastra-logo';
import { ThemeToggle } from '../shared/theme-toggle';

const navLinks: { label: string; page: PartnerPage; href: string }[] = [
  { label: 'Overview', page: 'home', href: '/partner' },
  { label: 'How It Works', page: 'how-it-works', href: '/partner/how-it-works' },
  { label: 'Commission', page: 'commission', href: '/partner/commission' },
  { label: 'Earn', page: 'earn', href: '/partner/earn' },
  { label: 'FAQ', page: 'faq', href: '/partner/faq' },
  { label: 'Tiers', page: 'tiers', href: '/partner/tiers' },
  { label: 'Premium', page: 'premium', href: '/partner/premium' },
];

/**
 * Partner network navigation - straightforward `/partner/*` links.
 *
 * Every destination is a real URL (crawlable, shareable, refresh-safe).
 * `activePage` lets file-routed `/partner/*` pages mark the active link
 * before the store syncs; the `/` shell omits it and stays store-driven.
 * `support` is dual-mode, so it keeps runtime navigation instead of a link.
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

  const handleSupport = () => {
    setMobileOpen(false);
    navigatePartner('support');
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-colors duration-300',
        scrolled
          ? 'border-b border-border/40 bg-background/80 backdrop-blur-md'
          : 'bg-background'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Partner network">
        {/* Logo */}
        <Link
          href="/partner"
          className="flex items-center transition-opacity hover:opacity-70"
          aria-label="Partner network home"
        >
          <ReliastraLogo size="lg" />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive = currentPage === link.page;
            return (
              <Link
                key={link.page}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn(isActive ? 'opacity-100' : 'opacity-70')}>
                  {link.label}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-1 -bottom-[9px] h-px bg-foreground"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-1 md:flex">
          <ThemeToggle className="mr-1" />
          <Link
            href="/"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3" />
            <span className="hidden lg:inline">Back to Reliastra</span>
          </Link>
          <button
            onClick={() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })); }}
            className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/60 transition-all"
            aria-label="Search"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline-flex rounded border border-border/40 bg-background px-1 py-0.5 text-[9px] font-mono text-muted-foreground/50">⌘K</kbd>
          </button>
          <button
            onClick={handleSupport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Support
          </button>
          <div className="h-4 w-px bg-border/60" />
          <Button variant="ghost" size="sm" className="text-sm" asChild>
            <Link href="/partner/login">Log in</Link>
          </Button>
          <div className="rounded-md transition-shadow duration-200 hover:shadow-[0_0_12px_2px_rgba(0,0,0,0.08)]">
            <Button variant="default" size="sm" className="text-sm" asChild>
              <Link href="/partner/signup">Apply now</Link>
            </Button>
          </div>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex items-center justify-center rounded-md p-2 text-foreground transition-colors hover:bg-accent md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-border/60 bg-background/80 backdrop-blur-md md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.page}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03, ease: [0.25, 0.1, 0.25, 1] as const }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'block rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      currentPage === link.page
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <ThemeToggle />
                <button
                  onClick={handleSupport}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Contact Support
                </button>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/partner/login" onClick={() => setMobileOpen(false)}>Log in</Link>
                </Button>
                <Button variant="default" size="sm" className="w-full" asChild>
                  <Link href="/partner/signup" onClick={() => setMobileOpen(false)}>Apply now</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
