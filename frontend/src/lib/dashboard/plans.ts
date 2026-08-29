import type { PlanId } from './types';

/**
 * Plan metadata — mirrors backend ``app.core.permissions`` exactly.
 *
 * The BACKEND is the single source of truth for enforcement (dependency
 * limits, check intervals, retention, team limits, feature flags). This
 * file exists only so the UI can render copy that always agrees with it.
 * Any disagreement between the two is a bug: fix both sides together.
 */
export interface PlanMeta {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  dependencies: number;
  teamMembers: number;
  minIntervalSeconds: number;
  retentionDays: number;
  alerts: string;
  evidence: boolean;
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
    dependencies: 3,
    teamMembers: 1,
    minIntervalSeconds: 60,
    retentionDays: 1,
    alerts: 'Email',
    evidence: false,
    clientGroups: false,
    whiteLabel: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Track more of your stack',
    priceMonthly: 19,
    dependencies: 10,
    teamMembers: 3,
    minIntervalSeconds: 60,
    retentionDays: 7,
    alerts: 'Email',
    evidence: false,
    clientGroups: false,
    whiteLabel: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'Investigate and prove failures',
    priceMonthly: 49,
    dependencies: 30,
    teamMembers: 5,
    minIntervalSeconds: 15,
    retentionDays: 30,
    alerts: 'Email + Slack',
    evidence: true,
    clientGroups: false,
    whiteLabel: false,
    badge: 'Most popular',
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Operate at team scale',
    priceMonthly: 99,
    dependencies: 100,
    teamMembers: 10,
    minIntervalSeconds: 5,
    retentionDays: 90,
    alerts: 'Email + Slack',
    evidence: true,
    clientGroups: false,
    whiteLabel: false,
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Reliability across your client portfolio',
    priceMonthly: 199,
    dependencies: 500,
    teamMembers: 25,
    minIntervalSeconds: 5,
    retentionDays: 90,
    alerts: 'Email + Slack',
    evidence: true,
    clientGroups: true,
    whiteLabel: true,
    badge: 'Built for agencies',
  },
];

const ORDER: PlanId[] = ['free', 'starter', 'standard', 'professional', 'agency'];

export function getPlan(id: string | undefined | null): PlanMeta {
  const found = PLANS.find((p) => p.id === (id || 'free').toLowerCase());
  return found ?? PLANS[0];
}

export function effectivePlan(plan: { plan?: string | null; effective_plan?: string | null } | null | undefined): PlanMeta {
  const id = plan?.effective_plan ?? plan?.plan ?? 'free';
  return getPlan(id);
}

export function effectivePlanId(
  plan: { plan?: string | null; effective_plan?: string | null } | null | undefined
): PlanId {
  return effectivePlan(plan).id;
}

export function nextPlan(id: string | undefined | null): PlanMeta {
  const current = getPlan(id);
  const idx = ORDER.indexOf(current.id);
  return PLANS[Math.min(idx + 1, ORDER.length - 1)];
}

export function hasEvidence(plan: string | undefined | null): boolean {
  return getPlan(plan).evidence;
}

export function hasSlackAlerts(plan: string | undefined | null): boolean {
  const p = getPlan(plan);
  return p.id === 'standard' || p.id === 'professional' || p.id === 'agency';
}

export function isPaid(plan: string | undefined | null): boolean {
  return getPlan(plan).id !== 'free';
}

export function hasEvidenceForOrg(
  plan: { plan?: string | null; effective_plan?: string | null } | null | undefined
): boolean {
  return effectivePlan(plan).evidence;
}

export function retentionLabel(days: number): string {
  if (days <= 1) return '24 hours';
  if (days % 30 === 0 && days > 28) return `${days / 30} months`;
  if (days % 7 === 0 && days > 7) return `${days / 7} weeks`;
  return `${days} days`;
}

export function intervalLabel(seconds: number): string {
  if (seconds >= 60) return `${Math.round(seconds / 60)}-minute checks`;
  return `${seconds}-second checks`;
}
