'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { partnerApi } from '@/lib/partner-api';
import { getAccessToken, getRefreshToken } from '@/lib/partner-session';
import { usePartnerStore } from '@/stores/partner-store';
import { BootSplash } from '@/components/shared/boot-splash';
import { DashboardLayout } from './dashboard-layout';
import type { PartnerPage } from '@/types/partner';

/** Shared identity does not imply partner membership. Prove both before mounting queries. */
export function PartnerSession({ page }: { page: PartnerPage }) {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'not-partner'>('loading');
  const [attempt, setAttempt] = useState(0);
  const authStatus = usePartnerStore(s => s.authStatus);
  useEffect(() => { usePartnerStore.getState().navigate(page); }, [page]);

  useEffect(() => {
    let alive = true;
    const signIn = () => router.replace(`/partner/login?next=${encodeURIComponent(window.location.pathname)}`);
    if (!getAccessToken() && !getRefreshToken()) { signIn(); return; }
    setState('loading');
    (async () => {
      try {
        const user = await partnerApi.me();
        const profile = await partnerApi.getMe();
        if (!alive) return;
        const store = usePartnerStore.getState();
        store.setUser({ id: user.id, email: user.email, fullName: user.full_name });
        store.setPartner(profile);
        store.setAuthStatus('authenticated');
        setState('ready');
      } catch (err) {
        if (!alive) return;
        if (err instanceof Error && err.message === 'UNAUTHORIZED') signIn();
        else setState(err instanceof Error && err.message === 'NOT_FOUND' ? 'not-partner' : 'error');
      }
    })();
    return () => { alive = false; };
  }, [router, attempt]);

  useEffect(() => {
    if (state === 'ready' && authStatus === 'unauthenticated') router.replace('/partner/login');
  }, [state, authStatus, router]);

  if (state === 'loading' || (state === 'ready' && authStatus !== 'authenticated')) return <BootSplash />;
  if (state !== 'ready') return (
    <main className="ob-container-narrow py-24">
      <h1 className="ob-h2">{state === 'not-partner' ? 'Partner account required' : 'Unable to load partner account'}</h1>
      <div className="mt-6 flex gap-6">
        {state === 'error' && <button className="ob-link" onClick={() => setAttempt(n => n + 1)}>Retry</button>}
        <Link className="ob-link" href="/partner/signup">Partner registration</Link>
        <Link className="ob-link" href="/partner/login">Sign in</Link>
      </div>
    </main>
  );
  return <DashboardLayout />;
}
