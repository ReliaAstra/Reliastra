import { SiteShell } from '@/components/site/site-shell';
import { HomeHero } from './hero';
import { Manifesto } from './scenes';
import { MethodSection } from './method-bands';
import { IndexScene } from './index-scene';
import { PricingSummary } from './pricing-summary';
import { FinalCTASection, MaintainerSection, ReferenceSection } from './sections';

/**
 * The RELIASTRA homepage, composed as scenes.
 *
 * Deliberately short. The homepage makes the proposition at billboard scale
 * and links to the pages that prove it — `/product` owns the explanation,
 * `/product/evidence` owns the artifact, `/observatory` owns the live data,
 * `/docs` owns the method, `/research` owns the papers. A section that
 * repeats what one of those pages already says is a section this page
 * does not need.
 *
 *   top          the proposition, staged on a full-viewport Earth
 *   statement    the claim, in one sentence
 *   observation  what the product does, in three sentences
 *   index        the same probes, published (real data or an honest empty state)
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
      <Manifesto>
        Your infrastructure includes services you do not operate.
      </Manifesto>
      <MethodSection />
      <IndexScene />
      <PricingSummary />
      <ReferenceSection />
      <MaintainerSection />
      <FinalCTASection />
    </SiteShell>
  );
}
