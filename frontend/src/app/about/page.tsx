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
import { MaintainerAvatar } from '@/components/site/maintainer-avatar';
import { RESEARCH_AUTHORS } from '@/lib/research/authors';
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
  title: 'About & maintainer',
  description:
    'RELIASTRA is built and maintained by Adeshina Emmanuel, an AI infrastructure security engineer. Why the project exists, what it is investigating, what it refuses to claim, and where it is going.',
  path: PUBLIC_ROUTES.about,
});

/**
 * About, including the maintainer.
 *
 * Two jobs, and the order matters. The first is to answer "who is behind this"
 * with a real person: a portrait that is his, a biography that names work
 * that can be checked, and links that resolve. The second is the project's own
 * story - why it exists, what it refuses to claim, and the difference between
 * what is deployed and what is being built toward.
 *
 * Deliberately not here: a founder narrative, a mission statement, or a
 * timeline of company milestones. The reader is an engineer deciding whether to
 * trust a measurement tool, and the only things that help are the work, the
 * method and the limits.
 */
export default function AboutPage() {
  const author = RESEARCH_AUTHORS[0];
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'About', href: PUBLIC_ROUTES.about },
  ];

  /**
   * Public work, described with the repository's own description rather than a
   * promotional paraphrase. Every entry links to the source.
   */
  const publicWork = [
    {
      name: 'cloud-identity-security-engineering',
      href: 'https://github.com/EmmanuelAdesina/cloud-identity-security-engineering',
      body: 'Go-based security research and tooling for AWS IAM and cloud identity. This is the series the identity and access-control research papers are drawn from.',
    },
    {
      name: 'aws-iam-attack-paths',
      href: 'https://github.com/EmmanuelAdesina/aws-iam-attack-paths',
      body: 'A threat-modelling project that treats an AWS IAM policy set as a trust graph and reasons about the paths through it.',
    },
    {
      name: 'headershield',
      href: 'https://github.com/EmmanuelAdesina/headershield',
      body: 'A lightweight audit tool that maps missing HTTP security headers to the risk they expose.',
    },
    {
      name: 'CloudVitals',
      href: 'https://github.com/EmmanuelAdesina/CloudVitals',
      body: 'A cloud security health scanner: five checks, ten seconds, no agent.',
    },
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
            name: 'About RELIASTRA',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            about: { '@id': `${SITE_URL}/#person` },
            inLanguage: 'en',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Person',
            '@id': `${SITE_URL}/#person`,
            name: author.name,
            jobTitle: author.role,
            description: author.bio,
            url: canonicalUrl(PUBLIC_ROUTES.about),
            image: 'https://avatars.githubusercontent.com/u/219976014?v=4',
            sameAs: author.sameAs ?? [],
            knowsAbout: author.domains ?? [],
            worksFor: { '@id': `${SITE_URL}/#organization` },
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb items={crumbs} className="mb-8" />
          <Eyebrow>Project</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[18ch]">
            A real engineer, and the work you can check.
          </h1>
          <p className="ob-lede mt-6 max-w-[62ch]">
            RELIASTRA is one person’s engineering project with a product around
            it. That is a constraint worth stating plainly: it is why the
            detector is small enough to read, why there is one plan instead of a
            sales process, and why the maintainer answers support himself.
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
              <MaintainerAvatar
                src="https://avatars.githubusercontent.com/u/219976014?v=4"
                alt={`${author.name}, maintainer of RELIASTRA`}
                initials="AE"
              />
              <div className="flex flex-col gap-1">
                <p className="ob-label">Maintainer</p>
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
                  Works on identity, access control and system hardening across
                  cloud, Kubernetes and AI production environments. Writes the
                  Cloud Identity Security Engineering research series — the AWS
                  IAM policy-evaluation work published here comes out of it — and
                  builds RELIASTRA: an infrastructure observation product that
                  independently verifies third-party availability and produces
                  cryptographic incident evidence.
                </p>
              </div>

              <div className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
                <div>
                  <p className="ob-label mb-3">Current focus</p>
                  <ul className="flex flex-col gap-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    <li>Dependency observability and evidence integrity</li>
                    <li>Cloud identity: IAM evaluation, trust boundaries, least privilege</li>
                    <li>Security of AI infrastructure: model APIs, routing, agent boundaries</li>
                  </ul>
                </div>
                <div>
                  <p className="ob-label mb-3">Interests</p>
                  <ul className="flex flex-col gap-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    {['Measurement integrity', 'Distributed systems', 'Kubernetes security', 'Zero trust', 'Reproducible research'].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-x-12 gap-y-6 border-t border-[var(--ob-line)] pt-6 sm:grid-cols-2">
                <div>
                  <p className="ob-label mb-3">Elsewhere</p>
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
                      <span className="text-[var(--ob-text-4)]">— product and support</span>
                    </li>
                    <li>
                      <a href="mailto:security@reliastra.com" className="ob-link">
                        security@reliastra.com
                      </a>{' '}
                      <span className="text-[var(--ob-text-4)]">— vulnerability reports</span>
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
            <Eyebrow index="01">Public work</Eyebrow>
            <h2 id="work-title" className="ob-h2 max-w-[20ch]">
              The engineering is inspectable, which is the point.
            </h2>
          </div>
          <ul className="mt-10 grid gap-x-16 gap-y-px sm:grid-cols-2">
            {publicWork.map((repo) => (
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
              <Eyebrow index="02">Why it exists</Eyebrow>
              <h2 id="why-title" className="ob-h2 max-w-[16ch]">
                The argument nobody could settle.
              </h2>
            </div>
            <div className="flex flex-col gap-6">
              <p className="ob-body-lg">
                Every serious outage review contains the same unresolved
                exchange. The vendor’s status page says operational. Your
                dashboards say failing. Both are written by a party to the
                argument, and nobody kept a third record.
              </p>
              <p className="ob-body">
                Most tools that claim to resolve this either monitor your own
                edge — which cannot see the cause — or republish the vendor’s
                own status feed with a different logo on it. What was missing was
                an observer with no stake: something that measures the dependency
                itself, from outside both networks, and keeps the measurement in
                a form that survives being questioned six months later.
              </p>
              <p className="ob-body">
                That is a small idea, and most of the engineering is in refusing
                to overstate it. A probe measures a path. One observation point
                cannot establish a vendor-wide outage. A confidence score is not
                a cause. Every one of those limits is written into the product
                rather than left to a marketing page to smooth over.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── What it refuses to claim ── */}
      <Section tone="void" aria-labelledby="refuses-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow index="03">What it refuses to claim</Eyebrow>
              <h2 id="refuses-title" className="ob-h2 max-w-[16ch]">
                Written down, so it stays true.
              </h2>
              <p className="ob-small">{SCOPE_NOTE}</p>
            </div>
            <ul className="flex flex-col">
              {[
                ['No causation from correlation', 'An attribution score measures how closely two timelines line up with five weighted signals. It does not establish that a vendor caused an outage.'],
                ['No vendor-wide conclusions from one path', 'One observation point measures one route. The product never presents that as the vendor’s state, and no regional quorum is claimed while only one point exists.'],
                ['No availability without a denominator', 'Every availability figure is printed with the observation count behind it, and zero observations print as insufficient data rather than as 100%.'],
                ['No number for an unmeasured value', 'An unmeasured field renders as a named sentinel — never as 0, never as a dash that could read as zero.'],
                ['No reconstructed history', 'Missed probes are missing. Nothing is backfilled, and a record states when its own coverage was thin.'],
                ['No invented users or logos', 'There is no customer wall, no testimonial and no counter on this site, because every one of those would be furniture rather than evidence.'],
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
            <Eyebrow index="04">Direction</Eyebrow>
            <h2 id="direction-title" className="ob-h2 max-w-[22ch]">
              What exists today, and what is being built toward.
            </h2>
          </div>

          <div className="mt-12 grid gap-x-16 gap-y-10 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <p className="ob-label ob-label-signal">Exists</p>
              <ul className="flex flex-col gap-3 border-t border-[var(--ob-line)] pt-5">
                {[
                  'Independent probes of external endpoints, with every observation retained.',
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
              <p className="ob-label">Being built toward</p>
              <ul className="flex flex-col gap-3 border-t border-[var(--ob-line)] pt-5">
                {[
                  'Genuinely independent observation points, so confirmation can be agreement rather than persistence — and the records say which rule applied.',
                  'Application-side signals (SDK, OpenTelemetry, webhook ingestion) so a dependency’s behaviour can be described from the caller’s side as well.',
                  'Cross-application correlation: the same dependency degrading for unrelated applications at the same time.',
                  'A dependency graph built from those observations, and attribution that improves with the number of vantage points instead of degrading with it.',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]"
                  >
                    <span aria-hidden className="ob-label pt-1">
                      —
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="ob-small mt-1 max-w-[56ch]">
                None of this is counted, measured or presented as a live figure
                anywhere. It is described here because the direction is part of
                the engineering, not because the network exists yet.
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
                The research is where the arguments go before the code does.
              </h2>
              <p className="ob-body max-w-[56ch]">
                Methodology, measurement audits and cloud-security work — each
                paper with its own limitations section, because a technical
                document that cannot say what it does not establish is a
                brochure.
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
