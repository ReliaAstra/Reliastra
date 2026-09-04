'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';
import { ReliastraLogo } from '../shared/reliastra-logo';
import { ThemeToggle } from '../shared/theme-toggle';

/**
 * Anchor navigation for the (now single-page) partner landing.
 * The old multi-page "earn / tiers / premium" surface is no longer advertised —
 * the program is one page: Program → Commission → Application.
 */
const sectionLinks = [
  { label: 'Program', id: 'program' },
  { label: 'Commission', id: 'commission' },
  { label: 'Application', id: 'apply' },
];

export function PartnerNav() {
  const navigate = usePartnerStore((s) => s.navigate);
  const currentPage = usePartnerStore((s) => s.currentPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const goToSection = (id: string) => {
    setMobileOpen(false);
    if (currentPage !== 'home') {
      navigate('home');
      // PublicLayout scrolls to top on page change; land on the section after.
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 380);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNav = (page: PartnerPage) => {
    navigate(page);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <button
          onClick={() => handleNav('home')}
          className="flex items-center transition-opacity hover:opacity-70"
          aria-label="RELIASTRA Partner Program home"
        >
          <ReliastraLogo size="lg" />
        </button>

        {/* Desktop links */}
        <div className="hidden items-center gap-7 md:flex">
          {sectionLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => goToSection(link.id)}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => handleNav('resources')}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Resources
          </button>
          <button
            onClick={() => handleNav('support')}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </button>
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle className="mr-1" />
          <button
            onClick={() => handleNav('landing')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            <span className="hidden lg:inline">Back to Reliastra</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleNav('login')}
            className="text-sm"
          >
            Log in
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleNav('signup')}
            className="text-sm"
          >
            Apply now
          </Button>
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
              {sectionLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => goToSection(link.id)}
                  className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => handleNav('resources')}
                className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Resources
              </button>
              <button
                onClick={() => handleNav('support')}
                className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Contact
              </button>
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <ThemeToggle />
                <button
                  onClick={() => handleNav('landing')}
                  className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="size-3" />
                  Back to Reliastra
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNav('login')}
                  className="w-full"
                >
                  Log in
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleNav('signup')}
                  className="w-full"
                >
                  Apply now
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
