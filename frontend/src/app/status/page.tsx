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
        lede="RELIASTRA’s own health is reported the same way we report vendors: explicitly, with distinct states for distinct causes."
        breadcrumbs={crumbs}
        related={[
          { label: 'Live vendor status', href: '/track', description: 'Vendor posture, not platform health.' },
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
            Operators can poll <code>GET /health</code> on the API for the deployment
            contract (Postgres, Redis, worker and scheduler liveness). See the
            operating-model documentation for the runtime contract.
          </p>
          <h2>Vendor status vs platform status</h2>
          <p>
            This page reports RELIASTRA’s own health. Live third-party posture lives on{' '}
            <a href="/track">Track</a>, where each vendor page shows current state,
            uptime, latency and incident history measured independently.
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
