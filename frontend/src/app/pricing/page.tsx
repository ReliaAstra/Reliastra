import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { PaymentCurrencyDisclosure } from '@/components/site/billing-disclosure';
import { PlanMatrix } from '@/components/site/plan-matrix';
import { PLAN_CAPABILITIES } from '@/components/site/plan-data';
import { ALL_PLANS, getPlan } from '@/lib/dashboard/plans';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';
import { AUTH_ROUTES, EXTERNAL_LINKS, PUBLIC_ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

export const metadata = buildMetadata({
  title: 'Pricing - Free, Pro and Enterprise',
  description:
    'RELIASTRA pricing: Free (3 dependencies, 1-minute checks), Pro $39/month (50 dependencies, 15-second checks, attribution and evidence), Enterprise (custom scale, client isolation, white-label). Every plan limit is enforced server-side.',
  path: PUBLIC_ROUTES.pricing,
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Pricing', href: PUBLIC_ROUTES.pricing },
];

/**
 * Pricing.
 *
 * Two rules govern this page and neither is negotiable:
 *
 * 1. **Capabilities come from the entitlement table.** Every tick below is a
 *    boolean read off `lib/dashboard/plans`, which mirrors the backend's
 *    `app.core.permissions`. The page cannot advertise something the API does
 *    not grant, because there is no hand-written feature list to get wrong.
 *
 * 2. **The charged currency is stated, not implied.** Prices are listed in
 *    USD; Paystack charges in the currency the backend resolves. The
 *    transparency triple (list price → actual charge → provider) and the
 *    canonical disclosure paragraph are rendered from
 *    `lib/billing/currency`, the same module the checkout uses.
 */
export default function PricingPage() {
  const plans = ALL_PLANS.map((id) => getPlan(id));

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Pricing', path: PUBLIC_ROUTES.pricing },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'RELIASTRA',
            description:
              'External Dependency Intelligence: independent dependency monitoring, deterministic incident attribution and verifiable SLA evidence.',
            brand: { '@type': 'Brand', name: 'RELIASTRA' },
            offers: plans
              .filter((p) => p.priceMonthly !== null)
              .map((p) => ({
                '@type': 'Offer',
                name: p.name,
                price: String(p.priceMonthly),
                priceCurrency: 'USD',
                url: canonicalUrl(AUTH_ROUTES.signup),
                availability: 'https://schema.org/InStock',
              })),
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb items={crumbs} className="mb-8" />
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[16ch]">
            Three plans. Limits enforced server-side.
          </h1>
          <p className="ob-lede mt-6">
            Start measuring for free. Every new organization gets a 14-day Pro
            trial with attribution and evidence enabled — no payment method
            required. Move to Enterprise when client isolation and white-label
            reporting matter.
          </p>
        </Container>
      </header>

      {/* Plan columns — the same matrix the homepage renders */}
      <Section tone="void" divider={false} tight aria-labelledby="plans-heading">
        <Container>
          {/* Named for assistive tech and to keep the document outline
              contiguous (h1 → h2 → h3 plan names). */}
          <h2 id="plans-heading" className="sr-only">
            Plans
          </h2>
          <PlanMatrix />
        </Container>
      </Section>

      {/* Currency disclosure — first-class, not a footnote */}
      <Section tone="void" divider={false} tight aria-labelledby="currency-heading">
        <Container>
          <h2 id="currency-heading" className="sr-only">
            Billing currency
          </h2>
          <PaymentCurrencyDisclosure />
        </Container>
      </Section>

      {/* Capability matrix */}
      <Section tone="base" aria-labelledby="capabilities-heading">
        <Container>
          <div className="flex flex-col gap-5 pb-10">
            <Eyebrow>Capabilities</Eyebrow>
            <h2 id="capabilities-heading" className="ob-h2 max-w-[18ch]">
              What each plan actually grants.
            </h2>
            <p className="ob-body">
              This table is generated from the same entitlement definitions the
              API enforces. If a capability is not ticked, the backend will
              refuse the request — the UI cannot promise otherwise.
            </p>
          </div>

          <div className="ob-scroll-x">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                RELIASTRA plan capability comparison
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="ob-label border-b border-[var(--ob-line-2)] py-4 pr-6 font-medium"
                  >
                    Capability
                  </th>
                  {plans.map((p) => (
                    <th
                      key={p.id}
                      scope="col"
                      className="ob-label border-b border-[var(--ob-line-2)] px-4 py-4 text-center font-medium"
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_CAPABILITIES.map((cap) => (
                  <tr key={cap.label}>
                    <th
                      scope="row"
                      className="border-b border-[var(--ob-line)] py-3.5 pr-6 text-[14px] font-normal text-[var(--ob-text-2)]"
                    >
                      {cap.label}
                    </th>
                    {plans.map((p) => {
                      const on = cap.get(p);
                      return (
                        <td
                          key={p.id}
                          className="border-b border-[var(--ob-line)] px-4 py-3.5 text-center"
                        >
                          <span className="sr-only">
                            {on ? 'Included' : 'Not included'}
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              'ob-mono text-[13px]',
                              on
                                ? 'text-[var(--ob-healthy)]'
                                : 'text-[var(--ob-text-4)]'
                            )}
                          >
                            {on ? 'yes' : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      {/* Billing terms */}
      <Section tone="void" aria-labelledby="terms-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Billing</Eyebrow>
              <h2 id="terms-heading" className="ob-h2 max-w-[14ch]">
                The terms, stated once.
              </h2>
            </div>
            <dl className="flex flex-col">
              {[
                [
                  'Trial',
                  'Every new organization starts on a 14-day Pro trial with attribution, evidence, Slack alerts and API access enabled. No payment method is required to start it.',
                ],
                [
                  'After the trial',
                  'An organization that does not upgrade continues on Free: 3 dependencies, 1-minute checks, 24-hour retention and email alerts. Nothing is deleted at the moment the trial ends beyond the retention window of the plan you are on.',
                ],
                [
                  'Renewal',
                  'Paid plans renew for the interval you selected until cancelled. Cancellation takes effect at the end of the paid period.',
                ],
                [
                  'Enforcement',
                  'Dependency counts, check intervals, retention windows, seat counts and feature access are enforced by the API, not by the interface.',
                ],
                [
                  'Enterprise',
                  <>
                    Priced against scope rather than a list. Talk to{' '}
                    <a href={EXTERNAL_LINKS.salesEmail} className="ob-link">
                      sales@reliastra.com
                    </a>{' '}
                    about client isolation, white-label reporting, custom
                    retention and contractual terms.
                  </>,
                ],
                [
                  'Governing terms',
                  <>
                    Trials, renewals, cancellation and refunds are governed by
                    the{' '}
                    <Link href={PUBLIC_ROUTES.terms} className="ob-link">
                      Terms of Service
                    </Link>{' '}
                    and the{' '}
                    <Link href={PUBLIC_ROUTES.privacy} className="ob-link">
                      Privacy Policy
                    </Link>
                    .
                  </>,
                ],
              ].map(([term, body], i) => (
                <div
                  key={i}
                  className="grid gap-2 border-t border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(140px,200px)_1fr] sm:gap-8"
                >
                  <dt className="ob-label pt-1">{term}</dt>
                  <dd className="max-w-[64ch] text-[14.5px] leading-[1.68] text-[var(--ob-text-2)]">
                    {body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <Section tone="base" tight aria-labelledby="pricing-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="pricing-cta" className="ob-h2 max-w-[17ch]">
                Produce a real evidence report before you decide.
              </h2>
              <p className="ob-body max-w-[56ch]">
                The trial includes the capabilities the decision actually turns
                on. Add a dependency, wait for a check interval, and see what
                the record looks like.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start 14-day Pro trial
              </Link>
              <Link
                href={PUBLIC_ROUTES.contact}
                className="ob-btn ob-btn-outline"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}
