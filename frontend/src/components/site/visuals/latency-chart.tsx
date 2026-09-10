import {
  CHECK_INTERVAL_SECONDS,
  DETECTION_FAILURE_CHECKS,
  OBSERVATION_POINT_LABEL,
} from '@/lib/product-contract';

/**
 * Latency across the incident window - the shape of the chart the evidence
 * artifact embeds.
 *
 * Static SVG, no client JavaScript: the shape never changes, so there is
 * nothing to hydrate. One series, because RELIASTRA observes from a single
 * point; the shaded band marks the consecutive failed checks that confirmed
 * the incident, and a text alternative keeps the figure from being information
 * only sighted visitors receive.
 *
 * The previous version of this figure drew two series, one per region, with a
 * "quorum window" between them. That described a fleet of independent vantage
 * points that does not exist, in a diagram sitting next to a product whose
 * entire promise is provable measurement. Values here are illustrative; the
 * structure is not.
 */

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 34, left: 46 };

const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Latency in ms, oldest to newest, one sample per 5 minutes. */
const SERIES = [104, 98, 112, 107, 4120, 3890, 3640, 118, 102, 96];

const MAX_MS = 4500;
const SAMPLES = SERIES.length;

/** Index range of the consecutive failed checks that confirmed the incident. */
const WINDOW_START = 4;
const WINDOW_END = 6;

function x(i: number) {
  return PAD.left + (i / (SAMPLES - 1)) * PLOT_W;
}

function y(ms: number) {
  return PAD.top + PLOT_H - (ms / MAX_MS) * PLOT_H;
}

function toPoints(series: number[]) {
  return series.map((ms, i) => `${x(i).toFixed(1)},${y(ms).toFixed(1)}`).join(' ');
}

const Y_TICKS = [0, 1000, 2000, 3000, 4000];

export function LatencyChart() {
  return (
    <figure className="ob-chart">
      <figcaption className="ob-chart-head">
        <span className="ob-label">Observed latency and failed checks</span>
        <span className="ob-vis-flag">Illustrative values</span>
      </figcaption>

      <div className="ob-chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Latency from the ${OBSERVATION_POINT_LABEL} over the incident window. It stays near 100 to 120 milliseconds, then rises to roughly 3600 to 4100 milliseconds across three consecutive samples before recovering. The shaded band marks the ${DETECTION_FAILURE_CHECKS} consecutive failed checks that confirmed the incident.`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* The checks that confirmed the incident */}
          <rect
            x={x(WINDOW_START)}
            y={PAD.top}
            width={x(WINDOW_END) - x(WINDOW_START)}
            height={PLOT_H}
            fill="var(--ob-critical)"
            opacity="0.07"
          />

          {/* Grid + axis labels */}
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={y(tick)}
                x2={W - PAD.right}
                y2={y(tick)}
                stroke="var(--ob-line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(tick) + 3.5}
                textAnchor="end"
                className="ob-chart-tick"
              >
                {tick === 0 ? '0' : `${tick / 1000}k`}
              </text>
            </g>
          ))}

          {/* The measured series */}
          <polyline
            points={toPoints(SERIES)}
            fill="none"
            stroke="var(--ob-signal)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Peak marker */}
          <circle cx={x(WINDOW_START)} cy={y(SERIES[WINDOW_START])} r="3" fill="var(--ob-signal)" />

          {/* Failed checks, marked where the probe got no useful latency */}
          {[WINDOW_START, WINDOW_START + 1, WINDOW_END].map((i) => (
            <circle
              key={`failed-${i}`}
              cx={x(i)}
              cy={PAD.top + PLOT_H - 4}
              r="3"
              fill="var(--ob-critical)"
            />
          ))}

          {/* Window caption */}
          <text
            x={(x(WINDOW_START) + x(WINDOW_END)) / 2}
            y={PAD.top + 12}
            textAnchor="middle"
            className="ob-chart-window"
          >
            incident window
          </text>

          {/* Baseline */}
          <line
            x1={PAD.left}
            y1={PAD.top + PLOT_H}
            x2={W - PAD.right}
            y2={PAD.top + PLOT_H}
            stroke="var(--ob-line-2)"
            strokeWidth="1"
          />
          <text x={PAD.left} y={H - 12} className="ob-chart-tick">
            09:00
          </text>
          <text x={W - PAD.right} y={H - 12} textAnchor="end" className="ob-chart-tick">
            09:45
          </text>
        </svg>
      </div>

      <ul className="ob-chart-legend">
        <li>
          <span aria-hidden className="ob-chart-key" data-series="a" />
          <span className="ob-mono">{OBSERVATION_POINT_LABEL}</span>
        </li>
        <li>
          <span aria-hidden className="ob-chart-key" data-series="failed" />
          <span className="ob-mono">failed check</span>
        </li>
        <li className="ob-chart-rule">
          {DETECTION_FAILURE_CHECKS} consecutive failures, {CHECK_INTERVAL_SECONDS}s apart,
          confirm the incident
        </li>
      </ul>
    </figure>
  );
}
