'use client';

import { create } from 'zustand';
import type { PlanId, UserMe, Organization, PlanDetails } from '@/lib/dashboard/types';
import { mockOrg, mockPlan, mockUser } from '@/lib/dashboard/mock';

const REFRESH_KEY = 'reliastra_refresh_token';

export interface RecentItem {
  href: string;
  label: string;
}

interface AppState {
  accessToken: string | null;
  isDemo: boolean;
  hydrated: boolean;
  sessionState: 'loading' | 'authenticated' | 'unauthenticated' | 'expired';
  user: UserMe | null;
  org: Organization | null;
  plan: PlanDetails | null;
  demoPlanOverride: PlanId | null;
  selectedClientId: string | null;
  upgradeOpen: boolean;
  upgradeReason: string | null;
  commandOpen: boolean;
  addDependencyOpen: boolean;
  editingDependencyId: string | null;
  sidebarOpen: boolean;
  helpOpen: boolean;
  evidenceGateOpen: boolean;
  recent: RecentItem[];
  unreadCount: number;
  online: boolean;

  setAccessToken: (token: string | null) => void;
  setHydrated: (v: boolean) => void;
  setSessionState: (s: AppState['sessionState']) => void;
  setSession: (user: UserMe | null, org: Organization | null, plan: PlanDetails | null) => void;
  enterDemoMode: () => void;
  setDemoPlan: (plan: PlanId) => void;
  setSelectedClient: (id: string | null) => void;
  openUpgrade: (reason?: string) => void;
  closeUpgrade: () => void;
  setCommandOpen: (v: boolean) => void;
  setAddDependencyOpen: (v: boolean, id?: string | null) => void;
  setSidebarOpen: (v: boolean) => void;
  setHelpOpen: (v: boolean) => void;
  setEvidenceGateOpen: (v: boolean) => void;
  pushRecent: (item: RecentItem) => void;
  setUnreadCount: (n: number) => void;
  setOnline: (v: boolean) => void;
  /** 401 after refresh — clear everything and route to sign-in. */
  sessionExpired: () => void;
  signOut: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  accessToken: null,
  isDemo: false,
  hydrated: false,
  sessionState: 'loading',
  user: null,
  org: null,
  plan: null,
  demoPlanOverride: null,
  selectedClientId: null,
  upgradeOpen: false,
  upgradeReason: null,
  commandOpen: false,
  addDependencyOpen: false,
  editingDependencyId: null,
  sidebarOpen: false,
  helpOpen: false,
  evidenceGateOpen: false,
  recent: [],
  // Seeded at zero and driven by GET /v1/notifications/inbox. This used to be
  // a hardcoded 2 that nothing ever updated, so the bell badge was fiction.
  unreadCount: 0,
  online: true,

  setAccessToken: (token) => set({ accessToken: token, isDemo: !token }),
  setHydrated: (v) => set({ hydrated: v }),
  setSessionState: (sessionState) => set({ sessionState }),
  setSession: (user, org, plan) =>
    set({
      sessionState: 'authenticated',
      isDemo: false,
      user,
      org,
      plan,
    }),
  enterDemoMode: () =>
    set({
      isDemo: true,
      sessionState: 'authenticated',
      accessToken: null,
      user: mockUser,
      org: mockOrg,
      plan: mockPlan,
    }),
  setDemoPlan: (planId) => {
    const prices: Record<PlanId, number> = {
      free: 0,
      pro: 39,
      enterprise: 0,
    };
    const limits: Record<PlanId, number | null> = {
      free: 3,
      pro: 50,
      enterprise: null,
    };
    set({
      demoPlanOverride: planId,
      org: {
        ...(get().org ?? mockOrg),
        plan: planId,
        has_agency_mode: planId === 'enterprise',
      },
      plan: {
        ...(get().plan ?? mockPlan),
        plan: planId,
        price_usd: prices[planId],
        max_dependencies: limits[planId],
      },
    });
  },
  setSelectedClient: (id) => set({ selectedClientId: id }),
  openUpgrade: (reason) => set({ upgradeOpen: true, upgradeReason: reason ?? null }),
  closeUpgrade: () => set({ upgradeOpen: false, upgradeReason: null }),
  setCommandOpen: (v) => set({ commandOpen: v }),
  setAddDependencyOpen: (v, id = null) =>
    set({ addDependencyOpen: v, editingDependencyId: id ?? null }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setHelpOpen: (v) => set({ helpOpen: v }),
  setEvidenceGateOpen: (v) => set({ evidenceGateOpen: v }),
  pushRecent: (item) =>
    set((s) => ({
      recent: [item, ...s.recent.filter((r) => r.href !== item.href)].slice(0, 3),
    })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  setOnline: (v) => set({ online: v }),
  sessionExpired: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(REFRESH_KEY);
    }
    set({
      accessToken: null,
      sessionState: 'expired',
      isDemo: false,
      user: null,
      org: null,
      plan: null,
    });
  },
  signOut: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(REFRESH_KEY);
    }
    set({
      accessToken: null,
      sessionState: 'unauthenticated',
      isDemo: false,
      user: null,
      org: null,
      plan: null,
      recent: [],
    });
  },
}));

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}
