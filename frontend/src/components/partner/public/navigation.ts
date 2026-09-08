'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePartnerStore } from '@/stores/partner-store';
import { PARTNER_DASHBOARD_PAGES, isPartnerRouteSlug, partnerRouteUrl } from '@/lib/routes';
import type { PartnerPage } from '@/types/partner';

export function partnerDestination(page: PartnerPage): string {
  if (page === 'landing') return '/';
  if (page === 'support' && usePartnerStore.getState().authStatus === 'authenticated') {
    return '/partner/dashboard/support';
  }
  if ((PARTNER_DASHBOARD_PAGES as readonly string[]).includes(page)) return `/partner/${page}`;
  return isPartnerRouteSlug(page) ? partnerRouteUrl(page) : '/partner';
}

/** For actions outside React. The URL, never persisted UI state, owns navigation. */
export function navigatePartner(page: PartnerPage) {
  if (typeof window !== 'undefined') window.location.assign(partnerDestination(page));
}

/** Client transitions retain the shell and participate in browser history. */
export function usePartnerNavigation() {
  const router = useRouter();
  return useCallback((page: PartnerPage) => router.push(partnerDestination(page)), [router]);
}
