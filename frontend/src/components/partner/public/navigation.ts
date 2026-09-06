import { usePartnerStore } from '@/stores/partner-store';
import {
  PARTNER_DASHBOARD_PAGES,
  isPartnerRouteSlug,
  partnerRouteUrl,
} from '@/lib/routes';
import type { PartnerPage } from '@/types/partner';

/**
 * URL-aware navigation for any partner page, from any surface.
 *
 * The partner network is a hybrid: its public pages are file-routed at
 * `/partner` and `/partner/<slug>`, while the authenticated dashboard is
 * state-routed inside the `/` shell and has no URLs of its own. Every partner
 * component therefore goes through this one helper rather than deciding for
 * itself whether a destination is a link or a store transition.
 *
 * - `landing` -> `/`.
 * - Dashboard pages (and `support` once signed in - the live conversation
 *   desk) -> store navigation, returning to `/` when called from a
 *   `/partner/*` URL, since the dashboard shell only renders there.
 * - Everything else -> the canonical `/partner/*` URL.
 *
 * Customer auth is deliberately absent: `/login` and `/signup` are ordinary
 * links in the public header and must never be reached through partner
 * navigation, which would silently enrol a customer as a partner.
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
