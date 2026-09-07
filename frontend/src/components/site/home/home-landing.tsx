import { SiteShell } from '@/components/site/site-shell';
import { HomeHero } from './hero';
import {
  AgenciesSection,
  DependencyChainSection,
  EvidenceArtifactSection,
  EvidenceLayerSection,
  FinalCTASection,
  HowItWorksSection,
  PartnerSection,
  ProblemSection,
  ReferenceSection,
} from './sections';
import { ResearchTeaser } from './research-teaser';
import { LiveIntelligenceSection } from './live-intelligence';
import { PricingSummary } from './pricing-summary';

/**
 * The RELIASTRA homepage.
 *
 * The narrative moves in one direction and does not double back:
 *
 *   01 hero          physical infrastructure
 *   02 problem       the dependencies you do not control
 *   03 RELIASTRA     the independent evidence layer
 *   04 method        observe → correlate → document → prove
 *   05 chain         obligation → application → dependency → evidence
 *   06 evidence      what the artifact actually contains
 *   07 research      the method, published
 *   08 public data   live independent vendor observation
 *   09 agencies      who carries the blame today
 *   10 partners      the distribution model
 *   11 pricing       what it costs
 *   12 CTA           start
 *
 * Entirely server-rendered. The only client JavaScript on this page is the
 * header (mobile menu + scroll state); every section above is static HTML, so
 * the whole story is present for a crawler, a language model, or a visitor on
 * a bad connection before any script executes.
 */
export function HomeLanding() {
  return (
    <SiteShell overHero>
      <HomeHero />
      <ProblemSection />
      <EvidenceLayerSection />
      <HowItWorksSection />
      <DependencyChainSection />
      <EvidenceArtifactSection />
      <ResearchTeaser />
      <LiveIntelligenceSection />
      <AgenciesSection />
      <PartnerSection />
      <PricingSummary />
      <ReferenceSection />
      <FinalCTASection />
    </SiteShell>
  );
}
