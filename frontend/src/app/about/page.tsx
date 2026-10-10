import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { RESEARCH_AUTHORS } from '@/lib/research/authors';
import { MAINTAINER_PUBLIC_WORK } from '@/lib/research/maintainer-profile';
import { sitePersonJsonLd } from '@/lib/research/structured-data';
import {
  AUTH_ROUTES,
  DOCS_ROUTES,
  EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  researchRoute,
} from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';
import { SCOPE_NOTE } from '@/lib/methodology';

export const metadata: Metadata = buildMetadata({
  title: 'About Adeshina Emmanuel',
  description:
    'Adeshina Emmanuel founded RELIASTRA and leads its engineering. Read about his infrastructure security work, research, public tools, and measurement principles.',
  path: PUBLIC_ROUTES.about,
});

/**
 * About, including the maintainer.
 *
 * Introduces RELIASTRA's founder and maintainer, his public work, the product's
 * engineering rationale, and the distinction between current capabilities and
 * future development.
 *
 * Claims about the product remain tied to its documented methods and stated
 * measurement limits.
 */
export default function AboutPage() {
  const author = RESEARCH_AUTHORS[0];
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'About', href: PUBLIC_ROUTES.about },
  ];

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, path: c.href }))),
          {
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.about),
            url: canonicalUrl(PUBLIC_ROUTES.about),
            name: 'About Adeshina Emmanuel',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            mainEntity: { '@id': `${SITE_URL}/#person` },
            about: { '@id': `${SITE_URL}/#person` },
            inLanguage: 'en',
          },
          sitePersonJsonLd(author),
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb items={crumbs} className="mb-8" />
          <Eyebrow>Founder &amp; engineer</Eyebrow>
          <h1 className="ob-display mt-6 max-w-[20ch]">
            {author.name}
          </h1>
          <p className="ob-lede mt-6 max-w-[62ch]">
            Founder and engineer of RELIASTRA, Adeshina works across cloud
            identity, access control, Kubernetes, and AI systems. He applies
            that security-engineering experience to measuring external service
            behavior and preserving verifiable observation records.
          </p>
        </Container>
      </header>

      {/* ── The maintainer ── */}
      <Section tone="void" divider={false} tight aria-labelledby="maintainer-title">
        <Container>
          <h2 id="maintainer-title" className="sr-only">
            Maintainer
          </h2>
          <div className="grid gap-10 border-t border-[var(--ob-line)] pt-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-14">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <p className="ob-label">Founder &amp; engineer</p>
                <p className="text-[16px] font-semibold tracking-[-0.012em] text-[var(--ob-text)]">
                  {author.name}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-3">
                <p className="text-[15px] leading-[1.65] text-[var(--ob-text-2)]">
                  {author.role}
                </p>
                <p className="max-w-[68ch] text-[14.5px] leading-[1.75] text-[var(--ob-text-3)]">
                  His work spans cloud identity and access control, Kubernetes
                  security, and the security of AI systems. His public work
                  includes the Cloud Identity Security Engineering research
                  series and open-source security tools. At RELIASTRA, he leads
                  engineering of the observation pipeline, incident-confirmation
                  rules, attribution methods, and verifiable evidence records.
                </p>
              </div>

              <div className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
                <div>
                  <p className="ob-label mb-3">Areas of practice</p>
                  <ul className="flex flex-col gap-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    <li>Dependency observability and evidence integrity</li>
                    <li>Cloud identity: IAM evaluation, trust boundaries, least privilege</li>
                    <li>Security of AI infrastructure: model APIs, routing, agent boundaries</li>
                  </ul>
                </div>
                <div>
                  <p className="ob-label mb-3">Research subjects</p>
                  <ul className="flex flex-col gap-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    {['Measurement integrity', 'Distributed systems', 'Kubernetes security', 'Cloud access control', 'Reproducible research'].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-x-12 gap-y-6 border-t border-[var(--ob-line)] pt-6 sm:grid-cols-2">
                <div>
                  <p className="ob-label mb-3">Profiles</p>
                  <ul className="flex flex-col gap-2 text-[13.5px]">
                    {(author.sameAs ?? []).map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer me"
                          className="ob-link"
                        >
                          {url
                            .replace(/^https?:\/\/(www\.)?/, '')
                            .replace(/\/$/, '')}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="ob-label mb-3">Contact</p>
                  <ul className="flex flex-col gap-2 text-[13.5px]">
                    <li>
                      <a href="mailto:support@reliastra.com" className="ob-link">
                        support@reliastra.com
                      </a>{' '}
                      <span className="text-[var(--ob-text-4)]">- product and support</span>
                    </li>
                    <li>
                      <a href="mailto:security@reliastra.com" className="ob-link">
                        security@reliastra.com
                      </a>{' '}
                      <span className="text-[var(--ob-text-4)]">- vulnerability reports</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Public work ── */}
      <Section tone="void" tight aria-labelledby="work-title">
        <Container>
          <div className="flex flex-col gap-5">
            <Eyebrow>Research &amp; open-source work</Eyebrow>
            <h2 id="work-title" className="ob-h2 max-w-[20ch]">
              Selected research and tools.
            </h2>
          </div>
          <ul className="mt-10 grid gap-x-16 gap-y-px sm:grid-cols-2">
            {MAINTAINER_PUBLIC_WORK.map((repo) => (
              <li key={repo.name} className="border-t border-[var(--ob-line)] py-6">
                <a
                  href={repo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-2"
                >
                  <span className="ob-mono text-[13px] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                    {repo.name}
                  </span>
                  <span className="max-w-[56ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                    {repo.body}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            <ArrowLink href={PUBLIC_ROUTES.research}>Research published here</ArrowLink>
            <a
              href={EXTERNAL_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="ob-link text-[13px]"
            >
              The RELIASTRA organisation on GitHub
            </a>
          </div>
        </Container>
      </Section>

      {/* ── Why it exists ── */}
      <Section tone="raised" aria-labelledby="why-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Why it exists</Eyebrow>
              <h2 id="why-title" className="ob-h2 max-w-[16ch]">
                External-service observations for incident review.
              </h2>
            </div>
            <div className="flex flex-col gap-6">
              <p className="ob-body-lg">
                Organizations depend on external services they do not operate.
                During an incident, a provider’s status report and a customer’s
                measurements may differ because they describe different views
                of the service. A separately maintained observation record can
                help clarify what was seen, and when.
              </p>
              <p className="ob-body">
                RELIASTRA focuses on recording HTTP behavior observed by its
                probes, retaining the timestamps and outcomes, and applying
                documented rules to confirm failures and assess attribution.
                These records provide evidence for review; they do not, by
                themselves, establish the cause of an incident.
              </p>
              <p className="ob-body">
                A probe measures a route from a particular observation point.
                Measurements from one point cannot establish a provider-wide
                outage, and an attribution score is not proof of cause. Those
                boundaries are reflected in the product's methodology and in
                how results are reported.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Measurement principles ── */}
      <Section tone="void" aria-labelledby="principles-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Measurement principles</Eyebrow>
              <h2 id="principles-title" className="ob-h2 max-w-[16ch]">
                Clear findings, explicit limits.
              </h2>
              <p className="ob-small">{SCOPE_NOTE}</p>
            </div>
            <ul className="flex flex-col">
              {[
                ['Attribution is not causation', 'The attribution score compares timelines using five weighted signals. It does not establish that a provider caused an outage.'],
                ['Measurements describe their observation path', 'A single observation point measures one route. It does not establish a provider-wide state or independent regional corroboration.'],
                ['Availability includes its sample count', 'Availability figures are reported with the observation count. With no observations, the result is reported as insufficient data—not as 100%.'],
                ['Unmeasured values remain unavailable', 'A field without a measurement is represented as unavailable, not as zero or as a mark that could be mistaken for zero.'],
                ['Gaps in observation remain visible', 'Missed probes are not backfilled. Records disclose when their observation coverage is limited.'],
              ].map(([title, body]) => (
                <li key={title} className="border-t border-[var(--ob-line)] py-5">
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                    {title}
                  </p>
                  <p className="mt-2 max-w-[66ch] text-[13.5px] leading-[1.7] text-[var(--ob-text-3)]">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* ── What exists vs what is being built ── */}
      <Section tone="base" aria-labelledby="direction-title">
        <Container>
          <div className="flex flex-col gap-5">
            <Eyebrow>Product status</Eyebrow>
            <h2 id="direction-title" className="ob-h2 max-w-[22ch]">
              Available today and in development.
            </h2>
          </div>

          <div className="mt-12 grid gap-x-16 gap-y-10 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <p className="ob-label ob-label-signal">Available today</p>
              <ul className="flex flex-col gap-3 border-t border-[var(--ob-line)] pt-5">
                {[
                  'Scheduled probes of external endpoints, with every observation retained.',
                  'Deterministic fault confirmation, replayable from the stored rows.',
                  'Deterministic attribution with published weights and a methodology version.',
                  'Compiled evidence records with payload and document checksums, verifiable by a third party without an account.',
                  'A public observatory that reports what it measured and states what it did not.',
                  'A documented REST API, a working CLI, and webhooks.',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]"
                  >
                    <span aria-hidden className="ob-label ob-label-signal pt-1">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <p className="ob-label">In development</p>
              <ul className="flex flex-col gap-3 border-t border-[var(--ob-line)] pt-5">
                {[
                  'Additional independently operated observation points to support agreement-based confirmation and identify the applicable rule in each record.',
                  'Application-side signals (SDK, OpenTelemetry, webhook ingestion) so a dependency’s behaviour can be described from the caller’s side as well.',
                  'Cross-application correlation: the same dependency degrading for unrelated applications at the same time.',
                  'A dependency graph built from recorded observations, with attribution informed by available vantage-point coverage.',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]"
                  >
                    <span aria-hidden className="ob-label pt-1">
                     -
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="ob-small mt-1 max-w-[56ch]">
                These are development goals, not current capabilities or live
                network measurements.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Research + contact ── */}
      <Section tone="void" tight aria-labelledby="about-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="about-cta" className="ob-h3 max-w-[28ch]">
                Research, methods, and implementation.
              </h2>
              <p className="ob-body max-w-[56ch]">
                Read the technical work behind RELIASTRA, including its
                measurement methodology, measurement audits, and research on
                cloud identity and infrastructure security.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={PUBLIC_ROUTES.research} className="ob-btn ob-btn-signal">
                Read the research
              </Link>
              <Link href={DOCS_ROUTES.quickstart} className="ob-btn ob-btn-outline">
                Start observing
              </Link>
            </div>
          </div>
          <p className="ob-small mt-10 max-w-[70ch]">
            Prefer to read the source first? The measurement methodology is
            documented in{' '}
            <Link href={DOCS_ROUTES.methodology} className="ob-link">
              the methodology guide
            </Link>
            , and the paper behind the detector is{' '}
            <Link
              href={researchRoute('how-reliastra-measures-vendor-reliability')}
              className="ob-link"
            >
              How RELIASTRA measures vendor reliability
            </Link>
            .{' '}
            <Link href={AUTH_ROUTES.signup} className="ob-link">
              Start observing
            </Link>{' '}
            if you would rather test it than read about it.
          </p>
        </Container>
      </Section>
    </SiteShell>
  );
}
