import type { Organization, PlanDetails } from '@/lib/dashboard/types';
import { hasAgencyWorkspace } from './access';

/**
 * One destination model for the whole authenticated console.
 *
 * The desktop rail, the mobile sheet, the command palette and the recent
 * destinations all render from this list, so no surface can start advertising
 * a destination another one does not serve. The entitlement decision itself
 * is `hasAgencyWorkspace` (see `./access`); this file only decides which
 * destinations a given entitlement reveals.
 *
 * The Agencies group is a destination for every authenticated customer
 * organization: the agency overview is always present. The client-management
 * destinations appear only when the capability is enabled for the
 * organization; their routes still exist and render the gated state for a
 * direct navigation.
 */

export interface ConsoleNavItem {
  href: string;
  label: string;
}

export interface ConsoleNavGroup {
  /** Empty label = items render without a group heading (the root entry). */
  label: string;
  items: ConsoleNavItem[];
}

/** Canonical destinations of the Agencies group, in display order. */
export function agenciesNavItems(
  org: Organization | null | undefined,
  plan: PlanDetails | null | undefined
): ConsoleNavItem[] {
  const agencyEnabled = hasAgencyWorkspace(org, plan);
  return [
    { href: '/agency', label: 'Agency overview' },
    ...(agencyEnabled
      ? [
          { href: '/clients', label: 'Client environments' } satisfies ConsoleNavItem,
          {
            href: '/clients/onboarding',
            label: 'Add client environment',
          } satisfies ConsoleNavItem,
        ]
      : []),
  ];
}

export function consoleNavGroups(
  org: Organization | null | undefined,
  plan: PlanDetails | null | undefined
): ConsoleNavGroup[] {
  return [
    { label: '', items: [{ href: '/dashboard', label: 'Overview' }] },
    {
      label: 'Monitoring',
      items: [
        { href: '/dependencies', label: 'Dependencies' },
        { href: '/incidents', label: 'Incidents' },
      ],
    },
    {
      label: 'Evidence',
      items: [
        { href: '/evidence', label: 'Evidence records' },
        { href: '/reports', label: 'Reports' },
      ],
    },
    {
      label: 'Agencies',
      items: agenciesNavItems(org, plan),
    },
    {
      label: 'Account',
      items: [
        { href: '/settings', label: 'Settings' },
        { href: '/settings/billing', label: 'Billing' },
        { href: '/settings/notifications', label: 'Notifications' },
        { href: '/support', label: 'Support' },
      ],
    },
  ];
}
