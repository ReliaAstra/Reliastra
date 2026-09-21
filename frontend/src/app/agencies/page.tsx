import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { SceneLinks } from '@/components/site/home/scenes';
import {
  DETECTION,
  OBSERVATION_LABEL,
  PROBE_INTERVAL_SECONDS,
} from '@/lib/methodology';
import { dependencyLabel, getPlan } from '@/lib/dashboard/plans';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'For agencies - dependencies across every client',
  description:
    'One RELIASTRA account observes the external services every client estate depends on. Independent probes, incident attribution, and evidence you can hand to the client.',
  path: PUBLIC_ROUTES.agencies,
});

/**
 * Agencies.
 *
 * The offer is stated in what the product actually does: one account watches
 * up to 25 external endpoints, an agency spends those across client estates,
 * and the evidence records it produces are client-deliverable. There is no
 * invented agency tier, no per-seat pricing, and no multi-tenant console
 * here, because none exists.
 */
const CLIENTS: { name: string; app: string; deps: string[] }[] = [
  { name: 'client a', app: 'storefront', deps: ['payments', 'identity', 'cdn'] },
  { name: 'client b', app: 'saas product', deps: ['database', 'messaging', 'model api'] },
  { name: 'client c', app: 'member portal', deps: ['identity', 'storage', 'dns'] },
];

const WORKFLOW: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Register the estate',
    body: `Add the external endpoints each client depends on. ${dependencyLabel(
      getPlan('pro').dependencies
    ).toLowerCase()} per account, any HTTP service that returns a status code.`,
  },
  {
    n: '02',
    title: 'Observations accumulate',
    body: `Probes run every ${PROBE_INTERVAL_SECONDS} seconds from ${OBSERVATION_LABEL}, outside both the client's network and the vendor's. Every probe leaves a timestamped row.`,
  },
  {
    n: '03',
    title: 'Incidents are confirmed',
    body: `${DETECTION.failureChecks} consecutive failures open an incident; ${DETECTION.recoveryChecks} consecutive successes resolve it. The rule identifier travels with the incident.`,
  },
  {
    n: '04',
    title: 'The record goes to the client',
    body: 'A resolved incident becomes a checksummed, shareable evidence record: the window, every observation in it, the attribution verdict, and a way to verify all of it without an account.',
  },
];

export default function AgenciesPage() {
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Agencies', href: PUBLIC_ROUTES.agencies },
  ];

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, path: c.href }))),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.agencies),
            url: canonicalUrl(PUBLIC_ROUTES.agencies),
            name: 'RELIASTRA for agencies',
            description:
              'External dependency observation and evidence across client estates, from one account.',
            isPartOf: { '@id': `${SITE_URL}/#website` },
          },
        ]}
      />

      <header className="relative overflow-hidden border-b border-[var(--ob-line)] bg-black">
        <div aria-hidden className="ob-scene-media">
          <img
            src="/media/scene-switches.webp"
            srcSet="/media/scene-switches-sm.webp 1100w, /media/scene-switches.webp 1600w"
            sizes="100vw"
            alt=""
            loading="eager"
            decoding="async"
            style={{ objectPosition: '50% 30%' }}
          />
          <div className="ob-scene-scrim" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.88),transparent_45%)]" />
        </div>
        <Container className="relative z-[1] flex min-h-[74vh] flex-col justify-end pb-16 pt-36 md:pb-20">
          <Breadcrumb items={crumbs} className="mb-9" />
          <Eyebrow>Agencies</Eyebrow>
          <h1 className="ob-display mt-6 max-w-[11ch]">
            Dependencies across every client.
          </h1>
          <p className="ob-lede mt-7 max-w-[52ch]">
            Your clients run on services none of you operate. Watch all of
            those dependencies from one account, attribute the incidents to
            the vendor that caused them, and hand over evidence that survives
            the dispute.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
              Start monitoring client environments
            </Link>
            <Link href={PUBLIC_ROUTES.pricing} className="ob-btn ob-btn-outline">
              What the plan covers
            </Link>
          </div>
        </Container>
      </header>

      {/* The relationship, as a topology */}
      <Section tone="void" divider={false} aria-labelledby="estate-title">
        <Container>
          <div className="flex flex-col gap-9 pb-14 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-6">
              <Eyebrow>The estate</Eyebrow>
              <h2 id="estate-title" className="ob-scene-title max-w-[15ch]">
                One account. Every client. Their dependencies.
              </h2>
            </div>
            <p className="ob-lede max-w-[38ch] lg:pb-1 lg:text-right">
              Each client contributes a handful of external endpoints; the
              account watches all of them on the same fixed cadence.
            </p>
          </div>

          <div>
            <div className="ob-tree-hub">
              <span className="ob-label ob-label-strong">Reliastra account</span>
              <span className="ob-label">
                {dependencyLabel(getPlan('pro').dependencies)} · every{' '}
                {PROBE_INTERVAL_SECONDS}s · retained evidence
              </span>
            </div>
            <div className="ob-tree">
              {CLIENTS.map((client) => (
                <div key={client.name} className="ob-tree-lane">
                  <span className="ob-label">
                    {client.name} · {client.app}
                  </span>
                  <ul className="ob-tree-nodes">
                    {client.deps.map((dep) => (
                      <li key={dep}>
                        <p className="ob-tree-name">{dep}</p>
                        <p className="ob-tree-deps">observed endpoint</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="ob-label mt-3">
              Illustrative estate · any HTTP endpoint can be observed
            </p>
          </div>
        </Container>
      </Section>

      {/* The workflow, in four steps */}
      <Section tone="base" aria-labelledby="workflow-title">
        <Container>
          <div className="flex flex-col gap-6 pb-12">
            <Eyebrow>The work</Eyebrow>
            <h2 id="workflow-title" className="ob-scene-title max-w-[15ch]">
              From estate to deliverable.
            </h2>
          </div>
          <ol className="grid gap-px md:grid-cols-2 xl:grid-cols-4">
            {WORKFLOW.map((step) => (
              <li
                key={step.n}
                className="flex flex-col gap-4 border-t border-[var(--ob-line)] pt-7 xl:pr-8"
              >
                <span className="ob-label ob-label-strong">{step.n}</span>
                <h3 className="ob-h3">{step.title}</h3>
                <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* Terms, stated plainly */}
      <Section tone="void" aria-labelledby="agency-terms-title">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>The terms</Eyebrow>
              <h2 id="agency-terms-title" className="ob-h2 max-w-[16ch]">
                Same plan, same price, same rules.
              </h2>
              <p className="ob-body">
                Agencies pay what everyone pays. The limits below are the
                plan's limits, not an agency tier.
              </p>
            </div>
            <dl className="flex flex-col">
              {[
                ['Price', '$9/month per account, after a 14-day trial that needs no card.'],
                ['Coverage', dependencyLabel(getPlan('pro').dependencies) + '. Spend them across as many client estates as you like.'],
                ['Cadence', `Probes every ${PROBE_INTERVAL_SECONDS} seconds from ${OBSERVATION_LABEL}, with the observation topology stated on every record.`],
                ['Deliverables', 'Shareable evidence records with a checksum and a verification URL. A client can verify one without an account.'],
                ['Client isolation', 'Client-side access is your arrangement. RELIASTRA records belong to your account and are shared only when you share them.'],
              ].map(([term, body]) => (
                <div
                  key={term}
                  className="grid gap-2 border-t border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(140px,200px)_1fr] sm:gap-8"
                >
                  <dt className="ob-label pt-1">{term}</dt>
                  <dd className="max-w-[64ch] text-[14.5px] leading-[1.68] text-[var(--ob-text-2)]">
                    {body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <section
        aria-labelledby="agencies-cta"
        className="border-t border-[var(--ob-line)] bg-[var(--ob-base)]"
      >
        <Container className="py-20 md:py-28">
          <div className="flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-5">
              <h2 id="agencies-cta" className="ob-scene-title max-w-[16ch]">
                Watch the first estate on the trial.
              </h2>
              <p className="ob-body max-w-[54ch]">
                Add the endpoints one client depends on and read what the
                probes record for a week. If the record is ever needed, it is
                already there.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start monitoring client environments
              </Link>
            </div>
          </div>
          <div className="mt-10">
            <SceneLinks
              items={[
                { href: PUBLIC_ROUTES.product, label: 'Explore the platform' },
                { href: PUBLIC_ROUTES.observatory, label: 'See the public data first' },
              ]}
            />
          </div>
        </Container>
      </section>
    </SiteShell>
  );
}
