import {
  DEFAULT_REGIONS,
  QUORUM_MIN_REGIONS,
  QUORUM_WINDOW_SECONDS,
} from '@/lib/product-contract';

/**
 * Per-region latency across the incident window - the chart the evidence
 * artifact embeds as its section 3.
 *
 * Static SVG, no client JavaScript: the shape never changes, so there is
 * nothing to hydrate. Two series (one per configured region), the
 * quorum window shaded, and a text alternative so the figure is not
 * information that only sighted visitors receive.
 *
 * Series values are illustrative. The relationship between them is the point:
 * both regions degrade together, which is what makes it quorum-confirmable
 * rather than a local network problem.
 */

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 34, left: 46 };

const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Latency in ms, oldest to newest, one sample per 5 minutes. */
const SERIES: Record<string, number[]> = {
  'us-east': [104, 98, 112, 107, 4120, 3890, 3640, 118, 102, 96],
  'eu-west': [131, 126, 138, 129, 3870, 3620, 3480, 144, 133, 127],
};

const MAX_MS = 4500;
const SAMPLES = SERIES['us-east'].length;

/** Index range where both regions exceed the failure threshold. */
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
  const regions = DEFAULT_REGIONS as unknown as string[];

  return (
    <figure className="ob-chart">
      <figcaption className="ob-chart-head">
        <span className="ob-label">
          3 · Per-Region Latency &amp; Uptime Chart
        </span>
        <span className="ob-vis-flag">Illustrative values</span>
      </figcaption>

      <div className="ob-chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Latency for ${regions.join(' and ')} over the incident window. Both regions stay near 100 to 140 milliseconds, then rise together to roughly 3500 to 4100 milliseconds across three consecutive samples before recovering. The shaded band marks the ${QUORUM_WINDOW_SECONDS}-second quorum window.`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Quorum window */}
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

          {/* Series */}
          {regions.map((region, idx) => (
            <polyline
              key={region}
              points={toPoints(SERIES[region])}
              fill="none"
              stroke={idx === 0 ? 'var(--ob-signal)' : 'var(--ob-text-3)'}
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Peak markers */}
          {regions.map((region, idx) => (
            <circle
              key={`peak-${region}`}
              cx={x(WINDOW_START)}
              cy={y(SERIES[region][WINDOW_START])}
              r="3"
              fill={idx === 0 ? 'var(--ob-signal)' : 'var(--ob-text-3)'}
            />
          ))}

          {/* Window caption */}
          <text
            x={(x(WINDOW_START) + x(WINDOW_END)) / 2}
            y={PAD.top + 12}
            textAnchor="middle"
            className="ob-chart-window"
          >
            quorum window
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
          <text
            x={PAD.left}
            y={H - 12}
            className="ob-chart-tick"
          >
            09:00
          </text>
          <text
            x={W - PAD.right}
            y={H - 12}
            textAnchor="end"
            className="ob-chart-tick"
          >
            09:45
          </text>
        </svg>
      </div>

      <ul className="ob-chart-legend">
        {regions.map((region, idx) => (
          <li key={region}>
            <span
              aria-hidden
              className="ob-chart-key"
              data-series={idx === 0 ? 'a' : 'b'}
            />
            <span className="ob-mono">{region}</span>
          </li>
        ))}
        <li className="ob-chart-rule">
          {QUORUM_MIN_REGIONS} regions failing inside {QUORUM_WINDOW_SECONDS}s
          confirms the fault
        </li>
      </ul>
    </figure>
  );
}
