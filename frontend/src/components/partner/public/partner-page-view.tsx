'use client';

import { useEffect } from 'react';
import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';
import { PublicLayout } from './public-layout';

/**
 * Renders one partner page at its canonical `/partner/*` URL.
 *
 * The page prop drives the SSR output (via `PublicLayout page=`), so crawlers
 * and cold loads receive the real content in the initial HTML. The store sync
 * below keeps state-driven surfaces (command palette, dashboard transitions,
 * referral banner) consistent with the URL after hydration.
 */
export function PartnerPublicPage({ page }: { page: PartnerPage }) {
  const navigate = usePartnerStore((s) => s.navigate);

  useEffect(() => {
    navigate(page);
  }, [page, navigate]);

  return <PublicLayout page={page} />;
}
