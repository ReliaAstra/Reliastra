'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Menu, ArrowRight, Activity } from 'lucide-react';
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

const NAV_LINKS = [
  { label: 'Product', action: () => scrollToId('evidence') },
  { label: 'Live Data', action: () => scrollToId('live') },
  { label: 'Compare', action: () => scrollToId('comparison') },
  { label: 'Pricing', action: () => scrollToId('pricing') },
];

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
      <nav className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 md:px-12">
        {/* Wordmark */}
        <button
          onClick={() => scrollToId('top')}
          className="flex items-center gap-0 transition-opacity hover:opacity-80"
          aria-label="Reliastra home"
        >
          <BrandLogo className="text-[#09090B] dark:text-white" size="lg" />
        </button>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={link.action}
              className="text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
            >
              {link.label}
            </button>
          ))}
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
          >
            Research
          </Link>
          <Link
            href="/track"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#52525B] transition-colors hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:text-white"
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
              className="w-[300px] border-[#E4E4E7] bg-white p-6 dark:border-white/10 dark:bg-[#0A0A0F]"
            >
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="mt-8 space-y-1">
                {NAV_LINKS.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => {
                      setMobileOpen(false);
                      link.action();
                    }}
                    className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-[#52525B] transition-colors hover:bg-[#F8F9FA] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-white/5 dark:hover:text-white"
                  >
                    {link.label}
                  </button>
                ))}
                <Link
                  href="/research"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-[#52525B] transition-colors hover:bg-[#F8F9FA] hover:text-[#09090B] dark:text-[#A1A1AA] dark:hover:bg-white/5 dark:hover:text-white"
                >
                  Research
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
