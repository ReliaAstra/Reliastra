import {
  CHECK_INTERVAL_SECONDS,
  OBSERVATION_POINT_COUNT,
  OBSERVATION_POINT_LABEL,
} from '@/lib/product-contract';

/**
 * What RELIASTRA actually observes.
 *
 * Built with CSS rather than SVG for one reason: the composition has to
 * survive a 360px viewport without becoming a shrunk desktop diagram. Lanes
 * stack, the rail becomes a left border, and nothing is scaled down until it
 * is unreadable.
 *
 * The structure is the product's real shape. Your application calls the
 * dependency. RELIASTRA measures the same dependency on a fixed interval from
 * infrastructure that is neither your network nor the vendor's, and each
 * observation records a timestamp, status code, latency and whether it was up.
 *
 * One observation point, shown honestly as one: the two readings per
 * dependency are two *consecutive checks* at different timestamps, not two
 * independent places. RELIASTRA deploys a single observation point today, and
 * a diagram that drew two would be claiming a fleet that does not exist.
 */

/** Timestamps of the two most recent checks, one interval apart. */
const CHECK_TIMES = ['09:12:41', '09:17:41'] as const;

type Dependency = {
  name: string;
  kind: string;
  state: 'healthy' | 'degraded' | 'critical';
  /** Illustrative latency per check, newest last, in CHECK_TIMES order. */
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
            {OBSERVATION_POINT_COUNT} {OBSERVATION_POINT_LABEL}
            {OBSERVATION_POINT_COUNT === 1 ? '' : 's'}, on infrastructure the
            vendor does not control
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
                {CHECK_TIMES.map((checkTime, i) => (
                  <div key={checkTime} className="ob-topo-reading">
                    <dt>{checkTime}</dt>
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
                checked every {CHECK_INTERVAL_SECONDS}s
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="ob-topo-foot">
        Each observation records a timestamp, status code, latency and whether
        the endpoint answered. Values are illustrative; the fields are the ones the
        product writes.
      </p>
    </div>
  );
}
