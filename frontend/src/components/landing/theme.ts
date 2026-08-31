import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';

/**
 * Navigation helpers for the marketing landing page.
 *
 * Customer auth is a first-class surface with its own routes; everything
 * else (partner network pages) routes through the partner store.
 */
export function goTo(page: PartnerPage) {
  if (typeof window !== 'undefined') {
    if (page === 'login') {
      window.location.assign('/login');
      return;
    }
    if (page === 'signup') {
      window.location.assign('/signup');
      return;
    }
  }
  usePartnerStore.getState().navigate(page);
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Navigate to a PARTNER-NETWORK page (the state-routed surface served at
 * `/?page=…`, NOT the customer `/login` or `/signup` routes).
 *
 * The landing page's `goTo('login'|'signup')` deliberately targets the
 * customer auth routes, but the partner CTAs ("BECOME A PARTNER", "Join as
 * partner") must land on the partner surface instead. `/?page=…` is the
 * canonical entry point: the landing `page.tsx` reads it on mount and routes
 * into the partner store.
 */
export function goToPartner(page: PartnerPage) {
  if (typeof window !== 'undefined') {
    window.location.assign(`/?page=${encodeURIComponent(page)}`);
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
