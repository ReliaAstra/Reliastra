import type { PlanId } from './types';

export interface PlanMeta {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceAnnual: number;
  dependencies: number;
  retention: string;
  alerts: string;
  evidence: boolean;
  api: boolean;
  seats: string;
  clientGroups: boolean;
  whiteLabel: boolean;
  badge?: string;
}

export const PLANS: PlanMeta[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Start measuring',
    priceMonthly: 0,
    priceAnnual: 0,
    dependencies: 3,
    retention: '24h',
    alerts: 'Email',
    evidence: false,
    api: false,
    seats: '1',
    clientGroups: false,
    whiteLabel: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Track more',
    priceMonthly: 19,
    priceAnnual: 190,
    dependencies: 10,
    retention: '7 days',
    alerts: 'Email',
    evidence: false,
    api: false,
    seats: '1',
    clientGroups: false,
    whiteLabel: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'Investigate + Prove',
    priceMonthly: 49,
    priceAnnual: 490,
    dependencies: 30,
    retention: '30 days',
    alerts: 'Email, Slack, PagerDuty',
    evidence: true,
    api: true,
    seats: '1',
    clientGroups: false,
    whiteLabel: false,
    badge: 'Most popular',
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Operate at scale',
    priceMonthly: 99,
    priceAnnual: 990,
    dependencies: 100,
    retention: '90 days',
    alerts: 'All channels',
    evidence: true,
    api: true,
    seats: '5',
    clientGroups: false,
    whiteLabel: false,
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Built for Agencies',
    priceMonthly: 199,
    priceAnnual: 1990,
    dependencies: 500,
    retention: '90 days',
    alerts: 'All channels',
    evidence: true,
    api: true,
    seats: 'Unlimited',
    clientGroups: true,
    whiteLabel: true,
    badge: 'BUILT FOR AGENCIES',
  },
];

const ORDER: PlanId[] = ['free', 'starter', 'standard', 'professional', 'agency'];

export function getPlan(id: string | undefined | null): PlanMeta {
  const found = PLANS.find((p) => p.id === (id || 'free').toLowerCase());
  return found ?? PLANS[0];
}

export function nextPlan(id: string | undefined | null): PlanMeta {
  const current = getPlan(id);
  const idx = ORDER.indexOf(current.id);
  return PLANS[Math.min(idx + 1, ORDER.length - 1)];
}

export function annualSavings(plan: PlanMeta): number {
  return plan.priceMonthly * 12 - plan.priceAnnual;
}

export function hasEvidence(plan: string | undefined | null): boolean {
  return getPlan(plan).evidence;
}

export function hasApiAccess(plan: string | undefined | null): boolean {
  return getPlan(plan).api;
}

export function hasSlackAlerts(plan: string | undefined | null): boolean {
  const p = getPlan(plan);
  return p.id === 'standard' || p.id === 'professional' || p.id === 'agency';
}

export function isPaid(plan: string | undefined | null): boolean {
  return getPlan(plan).id !== 'free';
}

export function retentionDays(plan: string | undefined | null): number {
  const map: Record<PlanId, number> = {
    free: 1,
    starter: 7,
    standard: 30,
    professional: 90,
    agency: 90,
  };
  return map[getPlan(plan).id];
}
