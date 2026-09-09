import Image from 'next/image';
import Link from 'next/link';
import { CTA, Container, StateIndicator } from '@/components/site/primitives';
import { SiteShell } from '@/components/site/site-shell';
import { AUTH_ROUTES, CONSOLE_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

/**
 * /agencies
 *
 * The agency page is a product story, not a plan document. Every surface below
 * is illustrative demo data, labelled as such, and uses the same vocabulary as
 * the authenticated agency console: environments, applications, dependencies,
 * incidents and evidence.
 */

const WORKFLOW = [
  {
    label: 'Clients',
    title: 'Keep every account in view.',
    body: 'Organize environments by the client who depends on them.',
  },
  {
    label: 'Services',
    title: 'Know what each stack touches.',
    body: 'Connect applications to the external services behind them.',
  },
  {
    label: 'Incidents',
    title: 'See what failed.',
    body: 'Roll up the state that needs an operator now.',
  },
  {
    label: 'Evidence',
    title: 'Preserve what happened.',
    body: 'Keep timestamped observations on the same incident timeline.',
  },
  {
    label: 'Reports',
    title: 'Hand over the record.',
    body: 'Give the client a professional explanation, not a recollection.',
  },
] as const;

const CLIENTS = [
  { name: 'Meridian Commerce', meta: 'Checkout · 8 dependencies', state: 'critical' as const },
  { name: 'Beacon Ledger', meta: 'Payments · 6 dependencies', state: 'degraded' as const },
  { name: 'Atlas Commerce', meta: 'Storefront · 9 dependencies', state: 'healthy' as const },
] as const;

const CAPABILITIES = [
  ['Client environments', 'Keep every client stack organized.'],
  ['Dependency attribution', 'Trace incidents beyond the application layer.'],
  ['Evidence', 'Generate timestamped incident records.'],
  ['Client reporting', 'Give clients a professional explanation.'],
  ['White label', 'Present evidence under your agency brand.'],
  ['API', 'Fit RELIASTRA into the workflow you already run.'],
] as const;

export function AgenciesPage() {
  return (
    <SiteShell overHero>
      <Hero />

      <section className="agency-light-section agency-overview" aria-labelledby="portfolio-title">
        <Container>
          <div className="agency-section-intro agency-reveal">
            <p className="agency-kicker agency-kicker-dark">The agency view</p>
            <h2 id="portfolio-title" className="agency-heading agency-heading-dark">
              One place for every client.
            </h2>
            <p className="agency-intro-copy agency-copy-dark">
              RELIASTRA turns a portfolio of external dependencies into one clear operating view.
            </p>
          </div>

          <PortfolioConsole />
        </Container>
      </section>

      <section className="agency-dark-section agency-failure" aria-labelledby="failure-title">
        <Container>
          <div className="agency-two-column agency-failure-grid">
            <div className="agency-section-intro agency-reveal">
              <p className="agency-kicker">See the failure</p>
              <h2 id="failure-title" className="agency-heading">
                When something breaks, know what broke.
              </h2>
              <p className="agency-intro-copy">
                RELIASTRA connects the application, dependency, region and incident so your team can stop guessing at the cause.
              </p>
              <Link href={PUBLIC_ROUTES.dependencyMonitoring} className="agency-text-link">
                Explore dependency monitoring <span aria-hidden>↗</span>
              </Link>
            </div>

            <FailureTrace />
          </div>
        </Container>
      </section>

      <section className="agency-light-section agency-evidence" aria-labelledby="evidence-title">
        <Container>
          <div className="agency-two-column agency-evidence-grid">
            <div className="agency-section-intro agency-reveal">
              <p className="agency-kicker agency-kicker-dark">From incident to evidence</p>
              <h2 id="evidence-title" className="agency-heading agency-heading-dark">
                Hand your client evidence. Not an explanation.
              </h2>
              <p className="agency-intro-copy agency-copy-dark">
                Turn the incident timeline into a report that is clear enough for a decision-maker and precise enough for an engineer.
              </p>
              <Link href={PUBLIC_ROUTES.incidentEvidence} className="agency-text-link agency-text-link-dark">
                See how evidence works <span aria-hidden>↗</span>
              </Link>
            </div>

            <EvidenceArtifact />
          </div>
        </Container>
      </section>

      <section className="agency-dark-section agency-portal" aria-labelledby="portal-title">
        <Container>
          <div className="agency-two-column agency-portal-grid">
            <ClientPortal />
            <div className="agency-section-intro agency-reveal">
              <p className="agency-kicker">Client communication</p>
              <h2 id="portal-title" className="agency-heading">
                Make the handoff feel as considered as the investigation.
              </h2>
              <p className="agency-intro-copy">
                Give clients a polished view of their service, current status and the record behind the incident.
              </p>
              <Link href={PUBLIC_ROUTES.docsEvidence} className="agency-text-link">
                Read the evidence documentation <span aria-hidden>↗</span>
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <section className="agency-light-section agency-workflow" id="how-it-works" aria-labelledby="workflow-title">
        <Container>
          <div className="agency-section-intro agency-reveal">
            <p className="agency-kicker agency-kicker-dark">Built for the way agencies operate</p>
            <h2 id="workflow-title" className="agency-heading agency-heading-dark">
              From client to proof.
            </h2>
          </div>

          <ol className="agency-workflow-list">
            {WORKFLOW.map((step, index) => (
              <li key={step.label} className="agency-workflow-item">
                <div className="agency-workflow-line" aria-hidden>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {index < WORKFLOW.length - 1 && <i />}
                </div>
                <div>
                  <p className="agency-kicker agency-kicker-dark">{step.label}</p>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="agency-light-section agency-capabilities" aria-labelledby="capabilities-title">
        <Container>
          <div className="agency-capability-heading agency-reveal">
            <div>
              <p className="agency-kicker agency-kicker-dark">The operating layer</p>
              <h2 id="capabilities-title" className="agency-heading agency-heading-dark">
                Everything your team needs to defend the record.
              </h2>
            </div>
            <p className="agency-intro-copy agency-copy-dark">
              Focused capabilities for the work between the outage and the client call.
            </p>
          </div>

          <div className="agency-capability-grid">
            {CAPABILITIES.map(([title, body]) => (
              <article key={title} className="agency-capability">
                <span className="agency-capability-rule" aria-hidden />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>

          <div className="agency-enterprise-note">
            <span className="agency-kicker agency-kicker-dark">For enterprise agency teams</span>
            <p>Client isolation, client-facing reports and white-label branding are available as Enterprise capabilities.</p>
            <Link href={PUBLIC_ROUTES.pricing} className="agency-text-link agency-text-link-dark">See plans <span aria-hidden>↗</span></Link>
          </div>
        </Container>
      </section>

      <section className="agency-dark-section agency-final-cta" aria-labelledby="final-cta-title">
        <Container>
          <div className="agency-final-cta-inner agency-reveal">
            <p className="agency-kicker">RELIASTRA for agencies</p>
            <h2 id="final-cta-title" className="agency-final-heading">Know what happened.</h2>
            <p className="agency-final-copy">RELIASTRA gives your agency the evidence to prove it.</p>
            <div className="agency-cta-row">
              <CTA href={AUTH_ROUTES.signup} tone="signal">Start free</CTA>
              <CTA href={PUBLIC_ROUTES.contact} tone="outline">Talk to sales</CTA>
            </div>
          </div>
        </Container>
      </section>
    </SiteShell>
  );
}

function Hero() {
  return (
    <header className="agency-hero">
      <Image
        src="/media/hero-datacenter-aisle.jpg"
        alt="A dark data center aisle with illuminated infrastructure racks"
        fill
        priority
        sizes="100vw"
        className="agency-hero-image"
      />
      <div className="agency-hero-shade" aria-hidden />
      <Container>
        <div className="agency-hero-content">
          <div className="agency-hero-copy agency-reveal">
            <p className="agency-kicker agency-kicker-signal">For agencies · MSPs · infrastructure teams</p>
            <h1 className="agency-hero-heading">
              Your client&apos;s outage.
              <br />
              <span>Your reputation.</span>
            </h1>
            <p className="agency-hero-subline">
              RELIASTRA gives you an independent record of what failed, when it failed and what caused it.
            </p>
            <div className="agency-cta-row">
              <CTA href={AUTH_ROUTES.signup} tone="signal">Start free</CTA>
              <CTA href="#how-it-works" tone="outline">See how it works</CTA>
            </div>
          </div>
          <HeroTelemetry />
          <div className="agency-hero-footer">
            <span>External Dependency Intelligence</span>
            <span className="agency-hero-footer-line" aria-hidden />
            <span>Independent observation · incident attribution · evidence</span>
          </div>
        </div>
      </Container>
    </header>
  );
}

function HeroTelemetry() {
  return (
    <div className="agency-hero-telemetry agency-float" aria-label="Illustrative agency incident view">
      <div className="agency-telemetry-topline">
        <span className="agency-demo-tag">Illustrative view</span>
        <span className="agency-mono agency-telemetry-time">14:44:18 UTC</span>
      </div>
      <div className="agency-telemetry-layout">
        <div className="agency-telemetry-network">
          <div className="agency-network-node agency-network-node-app">
            <span className="agency-network-dot agency-dot-signal" />
            <span><b>Checkout</b><small>Meridian Commerce</small></span>
          </div>
          <span className="agency-network-connector agency-connector-warn" aria-hidden />
          <div className="agency-network-node agency-network-node-dep">
            <span className="agency-network-dot agency-dot-critical" />
            <span><b>Stripe API</b><small>Dependency</small></span>
          </div>
          <span className="agency-network-connector agency-connector-broken" aria-hidden />
          <div className="agency-network-node">
            <span className="agency-network-dot agency-dot-muted" />
            <span><b>eu-west-1</b><small>Observation region</small></span>
          </div>
        </div>
        <div className="agency-telemetry-alert">
          <div>
            <p className="agency-label-light">Incident confirmed</p>
            <strong>Payment API degradation</strong>
          </div>
          <span className="agency-status-pill agency-status-pill-critical">Open</span>
        </div>
      </div>
    </div>
  );
}

function PortfolioConsole() {
  return (
    <div className="agency-console agency-reveal" aria-label="Illustrative RELIASTRA agency console">
      <div className="agency-console-bar">
        <div className="agency-console-brand"><span className="agency-signal-mark" /> AGENCY OPERATIONS</div>
        <span className="agency-demo-tag agency-demo-tag-dark">Demo data · representative view</span>
      </div>
      <div className="agency-console-summary">
        <Metric label="Environments" value="04" />
        <Metric label="Services" value="23" />
        <Metric label="Dependencies" value="31" />
        <Metric label="Availability · 24h" value="99.61%" tone="healthy" />
      </div>
      <div className="agency-console-body">
        <div className="agency-client-list">
          <div className="agency-console-section-title"><span>Client environments</span><span className="agency-console-muted">Status · last observation</span></div>
          {CLIENTS.map((client) => (
            <div className="agency-client-row" key={client.name}>
              <div className="agency-client-name"><span className={cn('agency-state-dot', `agency-state-dot-${client.state}`)} /><span><b>{client.name}</b><small>{client.meta}</small></span></div>
              <StateIndicator state={client.state} label={client.state === 'critical' ? 'Critical' : client.state === 'degraded' ? 'Degraded' : 'Operational'} />
              <span className="agency-client-time">{client.state === 'critical' ? '4m ago' : client.state === 'degraded' ? '1h ago' : 'none'}</span>
            </div>
          ))}
        </div>
        <div className="agency-active-incident">
          <div className="agency-console-section-title"><span>Active incident</span><span className="agency-status-pill agency-status-pill-critical">Open</span></div>
          <div className="agency-incident-client">Meridian Commerce <span>·</span> Checkout</div>
          <div className="agency-incident-cause"><span className="agency-state-dot agency-state-dot-critical" /> Stripe API dependency degradation</div>
          <div className="agency-incident-bottom"><span className="agency-console-muted">Attribution confidence</span><b>Correlated</b></div>
          <Link href={CONSOLE_ROUTES.clients} className="agency-console-link">Open agency console <span aria-hidden>↗</span></Link>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'healthy' }) {
  return (
    <div className="agency-metric">
      <span>{label}</span>
      <strong className={tone ? 'agency-metric-healthy' : undefined}>{value}</strong>
    </div>
  );
}

function FailureTrace() {
  return (
    <div className="agency-trace-wrap agency-reveal" aria-label="Illustrative incident attribution timeline">
      <div className="agency-trace-heading">
        <div><p className="agency-label-light">Illustrative incident · INC-2048</p><h3>Checkout degraded.</h3></div>
        <span className="agency-status-pill agency-status-pill-critical">Attribution ready</span>
      </div>
      <div className="agency-trace-path">
        <TraceNode time="14:41" title="Application" value="Checkout latency rises" state="warn" />
        <TraceNode time="14:42" title="Dependency" value="Stripe API degrades" state="critical" />
        <TraceNode time="14:43" title="Region" value="eu-west-1 confirms" state="critical" />
        <TraceNode time="14:44" title="Evidence" value="Observations preserved" state="healthy" last />
      </div>
      <div className="agency-trace-footer"><span>Meridian Commerce</span><span>Payment API</span><span>14:41–14:49 UTC</span></div>
    </div>
  );
}

function TraceNode({ time, title, value, state, last }: { time: string; title: string; value: string; state: 'warn' | 'critical' | 'healthy'; last?: boolean }) {
  return (
    <div className="agency-trace-node">
      <span className="agency-trace-time">{time}</span>
      <span className={cn('agency-trace-dot', `agency-trace-dot-${state}`)} />
      {!last && <span className="agency-trace-rail" aria-hidden />}
      <div><p>{title}</p><strong>{value}</strong></div>
    </div>
  );
}

function EvidenceArtifact() {
  return (
    <article className="agency-report agency-reveal" aria-label="Illustrative incident evidence report">
      <div className="agency-report-head">
        <div><span className="agency-report-mark">R</span><span className="agency-report-brand">RELIASTRA / EVIDENCE</span></div>
        <span className="agency-demo-tag agency-demo-tag-dark">Illustrative record</span>
      </div>
      <div className="agency-report-title-row"><div><p className="agency-report-eyebrow">INCIDENT REPORT</p><h3>Payment API degradation</h3></div><span className="agency-report-verified"><i /> Verified</span></div>
      <div className="agency-report-grid">
        <ReportField label="Impact" value="Checkout requests affected" />
        <ReportField label="Dependency" value="Stripe API" />
        <ReportField label="Observation" value="Multi-region latency increase" />
        <ReportField label="Time window" value="14:41–14:49 UTC" />
      </div>
      <div className="agency-report-chart">
        <div className="agency-chart-labels"><span>Latency · ms</span><span>14:41 <b>·</b> 14:49 UTC</span></div>
        <div className="agency-chart-grid" aria-hidden><span /><span /><span /><span /><span /></div>
        <svg viewBox="0 0 560 112" preserveAspectRatio="none" role="img" aria-label="Illustrative latency chart showing a spike during the incident">
          <path d="M0 82 C38 79 60 84 94 80 S145 82 178 78 S218 87 244 81 S270 82 290 79 L318 75 L338 20 L350 45 L366 13 L383 62 L398 35 L416 68 L434 55 L453 73 C482 82 513 78 560 80" />
          <line x1="318" y1="8" x2="318" y2="104" />
          <line x1="453" y1="8" x2="453" y2="104" />
        </svg>
      </div>
      <div className="agency-report-foot"><span><i className="agency-report-check" /> Timestamped observations</span><span className="agency-report-hash">SHA-256 · 7b2e…91ac</span></div>
    </article>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return <div><p>{label}</p><strong>{value}</strong></div>;
}

function ClientPortal() {
  return (
    <article className="agency-portal-card agency-reveal" aria-label="Illustrative client portal">
      <div className="agency-portal-nav"><span className="agency-portal-client-mark">M</span><div><b>Meridian Commerce</b><small>Service reliability portal</small></div><span className="agency-portal-live"><i /> Live view</span></div>
      <div className="agency-portal-status"><div><p className="agency-label-light">Checkout</p><h3>Resolved</h3></div><span className="agency-status-pill agency-status-pill-healthy">Operational</span></div>
      <div className="agency-portal-facts">
        <div><span>Root dependency</span><b>Stripe API</b></div>
        <div><span>Incident window</span><b>14:41–14:49 UTC</b></div>
        <div><span>Evidence</span><b className="agency-portal-verified"><i /> Verified</b></div>
      </div>
      <div className="agency-portal-action"><span>Report / INC-2048</span><b>View incident evidence <span aria-hidden>↗</span></b></div>
      <p className="agency-portal-demo">Demo portal · not a customer record</p>
    </article>
  );
}
