'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  PartnerUser,
  PartnerPage,
  PartnerDashboardResponse,
  ReferralItem,
  CommissionItem,
  PayoutItem,
  Partner,
} from '@/types/partner';
import {
  storeSessionTokens,
  clearAllSessionTokens,
} from '@/lib/session-storage';

type PartnerAuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface PartnerStore {
  // Navigation
  currentPage: PartnerPage;
  previousPage: PartnerPage | null;
  intendedDestination: PartnerPage | null;
  navigate: (page: PartnerPage) => void;
  setIntendedDestination: (page: PartnerPage) => void;

  // Auth
  authStatus: PartnerAuthStatus;
  user: PartnerUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuthStatus: (status: PartnerAuthStatus) => void;
  setUser: (user: PartnerUser | null) => void;
  setTokens: (access: string, refresh: string) => void;

  // Partner profile
  partner: Partner | null;
  setPartner: (partner: Partner | null) => void;

  // Partner data (raw from API)
  dashboardData: PartnerDashboardResponse | null;
  referrals: ReferralItem[];
  referralsTotal: number;
  commissions: CommissionItem[];
  commissionsTotal: number;
  payouts: PayoutItem[];
  payoutsTotal: number;
  setDashboardData: (data: PartnerDashboardResponse) => void;
  setReferrals: (items: ReferralItem[], total: number) => void;
  setCommissions: (items: CommissionItem[], total: number) => void;
  setPayouts: (items: PayoutItem[], total: number) => void;

  /**
   * Mirror of the partner's server-side `browser_enabled` notification
   * preference. Persisted locally so the dashboard knows, before the first
   * preferences fetch resolves, whether it may raise Chrome notifications.
   */
  browserNotificationsEnabled: boolean;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;

  // UI state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Reset
  logout: () => void;
  /** Alias of {@link logout} — several components call `reset()`. */
  reset: () => void;
}

const initialState = {
  currentPage: 'landing' as PartnerPage,
  previousPage: null as PartnerPage | null,
  intendedDestination: null as PartnerPage | null,
  authStatus: 'idle' as PartnerAuthStatus,
  user: null as PartnerUser | null,
  accessToken: null as string | null,
  refreshToken: null as string | null,
  partner: null as Partner | null,
  dashboardData: null as PartnerDashboardResponse | null,
  referrals: [] as ReferralItem[],
  referralsTotal: 0,
  commissions: [] as CommissionItem[],
  commissionsTotal: 0,
  payouts: [] as PayoutItem[],
  payoutsTotal: 0,
  browserNotificationsEnabled: false,
  isSidebarOpen: false,
};

export const usePartnerStore = create<PartnerStore>()(
  persist(
    (set) => ({
      ...initialState,

      navigate: (page) =>
        set((state) => ({
          previousPage: state.currentPage,
          currentPage: page,
        })),

      setIntendedDestination: (page) =>
        set({ intendedDestination: page }),

      setAuthStatus: (authStatus) => set({ authStatus }),
      setUser: (user) => set({ user }),
      setTokens: (access, refresh) => {
        // Single shared session store: writes the canonical `reliastra_*`
        // keys AND the legacy `partner_*` mirror so every surface (customer
        // console, partner SPA, admin) sees the same pair.
        storeSessionTokens(access, refresh);
        set({ accessToken: access, refreshToken: refresh });
      },

      setPartner: (partner) => set({ partner }),

      setDashboardData: (data) => set({ dashboardData: data }),
      setReferrals: (items, total) => set({ referrals: items, referralsTotal: total }),
      setCommissions: (items, total) => set({ commissions: items, commissionsTotal: total }),
      setPayouts: (items, total) => set({ payouts: items, payoutsTotal: total }),

      setBrowserNotificationsEnabled: (enabled) =>
        set({ browserNotificationsEnabled: enabled }),

      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),

      logout: () => {
        // Explicit sign-out: the shared JWT session ends on all surfaces.
        clearAllSessionTokens();
        set({
          ...initialState,
          currentPage: 'home',
          authStatus: 'unauthenticated',
        });
      },

      reset: () => {
        // Explicit sign-out: the shared JWT session ends on all surfaces.
        clearAllSessionTokens();
        set({
          ...initialState,
          currentPage: 'home',
          authStatus: 'unauthenticated',
        });
      },
    }),
    {
      name: 'partner-store',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return localStorage;
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        user: state.user,
        authStatus: state.authStatus,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        partner: state.partner,
        browserNotificationsEnabled: state.browserNotificationsEnabled,
      }),
    }
  )
);
