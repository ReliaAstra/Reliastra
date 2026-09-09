import { DEFAULT_REGIONS } from '@/lib/product-contract';

/**
 * What RELIASTRA actually observes.
 *
 * Built with CSS rather than SVG for one reason: the composition has to
 * survive a 360px viewport without becoming a shrunk desktop diagram. Lanes
 * stack, the rail becomes a left border, and nothing is scaled down until it
 * is unreadable.
 *
 * The structure is the product's real shape. Your application calls the
 * dependency. RELIASTRA measures the same dependency from regions that are
 * neither your network nor the vendor's, and each observation records region,
 * status code, latency and whether it was up.
 */

type Dependency = {
  name: string;
  kind: string;
  state: 'healthy' | 'degraded' | 'critical';
  /** Illustrative latency per region, in the order DEFAULT_REGIONS lists them. */
  latency: [number, number];
  status: [number, number];
};

const DEPENDENCIES: Dependency[] = [
  {
    name: 'payments-api',
    kind: 'payments',
    state: 'critical',
    latency: [4120, 3870],
    status: [503, 503],
  },
  {
    name: 'identity-api',
    kind: 'identity',
    state: 'healthy',
    latency: [112, 138],
    status: [200, 200],
  },
  {
    name: 'model-api',
    kind: 'inference',
    state: 'degraded',
    latency: [688, 742],
    status: [200, 429],
  },
  {
    name: 'cdn-edge',
    kind: 'edge',
    state: 'healthy',
    latency: [51, 44],
    status: [200, 200],
  },
];

const STATE_WORD: Record<Dependency['state'], string> = {
  healthy: 'Operational',
  degraded: 'Degraded',
  critical: 'Down',
};

export function DependencyTopology() {
  return (
    <div className="ob-topo">
      <div className="ob-topo-lanes">
        <div className="ob-topo-lane">
          <span className="ob-label">Your network</span>
          <p className="ob-topo-lane-note">Calls the dependency</p>
        </div>
        <div className="ob-topo-lane">
          <span className="ob-label">RELIASTRA probes</span>
          <p className="ob-topo-lane-note">
            Independent regions: {DEFAULT_REGIONS.join(' · ')}
          </p>
        </div>
      </div>

      <ul className="ob-topo-list">
        {DEPENDENCIES.map((dep) => (
          <li key={dep.name} className="ob-topo-node" data-state={dep.state}>
            <span className="ob-topo-edge" aria-hidden>
              <span className="ob-topo-edge-label">your traffic</span>
            </span>

            <div className="ob-topo-card">
              <div className="ob-topo-id">
                <span className="ob-dot" data-state={dep.state} />
                <span className="ob-topo-name">{dep.name}</span>
                <span className="ob-topo-kind">{dep.kind}</span>
              </div>

              <dl className="ob-topo-readings">
                {DEFAULT_REGIONS.map((region, i) => (
                  <div key={region} className="ob-topo-reading">
                    <dt>{region}</dt>
                    <dd>
                      <span className="ob-topo-code">{dep.status[i]}</span>
                      <span className="ob-topo-ms">{dep.latency[i]} ms</span>
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="ob-topo-state" data-state={dep.state}>
                {STATE_WORD[dep.state]}
              </p>
            </div>

            <span className="ob-topo-edge ob-topo-edge-right" aria-hidden>
              <span className="ob-topo-edge-label">
                {DEFAULT_REGIONS.length} independent checks
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="ob-topo-foot">
        Each observation records region, status code, latency and whether the
        endpoint answered. Values are illustrative; the fields are the ones the
        product writes.
      </p>
    </div>
  );
}
