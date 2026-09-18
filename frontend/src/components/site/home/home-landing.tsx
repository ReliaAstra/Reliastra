import { SiteShell } from '@/components/site/site-shell';
import { HomeHero } from './hero';
import {
  EvidenceSection,
  FinalCTASection,
  IncidentSection,
  IntegrationSection,
  MaintainerSection,
  ObservationSection,
  ProblemSection,
  ReferenceSection,
} from './sections';
import { ResearchTeaser } from './research-teaser';
import { ObservatorySection } from './observatory-section';
import { PricingSummary } from './pricing-summary';

/**
 * The RELIASTRA homepage.
 *
 * The page answers nine questions in the order an engineer asks them, and each
 * section exists to answer one of them:
 *
 *   01 problem       why does this need to exist
 *   02 observation   what does it actually measure
 *   03 incident      when does it decide something is wrong
 *   04 evidence      what do I get out of it
 *   05 integration   how does it reach my systems
 *   06 research      what is the method, and can I check it
 *   07 observatory   is there real data behind this
 *   08 pricing       what does it cost
 *   09 reference     the questions this page raised, answered plainly
 *   10 maintainer    who is behind it
 *
 * There is no customer-logo band, no metric counters and no testimonial
 * carousel, because the product has no customers to quote yet and a fabricated
 * one would undermine the only thing it is selling. Where a section could not
 * be backed by something real, it does not appear.
 *
 * Entirely server-rendered except the observatory's live refresh and the
 * documentation code blocks' copy control. The header owns the rest.
 */
export function HomeLanding() {
  return (
    <SiteShell overHero>
      <HomeHero />
      <ProblemSection />
      <ObservationSection />
      <IncidentSection />
      <EvidenceSection />
      <IntegrationSection />
      <ResearchTeaser />
      <ObservatorySection />
      <PricingSummary />
      <ReferenceSection />
      <MaintainerSection />
      <FinalCTASection />
    </SiteShell>
  );
}
