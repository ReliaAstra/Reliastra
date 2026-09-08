import Link from 'next/link';
import {
  CTA,
  CTABand,
  Container,
  Eyebrow,
  Section,
  SectionHeader,
  StateIndicator,
} from '@/components/site/primitives';
import { SiteShell } from '@/components/site/site-shell';
import { AUTH_ROUTES, CONSOLE_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { PLANS } from '@/lib/dashboard/plans';
import { PLAN_CAPABILITIES } from '@/components/site/plan-data';
import { cn } from '@/lib/utils';

/**
 * /agencies
 *
 * A high-conviction sales page for the buyers RELIASTRA already serves in the
 * product but understates on the public site: agencies, MSPs, infrastructure
 * consultants and system integrators who operate client stacks.
 *
 * The claim of the page is narrow and testable: when a client's infrastructure
 * fails, RELIASTRA gives the operator an independent record of what happened.
 * Monitoring is treated as the mechanism, never the product. The page reuses
 * the site primitives and the real entitlement table; it does not invent a
 * capability the backend does not grant.
 */

const STEPS = [
  {
    n: '01',
    title: 'Create a client environment',
    body: 'One row per organization you operate.',
  },
  {
    n: '02',
    title: 'Attach applications and monitors',
    body: 'Each client owns its checks, incidents and evidence.',
  },
  {
    n: '03',
    title: 'Track incidents and dependencies',
    body: 'Operational, degraded and critical roll up per environment.',
  },
  {
    n: '04',
    title: 'Determine what failed',
    body: 'Incident → dependency → application → client attribution.',
  },
  {
    n: '05',
    title: 'Generate and share evidence',
    body: 'Timestamped, checksummed records from the same timeline.',
  },
  {
    n: '06',
    title: 'Hand the client a report',
    body: 'A professional explanation, not a recollection.',
  },
] as const;

const CONSOLE_ROWS = [
  {
    client: 'Meridian Commerce',
    status: 'critical' as const,
    apps: '3',
    deps: '8',
    uptime: '97.40%',
    incidents: '2',
    last: '4m ago',
  },
  {
    client: 'Beacon Ledger',
    status: 'degraded' as const,
    apps: '2',
    deps: '6',
    uptime: '99.02%',
    incidents: '1',
    last: '1h ago',
  },
  {
    client: 'Atlas Commerce',
    status: 'healthy' as const,
    apps: '4',
    deps: '9',
    uptime: '99.98%',
    incidents: '0',
    last: 'none recorded',
  },
] as const;

const PORTAL_FLOW = [
  { label: 'Incident detected', value: 'quorum across regions' },
  { label: 'Evidence collected', value: 'per-region observations' },
  { label: 'Dependency identified', value: 'correlated timeline' },
  { label: 'Client receives report', value: 'portal + signed artifact' },
] as const;

const CAPABILITY_LABELS = [
  'Email alerts',
  'Incident detection',
  'Deterministic attribution',
  'Evidence generation',
  'Historical analysis',
  'Client groups & isolation',
  'Client-facing reports',
  'White-label branding',
  'Custom-branded evidence',
] as const;

export function AgenciesPage() {
  const tiers = [PLANS[0], PLANS[1], PLANS[2]];
  const capabilities = CAPABILITY_LABELS.map((label) => {
    const cap = PLAN_CAPABILITIES.find((c) => c.label === label);
    return {
      label,
      tiers: tiers.map((plan) => Boolean(cap?.get(plan))),
    };
  });

  return (
    <SiteShell>
      {/* ── 01 · Hero ─────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <Container className="py-20 md:py-28 lg:py-32">
          <div className="max-w-[880px]">
            <Eyebrow index="01" signal className="mb-8">
              For agencies · MSPs · consultants
            </Eyebrow>
            <h1 className="ob-display max-w-[15ch]">
              Your client&apos;s outage
              <br />
              becomes your problem.
            </h1>
            <p className="ob-h2 mt-8 max-w-[24ch]">
              Prove what happened.
            </p>
            <p className="ob-body-lg mt-6 max-w-[58ch]">
              RELIASTRA gives agencies the infrastructure evidence they need to
              investigate incidents, identify dependency failures, and
              communicate clearly with clients.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <CTA href={AUTH_ROUTES.signup} tone="signal">
                Create your workspace
              </CTA>
              <CTA href="#how-it-works" tone="outline">
                See how it works
              </CTA>
            </div>
          </div>
        </Container>
      </header>

      {/* ── 02 · The agency workflow ─────────────────────────────────────── */}
      <Section
        id="how-it-works"
        tone="base"
        aria-labelledby="agency-workflow-title"
      >
        <Container>
          <SectionHeader
            index="02"
            eyebrow="The agency workflow"
            id="agency-workflow-title"
            title="Client → Applications → Dependencies → Incident → Evidence → Client-facing report"
            lede="RELIASTRA is arranged around the work an agency already does, not around a monitoring dashboard viewed for its own sake."
          />

          <ol className="mt-14 border-t border-[var(--ob-line)]">
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                className={cn(
                  'grid gap-4 border-b border-[var(--ob-line)] py-6 sm:grid-cols-[72px_240px_minmax(0,1fr)] sm:gap-8',
                )}
              >
                <span className="font-[family-name:var(--ob-font-mono)] text-[13px] tabular-nums text-[var(--ob-signal)]">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                    {step.title}
                  </h3>
                </div>
                <p className="text-[14px] leading-[1.65] text-[var(--ob-text-3)] sm:pt-0.5">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ── 03 · The agency console ──────────────────────────────────────── */}
      <Section
        id="console"
        tone="void"
        aria-labelledby="console-title"
      >
        <Container>
          <div className="grid gap-14 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:gap-20">
            <div className="flex flex-col gap-6 xl:sticky xl:top-[112px] xl:self-start">
              <SectionHeader
                index="03"
                eyebrow="The agency console"
                id="console-title"
                title="Client environments."
                lede="The console is a rollup of the infrastructure you operate, ordered by who needs you right now. It is not a second monitoring tool."
              />
              <dl className="flex flex-col gap-4">
                <DLRow
                  term="Posture"
                  desc="Rolled-up availability, degradation and critical states across every client environment."
                />
                <DLRow
                  term="Attribution"
                  desc="Open incidents walk from dependency to application to client, so the accountable party is visible."
                />
                <DLRow
                  term="Evidence"
                  desc="Recent reports by client, with the incident that produced each one."
                />
                <DLRow
                  term="Unassigned monitors"
                  desc="Monitors that belong to no client stay visible until they are assigned, never silently hidden."
                />
              </dl>
              <div>
                <p className="ob-small max-w-[54ch] border-t border-[var(--ob-line)] pt-5">
                  Client environments, client-facing reports and white-label
                  branding are Enterprise capabilities. See the{' '}
                  <Link href={PUBLIC_ROUTES.pricing} className="ob-link">
                    entitlement table
                  </Link>{' '}
                  below before you claim them in a proposal.
                </p>
              </div>
            </div>

            <AgencyConsolePreview />
          </div>
        </Container>
      </Section>

      {/* ── 04 · The artifact you hand over ──────────────────────────────── */}
      <Section
        id="client-portal"
        tone="base"
        aria-labelledby="portal-title"
      >
        <Container>
          <SectionHeader
            index="04"
            eyebrow="Client portal"
            id="portal-title"
            title="The artifact you hand to your client."
            lede="After an incident, the agency can provide a professional, evidence-backed view of what happened instead of screenshots, guesses or a long explanation."
          />

          <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-20">
            <ol className="flex flex-col border-t border-[var(--ob-line)]">
              {PORTAL_FLOW.map((item, i) => (
                <li
                  key={item.label}
                  className="grid gap-2 border-b border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-8"
                >
                  <span className="font-[family-name:var(--ob-font-mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--ob-text-4)]">
                    {String(i + 1).padStart(2, '0')} · {item.label}
                  </span>
                  <span className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
                    {item.value}
                  </span>
                </li>
              ))}
            </ol>

            <div className="border border-[var(--ob-line)] bg-[var(--ob-void)]">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--ob-line)] px-5 py-4">
                <div>
                  <p className="ob-label">Client portal</p>
                  <p className="mt-1.5 text-[14px] font-semibold text-[var(--ob-text)]">
                    Meridian Commerce · Service reliability portal
                  </p>
                </div>
                <span className="font-[family-name:var(--ob-font-mono)] text-[11px] text-[var(--ob-text-4)]">
                  Generated 14:42 UTC
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px border-b border-[var(--ob-line)] sm:grid-cols-4">
                {[
                  ['Clients', '4'],
                  ['Services monitored', '23'],
                  ['Average uptime · 24h', '99.61%'],
                  ['Open incidents', '1'],
                ].map(([label, value]) => (
                  <div key={label} className="px-5 py-5">
                    <p className="ob-label mb-3">{label}</p>
                    <p className="font-[family-name:var(--ob-font-mono)] text-[22px] leading-none tabular-nums text-[var(--ob-text)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-5">
                <div>
                  <StateIndicator state="healthy" label="Operational" />
                  <p className="ob-small mt-1">Northwind Retail · 3 services observed</p>
                </div>
                <span className="ob-label text-right">
                  /portal/{'{share_token}'}
                </span>
              </div>
              <div className="flex flex-col gap-2 border-t border-[var(--ob-line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="ob-small">Signed data · unauthenticated by design · print-ready</span>
                <Link
                  href={PUBLIC_ROUTES.docsEvidence}
                  className="ob-link text-[12px]"
                >
                  Evidence documentation
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── 05 · Entitlements ─────────────────────────────────────────────── */}
      <Section id="entitlements" tone="void" aria-labelledby="entitlements-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <SectionHeader
                index="05"
                eyebrow="Entitlements"
                id="entitlements-title"
                title="What your plan actually grants."
                lede="These rows are the same entitlement table the pricing page renders. Nobody has to guess what is included."
              />
              <dl className="mt-2 flex flex-col gap-4">
                <DLRow
                  term="Pro"
                  desc="Self-serve. Attribution, evidence and API access for one organization."
                />
                <DLRow
                  term="Enterprise"
                  desc="Client isolation, client-facing reports, portals and white-label evidence."
                />
              </dl>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-t border-[var(--ob-line)]">
                <thead>
                  <tr className="border-b border-[var(--ob-line)]">
                    <th scope="col" className="ob-label py-4 pr-6 text-left">
                      Capability
                    </th>
                    {['Free', 'Pro', 'Enterprise'].map((p) => (
                      <th
                        key={p}
                        scope="col"
                        className="ob-label px-4 py-4 text-center"
                      >
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {capabilities.map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-[var(--ob-line)]"
                    >
                      <td className="py-4 pr-6 text-[13.5px] text-[var(--ob-text-2)]">
                        {row.label}
                      </td>
                      {row.tiers.map((granted, i) => (
                        <td
                          key={i}
                          className="px-4 py-4 text-center font-[family-name:var(--ob-font-mono)] text-[13px] text-[var(--ob-text-3)]"
                        >
                          {granted ? 'yes' : '·'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="ob-small mt-5 max-w-[54ch]">
                Free and Pro include the monitoring side by default. Client
                isolation, portals and white-label are Enterprise capabilities,
                reflected here from the same source the backend enforces.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── 06 · Agency customer, not partner ─────────────────────────────── */}
      <Section id="distinction" tone="base" aria-labelledby="distinction-title">
        <Container>
          <SectionHeader
            index="06"
            eyebrow="Agency customer · separate from Partner"
            id="distinction-title"
            title="Two different relationships."
            lede="Using RELIASTRA to operate client infrastructure is a customer relationship. Referring organizations and earning commission is a partner relationship. The page you are on is for the first."
          />

          <div className="mt-14 grid gap-px border border-[var(--ob-line)] bg-[var(--ob-line)] sm:grid-cols-2">
            <div className="bg-[var(--ob-void)] p-7">
              <p className="ob-label mb-5">Agency customer</p>
              <h3 className="ob-h4 mb-3 text-[var(--ob-text)]">
                You run it for your clients.
              </h3>
              <p className="text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                Create client environments, attach their applications and
                monitors, and hand over reports and portals when they need to
                understand what happened.
              </p>
              <div className="mt-6">
                <CTA href={AUTH_ROUTES.signup} tone="primary" size="sm">
                  Create your workspace
                </CTA>
              </div>
            </div>
            <div className="bg-[var(--ob-void)] p-7">
              <p className="ob-label mb-5">RELIASTRA Partner</p>
              <h3 className="ob-h4 mb-3 text-[var(--ob-text)]">
                You refer and earn commission.
              </h3>
              <p className="text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                Point the organizations you advise to RELIASTRA through a
                tracked link and earn recurring commission on accounts you
                bring in.
              </p>
              <div className="mt-6">
                <CTA href={PUBLIC_ROUTES.partner} tone="outline" size="sm">
                  Explore the Partner Network
                </CTA>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-[var(--ob-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] text-[var(--ob-text-2)]">
              Already helping companies adopt infrastructure tools?
            </p>
            <Link href={PUBLIC_ROUTES.partner} className="ob-link text-[13px]">
              Explore the RELIASTRA Partner Network
            </Link>
          </div>
        </Container>
      </Section>

      {/* ── 07 · Close ───────────────────────────────────────────────────── */}
      <CTABand
        title="Stop arguing about who caused the outage. Show the evidence."
        body="Create a workspace, add the endpoints your clients depend on, and keep the record when the next vendor incident lands."
        primary={{ href: AUTH_ROUTES.signup, label: 'Create your workspace' }}
        secondary={{ href: PUBLIC_ROUTES.pricing, label: 'See pricing' }}
        tone="void"
      />
    </SiteShell>
  );
}

/* ── Small local pieces ──────────────────────────────────────────────────── */

function DLRow({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="border-t border-[var(--ob-line)] py-4">
      <dt className="ob-label mb-2">{term}</dt>
      <dd className="text-[14px] leading-[1.6] text-[var(--ob-text-3)]">
        {desc}
      </dd>
    </div>
  );
}

/**
 * A static rendering of the /clients agency console.
 *
 * The real console is authenticated and client-side. Marketing cannot render
 * a customer's data, so this is an illustrative view using the same column
 * structure, labels, state words and attribution language as the product.
 */
function AgencyConsolePreview() {
  return (
    <div className="border border-[var(--ob-line)] bg-[var(--ob-void)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ob-line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="ob-label">Agency operations · Client environments</p>
        <span className="ob-label normal-case tracking-[0.05em] text-[var(--ob-signal)]">
          Representative view
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-[var(--ob-line)] sm:grid-cols-4">
        {[
          ['Environments', '4'],
          ['Dependencies observed', '23'],
          ['Unassigned monitors', '2'],
          ['Rollup availability', '99.61%'],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-5">
            <p className="ob-label mb-3">{label}</p>
            <p className="font-[family-name:var(--ob-font-mono)] text-[22px] leading-none tabular-nums text-[var(--ob-text)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-px xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="min-w-0 overflow-x-auto border-b border-[var(--ob-line)] xl:border-b-0 xl:border-r">
          <div className="grid min-w-[760px] grid-cols-[minmax(0,1.5fr)_110px_60px_70px_90px_70px_90px] gap-2 border-b border-[var(--ob-line)] px-5 py-3 xl:min-w-0">
            {[
              'Client environment',
              'Status',
              'Apps',
              'Deps',
              'Availability',
              'Incidents',
              'Last',
            ].map((h) => (
              <span key={h} className="ob-label">
                {h}
              </span>
            ))}
          </div>
          {CONSOLE_ROWS.map((row) => (
            <div
              key={row.client}
              className="grid min-w-[760px] grid-cols-[minmax(0,1.5fr)_110px_60px_70px_90px_70px_90px] items-center gap-2 border-b border-[var(--ob-line)] px-5 py-4 last:border-b-0 xl:min-w-0"
            >
              <span className="truncate text-[13px] font-medium text-[var(--ob-text)]">
                {row.client}
              </span>
              <StateIndicator state={row.status} />
              <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--ob-text-3)]">
                {row.apps}
              </span>
              <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--ob-text-3)]">
                {row.deps}
              </span>
              <span
                className={cn(
                  'font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums',
                  row.status === 'critical'
                    ? 'text-[var(--ob-critical)]'
                    : row.status === 'degraded'
                      ? 'text-[var(--ob-degraded)]'
                      : 'text-[var(--ob-text-3)]',
                )}
              >
                {row.uptime}
              </span>
              <span
                className={cn(
                  'font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums',
                  row.incidents !== '0' ? 'text-[var(--ob-critical)]' : 'text-[var(--ob-text-4)]',
                )}
              >
                {row.incidents}
              </span>
              <span className="truncate text-[12px] text-[var(--ob-text-4)]">
                {row.last}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          <div className="border-b border-[var(--ob-line)] px-5 py-5">
            <p className="ob-label mb-3">Active incidents across clients</p>
            <div className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px] gap-2">
              <span className="truncate text-[12.5px] font-medium text-[var(--ob-text)]">
                Meridian Commerce
              </span>
              <span className="truncate text-[12.5px] text-[var(--ob-text-3)]">
                Payment API
              </span>
              <StateIndicator state="critical" label="Open" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px] gap-2">
              <span className="truncate text-[12.5px] font-medium text-[var(--ob-text)]">
                Beacon Ledger
              </span>
              <span className="truncate text-[12.5px] text-[var(--ob-text-3)]">
                Auth provider
              </span>
              <StateIndicator state="degraded" label="Open" />
            </div>
          </div>

          <div className="flex-1 px-5 py-5">
            <p className="ob-label mb-4">Unassigned monitors</p>
            <div className="flex flex-col gap-3">
              {['Vendor API · EU route', 'Disaster recovery endpoint'].map((m) => (
                <div
                  key={m}
                  className="flex items-center justify-between gap-3 border-t border-[var(--ob-line)] pt-3"
                >
                  <span className="truncate text-[12.5px] text-[var(--ob-text-3)]">
                    {m}
                  </span>
                  <span className="ob-label tracking-[0.05em]">Assign</span>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-[var(--ob-line)] pt-4">
              <Link
                href={CONSOLE_ROUTES.clients}
                className="ob-link text-[12px]"
              >
                Open the agency console
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
