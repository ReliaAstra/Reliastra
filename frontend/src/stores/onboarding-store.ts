'use client';

import { create } from 'zustand';

export type OrgType = 'saas' | 'fintech' | 'ecommerce' | 'agency' | 'platform' | 'other' | '';
export type Concern = 'availability' | 'visibility' | 'evidence' | 'accountability' | 'sla' | 'api' | '';
export type Scale = '1-5' | '6-20' | '21-50' | '50+' | '';

export type OnboardingStepId =
  | 'context'
  | 'dependency'
  | 'validation'
  | 'first-value'
  | 'evidence'
  | 'alerts'
  | 'expand'
  | 'complete';

export interface OnboardingContext {
  orgType: OrgType;
  concern: Concern;
  scale: Scale;
}

interface OnboardingState {
  current: OnboardingStepId;
  context: OnboardingContext;
  completedSteps: OnboardingStepId[];
  dismissed: boolean;
  firstDependencyId: string | null;
  validationState: 'idle' | 'checking' | 'reachable' | 'unreachable' | 'error';
  _hydrated: boolean;
  setCurrent: (id: OnboardingStepId) => void;
  setContext: (c: Partial<OnboardingContext>) => void;
  markComplete: (id: OnboardingStepId) => void;
  setValidation: (s: OnboardingState['validationState']) => void;
  setFirstDependency: (id: string | null) => void;
  dismiss: () => void;
  reset: () => void;
  hydrate: () => void;
}

const ORDER: OnboardingStepId[] = [
  'context',
  'dependency',
  'validation',
  'first-value',
  'evidence',
  'alerts',
  'expand',
  'complete',
];

const LS_KEY = 'reliastra_onboarding_v2';

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  current: 'context',
  context: { orgType: '', concern: '', scale: '' },
  completedSteps: [],
  dismissed: false,
  firstDependencyId: null,
  validationState: 'idle',
  _hydrated: false,

  setCurrent: (current) => {
    set({ current });
    persist(get());
  },
  setContext: (partial) => {
    const context = { ...get().context, ...partial };
    set({ context });
    persist(get());
  },
  markComplete: (id) => {
    const completedSteps = Array.from(new Set([...get().completedSteps, id]));
    set({ completedSteps });
    persist(get());
  },
  setValidation: (validationState) => set({ validationState }),
  setFirstDependency: (firstDependencyId) => {
    set({ firstDependencyId });
    persist(get());
  },
  dismiss: () => {
    set({ dismissed: true });
    persist(get());
  },
  reset: () => {
    const s: Partial<OnboardingState> = {
      current: 'context',
      context: { orgType: '', concern: '', scale: '' },
      completedSteps: [],
      dismissed: false,
      firstDependencyId: null,
      validationState: 'idle',
    };
    set(s as OnboardingState);
    persist(get());
  },
  hydrate: () => {
    if (get()._hydrated) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          current: parsed.current ?? 'context',
          context: parsed.context ?? { orgType: '', concern: '', scale: '' },
          completedSteps: parsed.completedSteps ?? [],
          dismissed: parsed.dismissed ?? false,
          firstDependencyId: parsed.firstDependencyId ?? null,
          _hydrated: true,
        });
        return;
      }
    } catch {}
    set({ _hydrated: true });
  },
}));

function persist(s: OnboardingState) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        current: s.current,
        context: s.context,
        completedSteps: s.completedSteps,
        dismissed: s.dismissed,
        firstDependencyId: s.firstDependencyId,
      })
    );
  } catch {}
}

export function nextStep(id: OnboardingStepId): OnboardingStepId | null {
  const idx = ORDER.indexOf(id);
  return idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
}
export function prevStep(id: OnboardingStepId): OnboardingStepId | null {
  const idx = ORDER.indexOf(id);
  return idx > 0 ? ORDER[idx - 1] : null;
}
export const STEP_ORDER = ORDER;
