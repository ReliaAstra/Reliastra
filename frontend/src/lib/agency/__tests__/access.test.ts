import { describe, expect, it } from 'vitest';
import { hasAgencyWorkspace } from '../access';
import type { Organization, PlanDetails } from '@/lib/dashboard/types';

const org = (enabled: boolean) => ({ has_agency_mode: enabled } as Organization);
const plan = (id: 'free' | 'pro' | 'enterprise') => ({
  plan: id,
  effective_plan: id,
} as PlanDetails);
const trialPlan = () =>
  ({
    plan: 'free',
    effective_plan: 'pro',
  }) as PlanDetails;

describe('hasAgencyWorkspace', () => {
  it('allows an explicitly enabled organization on any plan', () => {
    expect(hasAgencyWorkspace(org(true), plan('free'))).toBe(true);
    expect(hasAgencyWorkspace(org(true), plan('pro'))).toBe(true);
  });

  it('allows a Pro organization without a separate capability flag', () => {
    expect(hasAgencyWorkspace(org(false), plan('pro'))).toBe(true);
  });

  it('allows an Enterprise organization without a separate capability flag', () => {
    expect(hasAgencyWorkspace(org(false), plan('enterprise'))).toBe(true);
  });

  it('allows a trial organization through its Pro effective plan', () => {
    expect(hasAgencyWorkspace(org(false), trialPlan())).toBe(true);
  });

  it('does not expose the workspace to an unflagged Free organization past its trial', () => {
    expect(hasAgencyWorkspace(org(false), plan('free'))).toBe(false);
  });

  it('fails closed while organization and entitlement state are unavailable', () => {
    expect(hasAgencyWorkspace(null, null)).toBe(false);
  });
});
