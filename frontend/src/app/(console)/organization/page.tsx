'use client';

import { AgencyPortfolioPage } from '@/components/agency/portfolio';

/**
 * Parent-level operational view for an agency organization.
 * Client records remain canonical under /clients; this route establishes the
 * organization itself as a first-class destination in the console hierarchy.
 */
export default function OrganizationPage() {
  return <AgencyPortfolioPage organizationOverview />;
}
