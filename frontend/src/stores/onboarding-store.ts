'use client';

import { create } from 'zustand';

/**
 * Observation configuration sequence state.
 *
 * The sequence is four stages and an activation surface:
 *
 *   01 ENVIRONMENT → 02 DEPENDENCY → 03 OBSERVATION → 04 CONFIRM → active
 *
 * What is persisted and what is not is a security decision, not a convenience
 * one: the draft endpoint, cadence and regions survive a reload, and request
 * HEADERS NEVER DO. Headers can carry an API token, and a monitoring product
 * has no business leaving one in localStorage - they live in component state
 * for the length of the sequence and are sent once, to be encrypted at rest by
 * the backend.
 */

export type OrgType = 'saas' | 'fintech' | 'ecommerce' | 'agency' | 'platform' | 'other' | '';
export type Concern =
  | 'availability'
  | 'visibility'
  | 'evidence'
  | 'accountability'
  | 'sla'
  | 'api'
  | '';
export type Scale = '1-5' | '6-20' | '21-50' | '50+' | '';

export type SequenceStageId =
  | 'environment'
  | 'dependency'
  | 'observation'
  | 'confirm'
  | 'active';

/** Legacy ids from the previous eight-step flow, mapped on hydration. */
const LEGACY_STAGE: Record<string, SequenceStageId> = {
  context: 'environment',
  dependency: 'dependency',
  validation: 'observation',
  'first-value': 'active',
  evidence: 'active',
  alerts: 'active',
  expand: 'active',
  complete: 'active',
};

export interface OnboardingContext {
  orgType: OrgType;
  concern: Concern;
  scale: Scale;
}

export interface ObservationDraft {
  name: string;
  endpointUrl: string;
  method: 'GET' | 'HEAD' | 'POST';
  expectedStatusCodes: number[];
  regions: string[];
  checkIntervalSeconds: number;
  timeoutSeconds: number;
  alertThresholdMs: number | null;
  /** The public vendor record this was prefilled from, when it was. */
  sourceVendor: string | null;
}

export const EMPTY_DRAFT: ObservationDraft = {
  name: '',
  endpointUrl: '',
  method: 'GET',
  expectedStatusCodes: [200],
  regions: ['us-east', 'eu-west'],
  checkIntervalSeconds: 300,
  timeoutSeconds: 10,
  alertThresholdMs: null,
  sourceVendor: null,
};

interface SequenceState {
  current: SequenceStageId;
  context: OnboardingContext;
  draft: ObservationDraft;
  completedStages: SequenceStageId[];
  dismissed: boolean;
  firstDependencyId: string | null;
  _hydrated: boolean;
  setCurrent: (id: SequenceStageId) => void;
  setContext: (c: Partial<OnboardingContext>) => void;
  setDraft: (d: Partial<ObservationDraft>) => void;
  markComplete: (id: SequenceStageId) => void;
  setFirstDependency: (id: string | null) => void;
  dismiss: () => void;
  reset: () => void;
  hydrate: () => void;
}

export const STAGE_ORDER: SequenceStageId[] = [
  'environment',
  'dependency',
  'observation',
  'confirm',
  'active',
];

const LS_KEY = 'reliastra_onboarding_v3';

export const useOnboardingStore = create<SequenceState>((set, get) => ({
  current: 'environment',
  context: { orgType: '', concern: '', scale: '' },
  draft: EMPTY_DRAFT,
  completedStages: [],
  dismissed: false,
  firstDependencyId: null,
  _hydrated: false,

  setCurrent: (current) => {
    set({ current });
    persist(get());
  },
  setContext: (partial) => {
    set({ context: { ...get().context, ...partial } });
    persist(get());
  },
  setDraft: (partial) => {
    set({ draft: { ...get().draft, ...partial } });
    persist(get());
  },
  markComplete: (id) => {
    set({ completedStages: Array.from(new Set([...get().completedStages, id])) });
    persist(get());
  },
  setFirstDependency: (firstDependencyId) => {
    set({ firstDependencyId });
    persist(get());
  },
  dismiss: () => {
    set({ dismissed: true });
    persist(get());
  },
  reset: () => {
    set({
      current: 'environment',
      context: { orgType: '', concern: '', scale: '' },
      draft: EMPTY_DRAFT,
      completedStages: [],
      dismissed: false,
      firstDependencyId: null,
    });
    persist(get());
  },
  hydrate: () => {
    if (get()._hydrated) return;
    try {
      const raw =
        localStorage.getItem(LS_KEY) ?? localStorage.getItem('reliastra_onboarding_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        const stored = String(parsed.current ?? 'environment');
        set({
          current: (STAGE_ORDER as string[]).includes(stored)
            ? (stored as SequenceStageId)
            : (LEGACY_STAGE[stored] ?? 'environment'),
          context: parsed.context ?? { orgType: '', concern: '', scale: '' },
          draft: { ...EMPTY_DRAFT, ...(parsed.draft ?? {}) },
          completedStages: Array.isArray(parsed.completedStages) ? parsed.completedStages : [],
          dismissed: parsed.dismissed ?? false,
          firstDependencyId: parsed.firstDependencyId ?? null,
          _hydrated: true,
        });
        return;
      }
    } catch {
      /* a corrupt draft is not worth breaking setup over */
    }
    set({ _hydrated: true });
  },
}));

function persist(s: SequenceState) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        current: s.current,
        context: s.context,
        // Headers are intentionally absent from the draft type, so nothing
        // secret can reach storage through this path.
        draft: s.draft,
        completedStages: s.completedStages,
        dismissed: s.dismissed,
        firstDependencyId: s.firstDependencyId,
      })
    );
  } catch {
    /* storage disabled - the sequence still works, it just will not resume */
  }
}

export function nextStage(id: SequenceStageId): SequenceStageId | null {
  const i = STAGE_ORDER.indexOf(id);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export function prevStage(id: SequenceStageId): SequenceStageId | null {
  const i = STAGE_ORDER.indexOf(id);
  return i > 0 ? STAGE_ORDER[i - 1] : null;
}
