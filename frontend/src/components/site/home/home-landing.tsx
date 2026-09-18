import Link from 'next/link';
import { SiteShell } from '@/components/site/site-shell';
import { HomeHero } from './hero';
import { Manifesto } from './scenes';
import { ProblemScene } from './problem-scene';
import { CorrelateBand, ObserveBand, ProveBand } from './method-bands';
import { AttributionScene } from './attribution-scene';
import { IndexScene } from './index-scene';
import { ResearchTeaser } from './research-teaser';
import { AgenciesScene } from './agencies-scene';
import { PricingSummary } from './pricing-summary';
import { FinalCTASection, MaintainerSection, ReferenceSection } from './sections';
import { AUTH_ROUTES } from '@/lib/routes';

/**
 * The RELIASTRA homepage, composed as scenes.
 *
 * Each scene is one argument at one scale, and the page is the sequence an
 * engineer reads them in:
 *
 *   top          the proposition, over the product's own telemetry
 *   statement    the claim, in one sentence
 *   problem      the blind spot, drawn as a topology
 *   observation  what a probe records, with the working
 *   correlation  how a failure becomes an incident
 *   attribution  how an incident names a contributor
 *   evidence     what you can still verify a year later
 *   index        the same probes, published
 *   research     the published method behind the claims
 *   agencies     one account, many client estates
 *   pricing      what it costs
 *   reference    the questions this page raises, answered plainly
 *   maintainer   who is behind it
 *
 * There is no customer-logo band, no metric counters and no testimonial
 * carousel, because the product has no customers to quote yet and a
 * fabricated one would undermine the only thing it is selling.
 */
export function HomeLanding() {
  return (
    <SiteShell overHero>
      <HomeHero />
      <Manifesto
        aside={
          <p className="ob-body">
            When a third-party dependency degrades, your users file it under
            your name. RELIASTRA gives you the observation record that shows
            where it actually failed, and evidence that still verifies after
            the incident is over.{' '}
            <Link href={AUTH_ROUTES.signup} className="ob-link">
              Start with one endpoint
            </Link>
            .
          </p>
        }
      >
        Your infrastructure includes services you do not operate.
      </Manifesto>
      <ProblemScene />
      <ObserveBand />
      <CorrelateBand />
      <AttributionScene />
      <ProveBand />
      <IndexScene />
      <ResearchTeaser />
      <AgenciesScene />
      <PricingSummary />
      <ReferenceSection />
      <MaintainerSection />
      <FinalCTASection />
    </SiteShell>
  );
}
