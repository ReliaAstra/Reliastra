'use client';

import { useEffect, useState } from 'react';
import { usePartnerStore } from '@/stores/partner-store';
import { PageLanding } from '@/components/landing/page-landing';
import { PublicLayout } from '@/components/partner/public/public-layout';
import { DashboardLayout } from '@/components/partner/dashboard/dashboard-layout';
import { partnerApi, mapPartnerProfile } from '@/lib/partner-api';
import {
  getAccessToken,
  clearPartnerTokens,
} from '@/lib/session-storage';
import { refreshSession } from '@/lib/auth-refresh';
import type { PartnerPage } from '@/types/partner';

const dashboardPages: PartnerPage[] = [
  'dashboard',
  'referrals',
  'earnings',
  'payouts',
  'notifications',
  'settings',
];

/**
 * `support` is dual-mode: a public contact form for visitors, and the live
 * conversation desk (backed by the admin support queue) once signed in.
 */
function isDashboardRoute(page: PartnerPage, authenticated: boolean): boolean {
  if (page === 'support') return authenticated;
  return dashboardPages.includes(page);
}

/**
 * SEO-safe home shell.
 *
 * The previous version returned a bare `<BootSplash />` until `mounted`
 * became true — which meant the server response (and therefore every
 * crawler) received no H1, no copy and no links. This version renders the
 * full public landing as the default SSR output and only swaps to the
 * authenticated dashboard after the client has proven a session. Crawlers
 * and first-time visitors always receive meaningful, indexable HTML.
 */
export function HomeClient() {
  const currentPage = usePartnerStore((s) => s.currentPage);
  const authStatus = usePartnerStore((s) => s.authStatus);
  const user = usePartnerStore((s) => s.user);
  const navigate = usePartnerStore((s) => s.navigate);
  const setAuthStatus = usePartnerStore((s) => s.setAuthStatus);
  const setUser = usePartnerStore((s) => s.setUser);
  const setPartner = usePartnerStore((s) => s.setPartner);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Legacy `/?page=*` fallback: the proxy 308-redirects known partner
    // slugs to `/partner/*` before this runs, so this only fires for
    // slugs without a file route. Dashboard pages are deliberately excluded
    // so a shared URL cannot leak into a protected surface.
    const requestedPage = new URLSearchParams(window.location.search).get('page');
    const publicEntryPages: PartnerPage[] = [
      'home',
      'login',
      'signup',
      'forgot-password',
      'support',
    ];
    if (requestedPage && publicEntryPages.includes(requestedPage as PartnerPage)) {
      navigate(requestedPage as PartnerPage);
    }
  }, [navigate]);

  useEffect(() => {
    setMounted(true);
    const checkAuth = async () => {
      try {
        let token = getAccessToken();
        if (!token) {
          setAuthStatus('unauthenticated');
          setMounted(true);
          return;
        }

        let meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (meRes.status === 401) {
          const refreshed = await refreshSession();
          if (!refreshed) {
            clearPartnerTokens();
            setAuthStatus('unauthenticated');
            setMounted(true);
            return;
          }
          token = refreshed.accessToken;
          meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (meRes.ok) {
          const data = await meRes.json();
          setUser({
            id: data.id,
            email: data.email,
            fullName: data.full_name,
          });
          setAuthStatus('authenticated');

          let partnerRes = await fetch('/api/partners/me', {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (partnerRes.ok) {
            setPartner(mapPartnerProfile(await partnerRes.json()));
          } else if (partnerRes.status === 404) {
            try {
              const profile = await partnerApi.apply({ agree_terms: true });
              setPartner(mapPartnerProfile(profile));
            } catch {
              // Automatic activation must never block sign-in.
            }
          }
        } else {
          clearPartnerTokens();
          setAuthStatus('unauthenticated');
        }
      } catch {
        setAuthStatus('unauthenticated');
      }
      setMounted(true);
    };
    checkAuth();
  }, [setUser, setAuthStatus, setPartner]);

  useEffect(() => {
    if (!mounted) return;
    const isDashboardPage = isDashboardRoute(
      currentPage,
      authStatus === 'authenticated'
    );
    if (isDashboardPage && authStatus === 'unauthenticated') {
      navigate('login');
      return;
    }
    if (isDashboardPage && authStatus !== 'unauthenticated' && authStatus !== 'authenticated') {
      navigate('home');
    }
  }, [currentPage, authStatus, mounted, navigate]);

  useEffect(() => {
    if (mounted && authStatus === 'authenticated' && !user) {
      setAuthStatus('unauthenticated');
    }
  }, [mounted, authStatus, user, setAuthStatus]);

  // ── SSR / pre-hydration: always emit the full public landing so crawlers
  // receive H1 + copy + internal links in the initial HTML. ──
  if (!mounted) {
    return <PageLanding />;
  }

  const isPublicPage = !isDashboardRoute(
    currentPage,
    authStatus === 'authenticated'
  );

  if (currentPage === 'landing') {
    return <PageLanding />;
  }

  if (isPublicPage) {
    return <PublicLayout />;
  }

  if (authStatus === 'authenticated') {
    if (user) {
      return <DashboardLayout />;
    }
    // Authenticated without identity: show landing (crawlable) while the
    // repair effect demotes the broken session — never a blank page.
    return <PageLanding />;
  }

  if (isDashboardRoute(currentPage, false)) {
    return <PageLanding />;
  }

  return <PublicLayout />;
}
