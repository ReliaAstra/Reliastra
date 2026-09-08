import { SiteShell } from '@/components/site/site-shell';
import { HomeHero } from './hero';
import {
  AgenciesSection,
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
 *   01 hero          physical infrastructure
 *   02 problem       the dependencies you do not control
 *   03 RELIASTRA     the independent record
 *   04 method        observe, correlate, document, prove
 *   05 evidence      what the artifact contains
 *   06 research      the method, published
 *   07 public data   live independent vendor observation
 *   08 agencies      multi-client accountability
 *   09 partners      the distribution model
 *   10 pricing       what it costs
 *      reference     definitions
 *   11 CTA           start
 *
 * Entirely server-rendered. The only client JavaScript on this page is the
 * header (mobile menu + scroll state).
 */
export function HomeLanding() {
  return (
    <SiteShell overHero>
      <HomeHero />
      <ProblemSection />
      <EvidenceLayerSection />
      <HowItWorksSection />
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
