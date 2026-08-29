import type { PlanId } from './types';

/**
 * Plan metadata — mirrors backend ``app.core.permissions`` exactly.
 *
 * The BACKEND is the single source of truth for enforcement (dependency
 * limits, check intervals, retention, team limits, feature flags). This
 * file exists only so the UI can render copy that always agrees with it.
 * Any disagreement between the two is a bug: fix both sides together.
 *
 * Canonical 3-tier architecture: FREE → PRO → ENTERPRISE.
 */
export interface PlanMeta {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price in USD. Enterprise is custom => null (never display a number). */
  priceMonthly: number | null;
  /** Annual price in USD. Enterprise is custom => null. */
  priceAnnual: number | null;
  dependencies: number | null;
  teamMembers: number | null;
  minIntervalSeconds: number | null;
  retentionDays: number | null;
  alerts: string;
  slackAlerts: boolean;
  api: boolean;
  attribution: boolean;
  evidence: boolean;
  historicalAnalysis: boolean;
  clientGroups: boolean;
  whiteLabel: boolean;
  clientReports: boolean;
  customBrandedEvidence: boolean;
  badge?: string;
  /** "self_serve" or "contact_sales". */
  billingAvailability: 'self_serve' | 'contact_sales';
  isEnterprise: boolean;
  isCustomPricing: boolean;
}

export const PLANS: PlanMeta[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For trying RELIASTRA',
    priceMonthly: 0,
    priceAnnual: 0,
    dependencies: 3,
    teamMembers: 1,
    minIntervalSeconds: 60,
    retentionDays: 1,
    alerts: 'Email',
    slackAlerts: false,
    api: false,
    attribution: false,
    evidence: false,
    historicalAnalysis: false,
    clientGroups: false,
    whiteLabel: false,
    clientReports: false,
    customBrandedEvidence: false,
    billingAvailability: 'self_serve',
    isEnterprise: false,
    isCustomPricing: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing SaaS teams and agencies',
    priceMonthly: 39,
    priceAnnual: 390,
    dependencies: 50,
    teamMembers: 10,
    minIntervalSeconds: 15,
    retentionDays: 90,
    alerts: 'Email + Slack',
    slackAlerts: true,
    api: true,
    attribution: true,
    evidence: true,
    historicalAnalysis: true,
    clientGroups: false,
    whiteLabel: false,
    clientReports: false,
    customBrandedEvidence: false,
    badge: 'Most Popular',
    billingAvailability: 'self_serve',
    isEnterprise: false,
    isCustomPricing: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For organizations requiring advanced controls, scale and custom requirements',
    priceMonthly: null,
    priceAnnual: null,
    dependencies: null,
    teamMembers: null,
    minIntervalSeconds: null,
    retentionDays: null,
    alerts: 'Email + Slack',
    slackAlerts: true,
    api: true,
    attribution: true,
    evidence: true,
    historicalAnalysis: true,
    clientGroups: true,
    whiteLabel: true,
    clientReports: true,
    customBrandedEvidence: true,
    billingAvailability: 'contact_sales',
    isEnterprise: true,
    isCustomPricing: true,
  },
];

const ORDER: PlanId[] = ['free', 'pro', 'enterprise'];

/** Canonical plan order used by marketing/dashboard renderers. */
export const ALL_PLANS: PlanId[] = ['free', 'pro', 'enterprise'];

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
  return getPlan(plan).slackAlerts;
}

export function isPaid(plan: string | undefined | null): boolean {
  const p = getPlan(plan);
  return p.id === 'pro' || p.id === 'enterprise';
}

export function isEnterprise(plan: string | undefined | null): boolean {
  return getPlan(plan).isEnterprise;
}

export function hasEvidenceForOrg(
  plan: { plan?: string | null; effective_plan?: string | null } | null | undefined
): boolean {
  return effectivePlan(plan).evidence;
}

/** Monthly price string; null for custom-pricing (enterprise) plans. */
export function monthlyPrice(plan: PlanMeta): string | null {
  return plan.priceMonthly === null ? null : `$${plan.priceMonthly}`;
}

/** Annual price string; null for custom-pricing (enterprise) plans. */
export function annualPrice(plan: PlanMeta): string | null {
  return plan.priceAnnual === null ? null : `$${plan.priceAnnual}`;
}

export function retentionLabel(days: number | null | undefined): string {
  if (days == null) return 'Custom';
  if (days <= 1) return '24 hours';
  if (days % 30 === 0 && days > 28) return `${days / 30} months`;
  if (days % 7 === 0 && days > 7) return `${days / 7} weeks`;
  return `${days} days`;
}

export function intervalLabel(seconds: number | null | undefined): string {
  if (seconds == null) return 'Custom';
  if (seconds >= 60) return `${Math.round(seconds / 60)}-minute checks`;
  return `${seconds}-second checks`;
}

export function dependencyLabel(count: number | null | undefined): string {
  if (count == null) return 'Custom';
  return `${count} monitored dependencies`;
}

export function seatLabel(count: number | null | undefined): string {
  if (count == null) return 'Unlimited';
  return `${count} ${count === 1 ? 'seat' : 'seats'}`;
}
