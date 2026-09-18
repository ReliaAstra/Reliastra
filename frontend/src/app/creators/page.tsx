import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import {
  breadcrumbJsonLd,
  buildMetadata,
  canonicalUrl,
} from '@/lib/seo';
import { EXTERNAL_LINKS, PUBLIC_ROUTES } from '@/lib/routes';

export const metadata = buildMetadata({
  title: 'Technical creators - RELIASTRA',
  description:
    'RELIASTRA works with technical creators and publishers whose audiences care about software infrastructure: SRE, platform engineering, cloud, AI infrastructure, security.',
  path: PUBLIC_ROUTES.creators,
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Technical creators', href: PUBLIC_ROUTES.creators },
];

/**
 * The Technical Creator Program.
 *
 * Deliberately small. RELIASTRA does not run an affiliate network, a
 * commission portal or a partner dashboard: this page is the program. The
 * audience is technical creators and publishers whose readers operate
 * infrastructure - not agencies, not referral networks.
 */
export default function CreatorsPage() {
  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Technical creators', path: PUBLIC_ROUTES.creators },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.creators),
            url: canonicalUrl(PUBLIC_ROUTES.creators),
            name: 'Technical creators - RELIASTRA',
            inLanguage: 'en',
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb items={crumbs} className="mb-8" />
          <Eyebrow>Creators</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[20ch]">
            For people who publish about infrastructure.
          </h1>
          <p className="ob-lede mt-6 max-w-[60ch]">
            If your audience runs software in production - SREs, platform
            engineers, cloud and AI infrastructure builders - and you think
            dependency evidence is a real problem, we would like to work with
            you. Directly, and simply.
          </p>
        </Container>
      </header>

      <Section tone="base" aria-labelledby="who-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Who this is for</Eyebrow>
              <h2 id="who-heading" className="ob-h2 max-w-[16ch]">
                Technically credible audiences.
              </h2>
            </div>
            <ul className="flex flex-col">
              {[
                'Kubernetes and cloud-native creators',
                'SRE and reliability educators',
                'Platform and DevOps engineering channels',
                'AI infrastructure and LLM-ops publications',
                'Infrastructure and security newsletters',
              ].map((item) => (
                <li
                  key={item}
                  className="border-t border-[var(--ob-line)] py-4 text-[15px] text-[var(--ob-text-2)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Section tone="void" aria-labelledby="how-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>How it works</Eyebrow>
              <h2 id="how-heading" className="ob-h2 max-w-[16ch]">
                A link, a conversation, nothing to administer.
              </h2>
            </div>
            <dl className="flex flex-col">
              {[
                [
                  'A tracked link',
                  'You get a referral code. Signups through your link are attributed, so you can see what your publishing actually drives.',
                ],
                [
                  'Full access',
                  'You use the product itself - the trial is the same 14 days everyone gets, and we are happy to answer the awkward methodology questions.',
                ],
                [
                  'Settled manually',
                  'There is no commission dashboard to babysit. Terms are agreed once, in email, and settled by a person.',
                ],
              ].map(([term, desc]) => (
                <div
                  key={term}
                  className="border-t border-[var(--ob-line)] py-5"
                >
                  <dt className="text-[15px] font-semibold leading-snug text-[var(--ob-text)]">
                    {term}
                  </dt>
                  <dd className="mt-1.5 max-w-[58ch] text-[14px] leading-[1.6] text-[var(--ob-text-3)]">
                    {desc}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <Section tone="base" aria-labelledby="contact-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Get in touch</Eyebrow>
              <h2 id="contact-heading" className="ob-h2 max-w-[16ch]">
                One email. A human reads it.
              </h2>
            </div>
            <div className="flex flex-col gap-6">
              <p className="ob-body max-w-[56ch]">
                Write to{' '}
                <a
                  href="mailto:support@reliastra.com?subject=Technical%20creator%20program"
                  className="ob-link"
                >
                  support@reliastra.com
                </a>{' '}
                with a link to your work and who you write for. If it is a fit,
                the next step is a short conversation, not a form.
              </p>
              <p className="ob-small max-w-[56ch]">
                Read the{' '}
                <Link href={PUBLIC_ROUTES.about} className="ob-link">
                  about page
                </Link>{' '}
                and the{' '}
                <Link href={PUBLIC_ROUTES.research} className="ob-link">
                  research
                </Link>{' '}
                first - they explain what RELIASTRA is and what it refuses to
                claim. The engineering is public on{' '}
                <a
                  href={EXTERNAL_LINKS.github}
                  className="ob-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
                .
              </p>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}
