import { SiteShell } from '@/components/site/site-shell';
import { HomeHero } from './hero';
import {
  EvidenceArtifactSection,
  EvidenceLayerSection,
  FinalCTASection,
  HowItWorksSection,
  IncidentStorySection,
  MaintainerSection,
  ObservationSection,
  ProblemSection,
  ReferenceSection,
} from './sections';
import { ResearchTeaser } from './research-teaser';
import { LiveIntelligenceSection } from './live-intelligence';
import { PricingSummary } from './pricing-summary';

/**
 * The RELIASTRA homepage.
 *
 * The narrative is: claim, then show, then explain. The product is on screen
 * before the method is described, because the method is only interesting once
 * a visitor has seen what it produces.
 *
 *   01 hero          the proposition
 *   02 problem       the dependencies you do not control
 *   03 RELIASTRA     the independent record
 *   04 observation   the topology, drawn
 *   05 incident      one incident, start to finished record
 *   06 evidence      the artifact, its chart, its verdict
 *   07 method        observe, correlate, document, prove
 *   08 research      the method, published
 *   09 public data   live independent vendor observation
 *   10 pricing       what it costs
 *      reference     definitions
 *   11 CTA           start
 *
 * Entirely server-rendered. The only client JavaScript on this page is the
 * header (mobile menu + scroll state); the product visuals are static markup
 * and SVG, so they cost no hydration pass.
 */
export function HomeLanding() {
  return (
    <SiteShell overHero>
      <HomeHero />
      <ProblemSection />
      <EvidenceLayerSection />
      <ObservationSection />
      <IncidentStorySection />
      <EvidenceArtifactSection />
      <HowItWorksSection />
      <ResearchTeaser />
      <LiveIntelligenceSection />
      <PricingSummary />
      <ReferenceSection />
      <MaintainerSection />
      <FinalCTASection />
    </SiteShell>
  );
}
