import { usePartnerStore } from '@/stores/partner-store';
import {
  PARTNER_DASHBOARD_PAGES,
  isPartnerRouteSlug,
  partnerRouteUrl,
  partnerUrl,
} from '@/lib/routes';
import type { PartnerPage } from '@/types/partner';
import type { PartnerPublicPage } from '@/lib/routes';

/**
 * Navigation helpers for the marketing landing page.
 *
 * Customer auth is a first-class surface with its own routes (/login,
 * /signup). Partner network pages are file-routed at `/partner` and
 * `/partner/<slug>` (see lib/routes). Partner dashboard pages are
 * state-routed inside the authenticated `/` shell and have no URLs.
 */
export function goTo(page: PartnerPage) {
  if (typeof window !== 'undefined') {
    // Customer acquisition: landing "Start Free" / "Sign In" must land on the
    // customer forms, never the partner forms. /signup never creates a partner
    // profile, so sending partner intent there silently mis-enrols visitors.
    if (page === 'login') {
      window.location.assign('/login');
      return;
    }
    if (page === 'signup') {
      window.location.assign('/signup');
      return;
    }
  }
  navigatePartner(page);
}

/**
 * URL-aware navigation for any partner page from any surface.
 *
 * - `/partner/*` slugs (public pages + program legal) → canonical URL.
 * - `landing` → `/`.
 * - Dashboard pages (and `support` once signed in - the live conversation
 *   desk) → store navigation, returning to `/` when called from a
 *   `/partner/*` URL since the dashboard shell only renders there.
 */
export function navigatePartner(page: PartnerPage) {
  const store = usePartnerStore.getState();
  if (typeof window === 'undefined') {
    store.navigate(page);
    return;
  }
  if (page === 'landing') {
    store.navigate(page);
    if (window.location.pathname !== '/') window.location.assign('/');
    return;
  }
  const authed = store.authStatus === 'authenticated';
  const onPartnerUrl = window.location.pathname.startsWith('/partner');
  const isDashboard =
    (PARTNER_DASHBOARD_PAGES as readonly string[]).includes(page) ||
    (page === 'support' && authed);
  if (isDashboard) {
    store.navigate(page);
    if (onPartnerUrl) {
      window.location.assign('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  store.navigate(page);
  const url = isPartnerRouteSlug(page) ? partnerRouteUrl(page) : '/partner';
  if (window.location.pathname !== url) {
    window.location.assign(url);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Explicit partner-network navigation to a refresh-safe URL.
 * Use for "Join as partner" / "Partner login" links - never /signup or /login.
 */
export function goToPartner(page: PartnerPublicPage) {
  if (typeof window !== 'undefined') {
    window.location.assign(partnerUrl(page));
    return;
  }
  usePartnerStore.getState().navigate(page);
}

export function scrollToId(id: string) {
  if (typeof window === 'undefined') return;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Landing-page design tokens.
 *
 * Light values are copied 1:1 from the production Reliastra marketing site
 * (zinc + cyan palette). `dark:` variants provide the clean white ↔ black
 * background switch requested for the landing page.
 */
export const lp = {
  // Page + alternating section surfaces
  bg: 'bg-white dark:bg-[#0A0A0F]',
  bgAlt: 'bg-[#F8F9FA] dark:bg-[#131318]',

  // Typography
  text: 'text-[#09090B] dark:text-[#FAFAFA]',
  textSecondary: 'text-[#52525B] dark:text-[#A1A1AA]',
  textMuted: 'text-[#71717A] dark:text-[#71717A]',

  // Borders
  border: 'border-[#E4E4E7] dark:border-white/10',
  borderSubtle: 'border-[#F0F0F0] dark:border-white/5',

  // Cards
  card: 'bg-white dark:bg-[#131318]',
  cardAlt: 'bg-[#F8F9FA] dark:bg-[#1A1A20]',
  cardBorder: 'border-[#E4E4E7] dark:border-white/10',

  // Accent (cyan)
  accent: 'text-[#0891B2] dark:text-[#22D3EE]',
  accentBg: 'bg-[#0891B2] dark:bg-[#0891B2]',
  accentSoft: 'bg-[#0891B2]/10 dark:bg-[#0891B2]/15',
  accentHover: 'hover:bg-[#0E7490] dark:hover:bg-[#0E7490]',

  // Primary dark CTA button (inverts in dark mode)
  btnDark:
    'bg-[#0A0A0F] text-white hover:bg-[#1A1A2F] dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]',

  // Sections that are intentionally dark, even in light mode (match zevcloud)
  darkSection: 'bg-[#0A0A0F]',
  footer: 'bg-[#0A0A0F] border-t border-white/10',

  // Neutral success / danger / warning text
  success: 'text-[#16A34A] dark:text-[#22C55E]',
  danger: 'text-[#DC2626] dark:text-[#F87171]',
  warning: 'text-[#D97706] dark:text-[#FBBF24]',
} as const;
