import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Pricing — Free, Pro & Enterprise',
  description:
    'RELIASTRA pricing: Free (3 dependencies, 1-minute checks), Pro $39/mo (50 dependencies, 15-second checks, evidence + attribution), Enterprise (custom scale, white-label).',
  path: '/pricing',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Pricing', href: '/pricing' },
];

const PLANS = [
  { name: 'Free', price: '$0', facts: '3 dependencies · 1-minute checks · 24-hour retention · email alerts', cta: 'Start free' },
  { name: 'Pro', price: '$39/mo ($390/yr)', facts: '50 dependencies · 15-second checks · 90-day retention · Slack + API + attribution + evidence', cta: 'Upgrade to Pro' },
  { name: 'Enterprise', price: 'Custom', facts: 'Custom scale · client isolation · white-label reporting · contact sales', cta: 'Contact sales' },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Pricing', path: '/pricing' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'RELIASTRA',
            description: 'External Dependency Intelligence: monitoring, attribution, SLA evidence.',
            brand: { '@type': 'Brand', name: 'RELIASTRA' },
            offers: [
              { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', url: canonicalUrl('/signup') },
              { '@type': 'Offer', name: 'Pro', price: '39', priceCurrency: 'USD', url: canonicalUrl('/signup') },
            ],
          },
        ]}
      />
      <MarketingPage
        eyebrow="Pricing"
        title="Pricing that scales with your dependency graph"
        lede="Start measuring for free. Upgrade to Pro to generate evidence and alert your team. Move to Enterprise for client isolation and white-label reporting."
        breadcrumbs={crumbs}
        related={[
          { label: 'Product', href: '/product', description: 'What each tier unlocks.' },
          { label: 'Security', href: '/security', description: 'How your data is protected on every plan.' },
          { label: 'Quickstart', href: '/docs/quickstart', description: 'First check in minutes, free.' },
          { label: 'Contact sales', href: '/contact', description: 'Enterprise scoping and custom retention.' },
        ]}
      >
        <Prose>
          <h2>Plans</h2>
        </Prose>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <section key={p.name} className="rounded-xl border border-zinc-200 p-6 dark:border-white/10">
              <h2 className="text-base font-semibold">{p.name}</h2>
              <p className="mt-1 font-mono text-2xl font-bold">{p.price}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p.facts}</p>
            </section>
          ))}
        </div>
        <div className="mt-8">
          <Prose>
            <h2>Which plan generates evidence?</h2>
            <p>
              Evidence generation, deterministic attribution, API access, Slack alerts and
              historical analysis are Pro capabilities (14-day Pro trial on every new
              organization, no card required). Free covers trying RELIASTRA: vendor
              tracking, basic incident detection and email alerts.
            </p>
            <h2>Billing</h2>
            <p>
              Paid plans renew monthly until cancelled and are billed through our payment
              provider. Plan limits are enforced server-side. Full terms govern trials,
              renewals and cancellations — see <a href="/terms">Terms</a> and{' '}
              <a href="/privacy">Privacy</a>.
            </p>
            <h2>What to do next</h2>
            <p>
              <a href="/signup">Create an organization</a> or{' '}
              <a href="/contact">talk to sales</a> about Enterprise.
            </p>
          </Prose>
        </div>
      </MarketingPage>
    </>
  );
}
