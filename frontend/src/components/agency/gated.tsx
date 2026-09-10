'use client';

import Link from 'next/link';
import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { PUBLIC_ROUTES } from '@/lib/routes';
import { Fact, PageHead, Section } from '@/components/console/primitives';

/**
 * The gated agency operations experience.
 *
 * Rendered for every authenticated organization that does not satisfy the
 * entitlement rule (`hasAgencyWorkspace`). This is a capability preview, not
 * an error state and not an upgrade funnel: it states what agency operations
 * is, how it is structured, exactly who it is available to, and how to
 * engage RELIASTRA about it.
 *
 * Rules it keeps:
 * - No fabricated clients, uptime, incident counts or telemetry. The only
 *   "preview" is structural, and it is labelled as such.
 * - No price, no self-serve Enterprise checkout (Enterprise is
 *   contact-sales only), no urgency, no consumer-style copy.
 * - Every action lands on a real existing route: contact, pricing.
 */

const CAPABILITIES: Array<{ name: string; detail: string }> = [
  {
    name: 'Multi-client operational overview',
    detail:
      'Posture, availability and open incidents for every client environment, in one view ordered by what needs attention.',
  },
  {
    name: 'Isolated client environments',
    detail:
      "Each client's applications, monitors, incidents and evidence are scoped to that client and to nothing else.",
  },
  {
    name: 'Cross-client incident prioritization',
    detail:
      'Open incidents across the portfolio, attributed to the client whose monitor detected them.',
  },
  {
    name: 'Evidence and reports attributed by client',
    detail:
      'Incident evidence is generated, checksummed and labelled for the client it protects.',
  },
  {
    name: 'Unassigned-monitor detection',
    detail:
      'Monitors not attached to any client application are surfaced for assignment.',
  },
  {
    name: 'Shareable client-facing reliability portal',
    detail:
      'A signed, read-only portal covering the organization’s client environments.',
  },
  {
    name: 'Enterprise controls and scalable monitoring',
    detail:
      'The Enterprise plan’s custom limits, retention and monitoring controls.',
  },
  {
    name: 'Clear organization and client scope',
    detail:
      "The console states at all times whether you are operating your own stack or a client's.",
  },
];

/**
 * The structural preview: the hierarchy agency operations adds on top of the
 * console, drawn as an outline with no names, counts or measurements. It is
 * explicitly presented as a capability preview so it can never be read as
 * live customer data.
 */
function StructurePreview() {
  const row = (label: string, bar: number, depth = 0) => (
    <div
      className={`flex items-center gap-3 border-b border-[var(--obc-line)] py-2.5 last:border-b-0 ${
        depth ? 'pl-8' : ''
      }`}
      aria-hidden
    >
      <span className="w-[150px] shrink-0 text-[11.5px] text-[var(--obc-text-4)]">
        {label}
      </span>
      <span
        className="h-1.5 rounded-[1px] bg-[var(--obc-raised)]"
        style={{ width: `${bar}%` }}
      />
    </div>
  );

  return (
    <div className="border border-[var(--obc-line)] bg-[var(--obc-base)]">
      <div className="flex items-center justify-between border-b border-[var(--obc-line-2)] px-4 py-2.5">
        <p className="obc-label">Capability preview</p>
        <p className="text-[11px] text-[var(--obc-text-4)]">
          Structural outline. No client data, no live measurements.
        </p>
      </div>
      <div className="px-4 py-1.5" role="img" aria-label="Structural outline of the client hierarchy: an organization containing client environments, each containing applications, each containing monitors, with incidents and evidence attributed down that chain.">
        {row('Organization', 42)}
        {row('Client environment', 64, 0)}
        {row('Application', 52, 1)}
        {row('Monitors', 38, 2)}
        {row('Incidents & evidence', 30, 2)}
        {row('Client environment', 58, 0)}
      </div>
    </div>
  );
}

export function AgencyGatedExperience() {
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);

  return (
    <>
      <PageHead
        eyebrow="Agency operations"
        title="Manage every client environment from one operational view"
        meta={
          <>
            <Fact label="Organization" value={org?.name ?? 'This organization'} mono={false} />
            <Fact label="Agency operations" value="Not enabled" mono={false} />
            <Fact label="Plan" value={current.name} mono={false} />
          </>
        }
        actions={
          <>
            <Link href={PUBLIC_ROUTES.contact} className="obc-btn obc-btn-primary">
              Talk to RELIASTRA
            </Link>
            <Link href={PUBLIC_ROUTES.pricing} className="obc-btn">
              Review Enterprise capabilities
            </Link>
          </>
        }
      />

      <p className="mt-6 max-w-[72ch] text-[13.5px] leading-[1.75] text-[var(--obc-text-2)]">
        Separate each client’s applications, monitors, incidents and evidence
        while maintaining a unified view of operational risk across your
        portfolio.
      </p>

      <Section
        title="What agency operations includes"
        hint="The capabilities a multi-client organization operates, each already backed by a real part of the product."
        id="agency-capabilities"
      >
        <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.name}>
              <dt className="text-[13px] font-medium text-[var(--obc-text)]">
                {c.name}
              </dt>
              <dd className="mt-1.5 max-w-[52ch] text-[12.5px] leading-[1.65] text-[var(--obc-text-3)]">
                {c.detail}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="How the console is organized"
        hint="The client hierarchy is added on top of your existing console; nothing already recorded is moved or re-scoped."
        id="agency-structure"
      >
        <StructurePreview />
        <p className="mt-3 max-w-[72ch] text-[12px] leading-[1.65] text-[var(--obc-text-4)]">
          Your monitors, incidents and evidence records are unaffected either
          way. Each client environment groups its own applications and
          monitors, and rolls up its own availability, incidents and evidence.
        </p>
      </Section>

      <Section
        title="Availability"
        id="agency-availability"
      >
        <div className="max-w-[72ch] space-y-4 text-[13px] leading-[1.7] text-[var(--obc-text-2)]">
          <p>
            Agency operations is available to Enterprise organizations and
            organizations explicitly enabled by RELIASTRA.
          </p>
          <p className="text-[12.5px] leading-[1.65] text-[var(--obc-text-3)]">
            Enterprise is engaged through RELIASTRA sales; there is no
            self-serve checkout for it. Your current plan, monitors and
            recorded evidence are not affected by this page.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--obc-line)] pt-5">
          <Link href={PUBLIC_ROUTES.contact} className="obc-btn obc-btn-primary">
            Talk to RELIASTRA
          </Link>
          <Link href={PUBLIC_ROUTES.pricing} className="obc-btn">
            Review Enterprise capabilities
          </Link>
        </div>
      </Section>
    </>
  );
}
