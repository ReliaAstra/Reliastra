'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Wordmark } from './wordmark';
import {
  HEADER_ACTIONS,
  PRIMARY_NAV,
  PRODUCT_PANEL,
  type NavLink,
} from './nav-config';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Global public navigation.
 *
 * Design decisions worth stating, because each one is load-bearing:
 *
 * - Four top-level destinations. A sparse bar is the single clearest signal
 *   that a company knows what it sells.
 * - The bar is transparent over the hero and becomes an opaque obsidian rail
 *   on scroll. Opaque, not frosted: glass is decoration, and it degrades
 *   text contrast over photography.
 * - The Product panel is always in the DOM as real `<Link>`s, so crawlers and
 *   no-JS clients get the full internal link graph. Visibility is CSS.
 * - The mobile menu is a full-screen typographic index, not a drawer with ten
 *   links dropped into it. It groups by the same IA as the footer.
 */
export function SiteHeader({
  /** Hero pages start transparent; interior pages start solid. */
  overHero = false,
}: {
  overHero?: boolean;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Route change closes everything. Without this the overlay survives a
  // client-side navigation and traps the visitor on the menu.
  useEffect(() => {
    setMenuOpen(false);
    setPanelOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const solid = scrolled || !overHero;

  const openPanel = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPanelOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPanelOpen(false), 140);
  };

  // `usePathname()` is null when the header is rendered outside a router (the
  // link-integrity test renders it with `renderToStaticMarkup`). Nothing is
  // marked current in that case, which is the correct answer.
  const isActive = (href: string) =>
    !pathname ? false : href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <a href="#main" className="ob-skip">
        Skip to content
      </a>

      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
          solid
            ? 'border-b border-[var(--ob-line)] bg-[var(--ob-void)]/95 supports-[backdrop-filter]:bg-[var(--ob-void)]/80 supports-[backdrop-filter]:backdrop-blur-md'
            : 'border-b border-transparent bg-transparent'
        )}
        onMouseLeave={scheduleClose}
      >
        <div className="ob-container">
          <div className="flex h-[64px] items-center justify-between gap-6 md:h-[76px]">
            <Link
              href={PUBLIC_ROUTES.home}
              aria-label="RELIASTRA home"
              className="shrink-0 py-2"
            >
              <Wordmark size="md" />
            </Link>

            {/* ── Desktop navigation ── */}
            <nav
              aria-label="Primary"
              className="hidden items-center gap-1 lg:flex"
            >
              {PRIMARY_NAV.map((item) =>
                item.label === 'Product' ? (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={openPanel}
                    onFocus={openPanel}
                  >
                    <Link
                      href={item.href}
                      aria-expanded={panelOpen}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      onClick={() => setPanelOpen(false)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-medium tracking-[0.01em] transition-colors',
                        isActive(item.href)
                          ? 'text-[var(--ob-text)]'
                          : 'text-[var(--ob-text-3)] hover:text-[var(--ob-text)]'
                      )}
                    >
                      {item.label}
                      <span
                        aria-hidden
                        className={cn(
                          'block h-[5px] w-[5px] border-b border-r border-current transition-transform duration-200',
                          panelOpen ? '-translate-y-px rotate-[225deg]' : 'rotate-45'
                        )}
                      />
                    </Link>
                  </div>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    onMouseEnter={scheduleClose}
                    className={cn(
                      'px-3.5 py-2 text-[13.5px] font-medium tracking-[0.01em] transition-colors',
                      isActive(item.href)
                        ? 'text-[var(--ob-text)]'
                        : 'text-[var(--ob-text-3)] hover:text-[var(--ob-text)]'
                    )}
                  >
                    {item.label}
                  </Link>
                )
              )}
            </nav>

            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href={HEADER_ACTIONS.signIn.href}
                className="px-3.5 py-2 text-[13.5px] font-medium text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-text)]"
              >
                {HEADER_ACTIONS.signIn.label}
              </Link>
              <Link
                href={HEADER_ACTIONS.start.href}
                className="ob-btn ob-btn-signal ob-btn-sm"
              >
                {HEADER_ACTIONS.start.label}
              </Link>
            </div>

            {/* ── Mobile trigger ── */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="ob-mobile-menu"
              className="-mr-2 inline-flex items-center gap-2.5 p-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-2)] lg:hidden"
            >
              Menu
              <span aria-hidden className="flex flex-col gap-[5px]">
                <span className="block h-px w-5 bg-current" />
                <span className="block h-px w-5 bg-current" />
              </span>
            </button>
          </div>
        </div>

        {/* ── Product panel. Always rendered for crawlers; CSS controls
             visibility so keyboard focus reveals it via focus-within. ── */}
        <div
          className={cn(
            'absolute inset-x-0 top-full hidden border-b border-[var(--ob-line)] bg-[var(--ob-base)] transition-[opacity,visibility,transform] duration-200 lg:block',
            panelOpen
              ? 'visible translate-y-0 opacity-100'
              : 'invisible -translate-y-1 opacity-0'
          )}
          onMouseEnter={openPanel}
          onMouseLeave={scheduleClose}
        >
          <div className="ob-container py-10">
            <div className="grid gap-10 md:grid-cols-[1fr_1fr_minmax(200px,280px)]">
              {PRODUCT_PANEL.map((group) => (
                <div key={group.label}>
                  <p className="ob-label mb-5">{group.label}</p>
                  <ul className="flex flex-col gap-1">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <PanelLink link={link} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="border-l border-[var(--ob-line)] pl-8">
                <p className="ob-label mb-4">Start here</p>
                <p className="mb-6 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                  Add the external services your product depends on and RELIASTRA
                  begins observing them on the next scheduled check.
                </p>
                <Link
                  href={HEADER_ACTIONS.start.href}
                  className="ob-btn ob-btn-signal ob-btn-sm ob-btn-block"
                >
                  Start monitoring
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile full-screen index ── */}
      <div
        id="ob-mobile-menu"
        hidden={!menuOpen}
        className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-[var(--ob-void)] lg:hidden"
      >
        <div className="ob-container flex h-[64px] shrink-0 items-center justify-between">
          <Wordmark size="md" />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="-mr-2 inline-flex items-center gap-2.5 p-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-2)]"
          >
            Close
            <span aria-hidden className="relative block h-4 w-4">
              <span className="absolute left-0 top-1/2 block h-px w-4 rotate-45 bg-current" />
              <span className="absolute left-0 top-1/2 block h-px w-4 -rotate-45 bg-current" />
            </span>
          </button>
        </div>

        <nav
          aria-label="Mobile"
          className="ob-container flex flex-1 flex-col pb-10 pt-6"
        >
          <ul className="flex flex-col">
            {PRIMARY_NAV.map((item) => (
              <li key={item.label} className="border-t border-[var(--ob-line)]">
                <Link
                  href={item.href}
                  className="flex items-baseline justify-between py-5 text-[26px] font-semibold tracking-[-0.025em] text-[var(--ob-text)]"
                >
                  {item.label}
                  <span aria-hidden className="ob-label">
                    {String(PRIMARY_NAV.indexOf(item) + 1).padStart(2, '0')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {PRODUCT_PANEL.map((group) => (
              <div key={group.label}>
                <p className="ob-label mb-4">{group.label}</p>
                <ul className="flex flex-col gap-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[14px] leading-snug text-[var(--ob-text-3)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-12">
            <Link
              href={HEADER_ACTIONS.start.href}
              className="ob-btn ob-btn-signal ob-btn-block"
            >
              {HEADER_ACTIONS.start.label}
            </Link>
            <Link
              href={HEADER_ACTIONS.signIn.href}
              className="ob-btn ob-btn-outline ob-btn-block"
            >
              {HEADER_ACTIONS.signIn.label}
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}

function PanelLink({ link }: { link: NavLink }) {
  return (
    <Link
      href={link.href}
      className="group -mx-3 flex flex-col gap-1 rounded-[2px] px-3 py-2.5 transition-colors hover:bg-[var(--ob-elevated)]"
    >
      <span className="text-[14px] font-medium text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
        {link.label}
      </span>
      {link.description && (
        <span className="text-[12.5px] leading-[1.5] text-[var(--ob-text-4)]">
          {link.description}
        </span>
      )}
    </Link>
  );
}
