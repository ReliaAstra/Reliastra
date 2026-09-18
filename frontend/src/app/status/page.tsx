import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Status - Platform health',
  description:
    'RELIASTRA platform status: how to check system health, what the health endpoint reports, and where live vendor posture lives.',
  path: '/status',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Status', href: '/status' },
];

export default function StatusPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Status', path: '/status' },
        ])}
      />
      <MarketingPage
        eyebrow="Operations"
        title="Platform status"
        lede="RELIASTRA’s own health, reported the way vendors are reported."
        breadcrumbs={crumbs}
        related={[
          { label: 'Live vendor status', href: '/observatory', description: 'Vendor posture, not platform health.' },
          { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability', description: 'How liveness and states work.' },
          { label: 'Contact', href: '/contact', description: 'Report a platform problem.' },
        ]}
      >
        <Prose>
          <h2>Current state</h2>
          <p>
            The platform is operational. Scheduler and worker liveness are published as
            time-limited heartbeats and surfaced through the API health endpoint - a
            pipeline that has stopped is reported as broken rather than presenting an
            empty history.
          </p>
          <h2>Programmatic health</h2>
          <p>
            Operators can poll <code>GET /health</code> on the API for the
            deployment contract (Postgres, Redis, worker and scheduler
            liveness). The measurement rules behind these states are documented
            in <a href="/docs/methodology">the methodology</a>.
          </p>
          <h2>Vendor status vs platform status</h2>
          <p>
            This page reports RELIASTRA’s own health. What the probes measure of
            other people’s services lives in{' '}
            <a href="/observatory">the public observatory</a>, where each record
            shows current state, availability with its observation count, latency
            and incident history as measured.
          </p>
          <h2>Reporting a problem</h2>
          <p>
            Write to <a href="mailto:support@reliastra.com">support@reliastra.com</a> with
            the affected surface, time window (UTC) and any request IDs.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
