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
import { BootSplash } from '@/components/shared/boot-splash';
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

export default function Home() {
  const currentPage = usePartnerStore((s) => s.currentPage);
  const authStatus = usePartnerStore((s) => s.authStatus);
  const user = usePartnerStore((s) => s.user);
  const navigate = usePartnerStore((s) => s.navigate);
  const setAuthStatus = usePartnerStore((s) => s.setAuthStatus);
  const setUser = usePartnerStore((s) => s.setUser);
  const setPartner = usePartnerStore((s) => s.setPartner);
  const [mounted, setMounted] = useState(false);

  // The existing partner experience is state-routed. Respect a small set of
  // intentional URL entry points so protected Admin access can send a user to
  // the shared sign-in screen and return them to `/admin` afterward.
  useEffect(() => {
    const requestedPage = new URLSearchParams(window.location.search).get('page');
    // 'support' is included because it is dual-mode and the landing footer
    // links to it: unauthenticated visitors get the public contact form,
    // signed-in partners get the conversation desk. `isDashboardRoute` makes
    // that split, so the URL cannot reach a protected surface anonymously.
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

  // Show the app immediately, then resolve auth state. This guarantees the
  // landing page can never get stuck behind the async auth hydration.
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

        // Fetch /api/auth/me — returns UserResponse directly (snake_case, not wrapped)
        let meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        // 401 = access token expired (or the preview edge stripped the
        // header): rotate the session silently before deciding the user is
        // signed out. Only a failed refresh clears this surface's tokens.
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

          // Also try to fetch partner profile in parallel
          let partnerRes = await fetch('/api/partners/me', {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (partnerRes.ok) {
            setPartner(mapPartnerProfile(await partnerRes.json()));
          } else if (partnerRes.status === 404) {
            // Account exists but was never activated. Activation is free and
            // idempotent server-side — do it silently so the user lands on
            // the dashboard instead of a useless "apply" step.
            try {
              const profile = await partnerApi.apply({ agree_terms: true });
              setPartner(mapPartnerProfile(profile));
            } catch {
              // Automatic activation must never block sign-in.
            }
          }
        } else {
          // Token is invalid and refresh failed
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

  // Redirect unauthenticated users away from dashboard pages
  // Redirect to home if authenticated user tries a non-existent dashboard page
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
    // Fallback: redirect non-authenticated users from dashboard pages to home
    if (isDashboardPage && authStatus !== 'unauthenticated' && authStatus !== 'authenticated') {
      navigate('home');
    }
  }, [currentPage, authStatus, mounted, navigate]);

  // A session must never be "authenticated" without an identity: the render
  // below would otherwise produce a blank screen with no recovery path.
  // Demote such a broken state to unauthenticated so the effect above routes
  // the visitor back to the sign-in form instead of stranding them.
  useEffect(() => {
    if (mounted && authStatus === 'authenticated' && !user) {
      setAuthStatus('unauthenticated');
    }
  }, [mounted, authStatus, user, setAuthStatus]);

  if (!mounted) {
    return (
      <BootSplash />
    );
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

  // Dashboard pages: authenticated users
  if (authStatus === 'authenticated') {
    if (user) {
      return <DashboardLayout />;
    }

    // Authenticated without an identity is a broken state the effect above
    // repairs; render the boot splash rather than a blank page in the interim.
    return (
      <BootSplash />
    );
  }

  // For dashboard pages that aren't yet authenticated, show nothing (useEffect handles redirect)
  // Reaching here guarantees authStatus is no longer 'authenticated' (the
  // branch above always returns), so the authenticated flag is always false.
  if (isDashboardRoute(currentPage, false)) {
    return null;
  }

  // Public pages fallback
  return <PublicLayout />;
}
