import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl, organizationJsonLd } from '@/lib/seo';
import { EXTERNAL_LINKS, PUBLIC_ROUTES } from '@/lib/routes';

export const metadata = buildMetadata({
  title: 'About - who builds RELIASTRA',
  description:
    'RELIASTRA is an engineering project with a product around it: independent dependency observation, deterministic attribution, verifiable evidence. Who builds it, why it exists, and what is being researched.',
  path: '/about',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
];

/**
 * About / maintainer identity.
 *
 * This page is the human side of the project: who builds RELIASTRA, why it
 * exists, what is being researched, and where the engineering lives. It is
 * deliberately written as an engineering project with a product around it,
 * not a corporate biography - no invented team, no stock mission statement.
 */
export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ]),
        ]}
      />
      <MarketingPage
        eyebrow="Project"
        title="Built by an engineer, for engineers."
        lede="RELIASTRA is an engineering project with a serious product around it: independent observation of the third-party services software depends on, and evidence that survives the argument."
        breadcrumbs={crumbs}
        related={[
          { label: 'Research agenda', href: '/research/reliastra-research-agenda', description: 'What we publish and what we refuse to.' },
          { label: 'The Dependency Gap', href: '/research/the-dependency-gap', description: 'The problem that motivated the product.' },
          { label: 'Public dependency index', href: '/track', description: 'The public face of the measurement network.' },
          { label: 'Technical creators', href: '/creators', description: 'Work with us directly.' },
        ]}
      >
        <Prose>
          <h2>Why it exists</h2>
          <p>
            Every serious outage review contains the same unresolved argument:
            the vendor&rsquo;s status page says &ldquo;operational,&rdquo; your
            dashboards say &ldquo;failing,&rdquo; and nobody kept a third
            record. The team with the better record wins the argument - and
            until now, that record did not exist. RELIASTRA exists to be that
            record: an independent observation of your dependencies, kept
            carefully enough to be useful after the incident is over.
          </p>

          <h2>Who builds it</h2>
          <p>
            RELIASTRA is built and maintained by a single infrastructure
            engineer, in the open where it counts. The measurement engine, the
            detection methodology, the evidence format and the product around
            them are one person&rsquo;s work - which is why the product is one
            engineer&rsquo;s price ($9/month) and why there is no sales
            process to talk to the person who built it. The code, the research
            artifacts and the methodology live in{' '}
            <a href={EXTERNAL_LINKS.github} target="_blank" rel="noopener noreferrer">
              the public repository
            </a>
            .
          </p>

          <h2>What it will not do</h2>
          <ul>
            <li>Publish vendor rankings without window, sample size and methodology.</li>
            <li>Present synthetic data as observations or backfill missed probes.</li>
            <li>Claim causation from correlation.</li>
            <li>Expose customer endpoints or credentials on any public surface.</li>
            <li>Invent a network before the network exists.</li>
          </ul>
          <p>
            These commitments are stated publicly in the{' '}
            <Link href="/research/reliastra-research-agenda" className="ob-link">
              research agenda
            </Link>
            .
          </p>

          <h2>The direction</h2>
          <p>
            The product today answers one question:{' '}
            <em>
              something I depend on is behaving strangely - what actually
              happened, and can I prove it?
            </em>{' '}
            Underneath it is a larger idea: a dependency intelligence network
            built from independent observations across real software systems,
            where degradation observed by many unrelated applications at the
            same time becomes something no single vantage point can see.
          </p>
          <p>
            That network is not faked into existence. The public{' '}
            <Link href="/track" className="ob-link">
              dependency index
            </Link>{' '}
            states exactly how many vantage points it has, because early
            transparency is worth more than imaginary scale.
          </p>

          <h2>How the work connects</h2>
          <p>
            Research produces questions. Questions produce methodology.
            Methodology becomes engineering, engineering produces observations,
            observations become evidence, and the evidence raises the next
            research question. The{' '}
            <Link href="/research" className="ob-link">
              research section
            </Link>{' '}
            and the product are the same loop, not two departments.
          </p>

          <h2>Contact</h2>
          <p>
            <a href="mailto:support@reliastra.com">support@reliastra.com</a> ·{' '}
            <Link href="/contact" className="ob-link">
              Contact page
            </Link>{' '}
            ·{' '}
            <a href={EXTERNAL_LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
