'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';
import { PartnerNav } from './partner-nav';
import { PartnerFooter } from './partner-footer';
import { PageHome } from './page-home';
import { PageEarn } from './page-earn';
import { PageHowItWorks } from './page-how-it-works';
import { PageCommission } from './page-commission';
import { PageFaq } from './page-faq';
import { PageTiers } from './page-tiers';
import { PageResources } from './page-resources';
import { PageLogin } from './page-login';
import { PageSignup } from './page-signup';
import { PageSupport } from './page-support';
import { PageForgotPassword } from './page-forgot-password';
import { PagePrivacy } from './page-privacy';
import { PageTerms } from './page-terms';
import { PagePremium } from './page-premium';
import { ReferralBanner } from './referral-banner';
import { ScrollToTop } from '../shared/scroll-to-top';
import { CommandPalette } from '../shared/command-palette';

const publicPages: PartnerPage[] = [
  'home',
  'earn',
  'how-it-works',
  'commission',
  'faq',
  'tiers',
  'premium',
  'resources',
  'login',
  'signup',
  'support',
  'forgot-password',
  'privacy',
  'terms',
];

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

function PageContent({ page }: { page: PartnerPage }) {
  switch (page) {
    case 'home':
      return <PageHome />;
    case 'earn':
      return <PageEarn />;
    case 'how-it-works':
      return <PageHowItWorks />;
    case 'commission':
      return <PageCommission />;
    case 'faq':
      return <PageFaq />;
    case 'tiers':
      return <PageTiers />;
    case 'resources':
      return <PageResources />;
    case 'login':
      return <PageLogin />;
    case 'signup':
      return <PageSignup />;
    case 'support':
      return <PageSupport />;
    case 'forgot-password':
      return <PageForgotPassword />;
    case 'privacy':
      return <PagePrivacy />;
    case 'terms':
      return <PageTerms />;
    case 'premium':
      return <PagePremium />;
    default:
      return <PageHome />;
  }
}

export function PublicLayout({ page }: { page?: PartnerPage } = {}) {
  const storePage = usePartnerStore((s) => s.currentPage);
  // File-routed `/partner/*` pages pass `page` explicitly so the SSR output
  // is the requested page even before the store syncs. The `/` home shell
  // omits it and stays store-driven (dashboard SPA + legacy `?page=`).
  const currentPage = page ?? storePage;
  const isPublicPage = publicPages.includes(currentPage);

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  if (!isPublicPage) {
    return null;
  }

  const isCenteredPage =
    currentPage === 'login' ||
    currentPage === 'signup' ||
    currentPage === 'forgot-password';

  return (
    // `ob` puts this subtree on the Obsidian palette AND remaps the shadcn
    // semantic tokens (see the token bridge in globals.css), so the partner
    // surface stops rendering as a light-theme island inside a dark site.
    <div className="ob flex min-h-screen flex-col">
      <a href="#partner-main" className="ob-skip">
        Skip to content
      </a>
      <ReferralBanner />
      <PartnerNav activePage={currentPage} />

      <main id="partner-main" className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={isCenteredPage || currentPage === 'support' ? 'flex flex-col py-12 sm:py-16' : ''}
          >
            <PageContent page={currentPage} />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* The footer is rendered on EVERY public partner page. It was
          previously suppressed on the auth and support screens, which left a
          visitor on those pages with no navigation and no legal links at
          all - the exact pages where terms and privacy matter most. */}
      <PartnerFooter />

      <ScrollToTop />
      <CommandPalette />
    </div>
  );
}
