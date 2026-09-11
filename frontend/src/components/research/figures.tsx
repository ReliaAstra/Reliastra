import type { ReactNode } from 'react';

/**
 * Research figures.
 *
 * Inline SVG, rendered on the server, no JavaScript, no chart library. Three
 * reasons:
 *
 *  - A diagram on a research page is evidence, not decoration. If it needs a
 *    200 kB runtime to draw six rectangles it is not worth drawing.
 *  - Server-rendered SVG is in the HTML a crawler and an LLM receive. A
 *    canvas chart is a hole in the document.
 *  - Every figure carries a `<title>` and `<desc>` and is labelled with
 *    `role="img"`, and every figure is wrapped in a `<figcaption>` that
 *    states the conclusion in prose. No finding may exist only inside a
 *    picture.
 *
 * Design rules: one accent, 1px strokes, monospace labels, no gradients, no
 * shadows, no rounded containers. It should read like a figure in a
 * standards document.
 */

const STROKE = 'stroke-[var(--ob-line-3)]';
const STROKE_SOFT = 'stroke-[var(--ob-line-2)]';
const LABEL = 'fill-[var(--ob-text-2)] font-mono';
const MUTED = 'fill-[var(--ob-text-4)] font-mono';
const SIGNAL = 'fill-[var(--ob-signal)] font-mono';
const SIGNAL_STROKE = 'stroke-[var(--ob-signal)]';

function Box({
  x,
  y,
  w,
  h,
  lines,
  tone = 'default',
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  tone?: 'default' | 'signal' | 'void';
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        className={
          tone === 'signal'
            ? `${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`
            : tone === 'void'
              ? `${STROKE_SOFT} fill-[var(--ob-void)]`
              : `${STROKE} fill-[var(--ob-raised)]`
        }
        strokeWidth={1}
      />
      {lines.map((line, i) => (
        <text
          key={line + i}
          x={x + w / 2}
          y={y + h / 2 - ((lines.length - 1) * 11) / 2 + i * 13 + 4}
          textAnchor="middle"
          className={`${i === 0 ? 'fill-[var(--ob-text)]' : LABEL} text-[10.5px]`}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function Arrow({ x1, x2, y, dashed }: { x1: number; x2: number; y: number; dashed?: boolean }) {
  return (
    <g className={STROKE_SOFT}>
      <line
        x1={x1}
        y1={y}
        x2={x2 - 5}
        y2={y}
        strokeWidth={1}
        strokeDasharray={dashed ? '3 3' : undefined}
      />
      <path d={`M${x2 - 5} ${y - 3} L${x2} ${y} L${x2 - 5} ${y + 3}`} fill="none" strokeWidth={1} />
    </g>
  );
}

function FigShell({
  id,
  title,
  desc,
  viewBox,
  height,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  viewBox: string;
  height?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-labelledby={`${id}-t ${id}-d`}
      className="w-full"
      style={height ? { maxHeight: height } : undefined}
    >
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      {children}
    </svg>
  );
}

/* ── Figure 1 · dependency chain ─────────────────────────────────────────── */

const CHAIN: { lines: string[]; caption: string }[] = [
  { lines: ['Application'], caption: 'your trust domain' },
  { lines: ['AI gateway /', 'SDK'], caption: 'key held here' },
  { lines: ['DNS', 'resolution'], caption: 'answer is cached' },
  { lines: ['TLS 1.3', 'handshake'], caption: 'authenticates host' },
  { lines: ['Provider', 'edge'], caption: 'rate limits, WAF' },
  { lines: ['Model', 'router'], caption: 'not observable' },
  { lines: ['Model serving', 'plane'], caption: 'not observable' },
];

export function DependencyChainFigure({ id = 'fig-dependency-chain' }: { id?: string }) {
  const w = 112;
  const gap = 26;
  const y = 74;
  const h = 54;
  const boundaryX = 4 * (w + gap) + 8 - gap / 2;

  return (
    <FigShell
      id={id}
      title="Dependency chain from application to model serving plane"
      desc="Seven hops between an application and a served token: application, AI gateway or SDK, DNS resolution, TLS handshake, provider edge, model router, model serving plane. A dashed vertical line marks the external trust boundary between the TLS handshake and the provider edge. Everything to the right of that line is outside the consuming organisation's control, and the last two hops are not observable from the API boundary at all."
      viewBox="0 0 960 214"
    >
      {/* Trust-domain bands */}
      <rect x={4} y={44} width={boundaryX - 12} height={116} className="fill-[var(--ob-raised)] opacity-40" />
      <rect
        x={boundaryX + 8}
        y={44}
        width={960 - boundaryX - 12}
        height={116}
        className="fill-[var(--ob-signal-wash)]"
      />
      <text x={12} y={38} className={`${MUTED} text-[10px]`}>
        CONSUMER TRUST DOMAIN
      </text>
      <text x={boundaryX + 16} y={38} className={`${SIGNAL} text-[10px]`}>
        THIRD-PARTY TRUST DOMAIN
      </text>

      {/* Boundary */}
      <line
        x1={boundaryX}
        y1={26}
        x2={boundaryX}
        y2={186}
        className={SIGNAL_STROKE}
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {CHAIN.map((node, i) => {
        const x = 8 + i * (w + gap);
        return (
          <g key={node.lines.join('')}>
            <Box x={x} y={y} w={w} h={h} lines={node.lines} tone={i >= 5 ? 'signal' : 'default'} />
            {i < CHAIN.length - 1 && <Arrow x1={x + w} x2={x + w + gap} y={y + h / 2} />}
            <text x={x + w / 2} y={y + h + 20} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
              {node.caption}
            </text>
          </g>
        );
      })}

      <text x={boundaryX} y={202} textAnchor="middle" className={`${SIGNAL} text-[10px]`}>
        EXTERNAL TRUST BOUNDARY
      </text>
    </FigShell>
  );
}

/* ── Figure 2 · trust zones ──────────────────────────────────────────────── */

const ZONES = [
  {
    name: 'Application trust zone',
    control: 'Enforced by you: workload identity, egress policy, prompt redaction',
    fill: 'fill-[var(--ob-raised)]',
  },
  {
    name: 'Gateway / proxy zone',
    control: 'Enforced by you if self-hosted; by the vendor if managed',
    fill: 'fill-[var(--ob-base)]',
  },
  {
    name: 'Provider control plane',
    control: 'Not enforced by you: routing, quota, model version, region',
    fill: 'fill-[var(--ob-signal-wash)]',
  },
  {
    name: 'Model serving plane',
    control: 'Not observable: serving tier, underlying model, inference host',
    fill: 'fill-[var(--ob-signal-wash)] opacity-70',
  },
];

export function TrustZoneFigure({ id = 'fig-trust-zones' }: { id?: string }) {
  return (
    <FigShell
      id={id}
      title="Trust zones across an AI API boundary"
      desc="Four nested zones from the application outward: the application trust zone where controls are enforced by the consumer; the gateway or proxy zone, enforced by the consumer if self-hosted and by the vendor if managed; the provider control plane covering routing, quota, model version and region; and the model serving plane, which is not observable from the API boundary. Each zone is annotated with who enforces its controls."
      viewBox="0 0 860 372"
    >
      {ZONES.map((z, i) => {
        const inset = i * 22;
        return (
          <g key={z.name}>
            <rect
              x={8 + inset}
              y={8 + inset * 1.5}
              width={844 - inset * 2}
              height={356 - inset * 3}
              className={`${z.fill} ${STROKE_SOFT}`}
              strokeWidth={1}
            />
            <text x={26 + inset} y={32 + inset * 1.5} className={`fill-[var(--ob-text)] font-mono text-[11.5px]`}>
              {z.name}
            </text>
            <text x={26 + inset} y={48 + inset * 1.5} className={`${MUTED} text-[10px]`}>
              {z.control}
            </text>
          </g>
        );
      })}
      {/* The payload crossing every boundary */}
      <line x1={430} y1={64} x2={430} y2={330} className={SIGNAL_STROKE} strokeWidth={1} strokeDasharray="2 4" />
      <text x={440} y={196} className={`${SIGNAL} text-[10px]`} transform="rotate(90 440 196)">
        prompt content + retrieval context crosses all four
      </text>
    </FigShell>
  );
}

/* ── Figure 3 · failure propagation ──────────────────────────────────────── */

const CASCADE = [
  ['Provider degradation', 'upstream p99 rises; a subset of routes fails'],
  ['Client timeout', 'the request has not failed yet - it is pending'],
  ['Retry amplification', 'each retry re-enters the queue: 1 request becomes 3'],
  ['Connection pressure', 'sockets held open by pending calls, pool exhausted'],
  ['Queue growth', 'work arrives faster than it drains'],
  ['Worker saturation', 'unrelated features share the same workers'],
  ['Application degradation', 'failure appears in code that never called the API'],
];

export function FailureCascadeFigure({ id = 'fig-failure-cascade' }: { id?: string }) {
  const rowH = 46;
  return (
    <FigShell
      id={id}
      title="Failure propagation from provider degradation to application saturation"
      desc="A seven-step cascade. Provider degradation raises upstream latency. Client timeouts follow, because a pending request has not failed. Retries amplify the load, turning one request into several. Connection pressure builds as sockets are held open by pending calls. Queues grow because work arrives faster than it drains. Workers saturate, and because unrelated features share those workers, the application degrades in code that never called the provider API. The final row is the step that misdirects an incident."
      viewBox="0 0 860 352"
    >
      {CASCADE.map(([title, detail], i) => {
        const y = 10 + i * rowH;
        const last = i === CASCADE.length - 1;
        return (
          <g key={title}>
            <rect
              x={8}
              y={y}
              width={252}
              height={32}
              className={`${last ? SIGNAL_STROKE + ' fill-[var(--ob-signal-wash)]' : STROKE + ' fill-[var(--ob-raised)]'}`}
              strokeWidth={1}
            />
            <text x={22} y={y + 20} className={`${last ? SIGNAL : 'fill-[var(--ob-text)]'} font-mono text-[11px]`}>
              {String(i + 1).padStart(2, '0')} {title}
            </text>
            <line x1={260} y1={y + 16} x2={296} y2={y + 16} className={STROKE_SOFT} strokeWidth={1} />
            <text x={306} y={y + 20} className={`${MUTED} text-[10.5px]`}>
              {detail}
            </text>
            {i < CASCADE.length - 1 && (
              <path
                d={`M134 ${y + 32} L134 ${y + rowH}`}
                className={STROKE_SOFT}
                strokeWidth={1}
                markerEnd="none"
              />
            )}
          </g>
        );
      })}
      <text x={8} y={344} className={`${SIGNAL} text-[10px]`}>
        The alert fires here - six hops from the cause, in code that never called the API
      </text>
    </FigShell>
  );
}

/* ── Figure 4 · the availability denominator ─────────────────────────────── */

export function DenominatorFigure({ id = 'fig-denominator' }: { id?: string }) {
  // 90 days at a 300s interval: 25,920 expected observations.
  // 595 observed. 595/25920 = 2.3%.
  const fullW = 720;
  const obsW = Math.max(4, Math.round((595 / 25920) * fullW));
  return (
    <FigShell
      id={id}
      title="Expected versus observed observations behind a 90-day availability figure"
      desc="A horizontal bar representing the 25,920 observations a 90-day window implies at a 300-second probe interval. A narrow filled segment at the left represents the 595 observations the measurement API actually returned - 2.3 percent of the bar, equivalent to about 2.1 days of history. The published availability figure of 100.0 percent is computed over the filled segment only, but is labelled with the full window."
      viewBox="0 0 860 196"
    >
      <text x={8} y={26} className={`${MUTED} text-[10px]`}>
        90-DAY WINDOW AT A 300-SECOND INTERVAL = 25,920 EXPECTED OBSERVATIONS
      </text>
      <rect x={8} y={40} width={fullW} height={44} className={`${STROKE_SOFT} fill-[var(--ob-void)]`} strokeWidth={1} />
      <rect x={8} y={40} width={obsW} height={44} className={`${SIGNAL_STROKE} fill-[var(--ob-signal)]`} strokeWidth={1} />
      <line x1={8 + obsW} y1={30} x2={8 + obsW} y2={104} className={SIGNAL_STROKE} strokeWidth={1} />
      <text x={8 + obsW + 10} y={58} className={`${SIGNAL} text-[10.5px]`}>
        595 observed · 2.3% · ≈ 2.1 days
      </text>
      <text x={8 + obsW + 10} y={74} className={`${MUTED} text-[10.5px]`}>
        the sample the &ldquo;100.0% over 90 days&rdquo; figure was computed from
      </text>

      {/* The 24h comparison */}
      <text x={8} y={132} className={`${MUTED} text-[10px]`}>
        24-HOUR WINDOW = 288 EXPECTED · 277 OBSERVED · 96.2%
      </text>
      <rect x={8} y={144} width={fullW} height={26} className={`${STROKE_SOFT} fill-[var(--ob-void)]`} strokeWidth={1} />
      <rect
        x={8}
        y={144}
        width={Math.round((277 / 288) * fullW)}
        height={26}
        className="stroke-[var(--ob-healthy)] fill-[var(--ob-healthy-wash)]"
        strokeWidth={1}
      />
      <text x={8} y={188} className={`${MUTED} text-[10px]`}>
        Density falls with window length. That is the signature of shallow history, not of a failing endpoint.
      </text>
    </FigShell>
  );
}

/* ── Figure 5 · bucket density and the estimator bound ───────────────────── */

export function BucketDensityFigure({ id = 'fig-bucket-density' }: { id?: string }) {
  // 60 one-minute buckets; 12 occupied, one every 5th bucket (the captured
  // series has one 6-minute gap, reproduced here at bucket 50).
  const occupied = new Set([3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 54, 59]);
  const bw = 12;
  const gapPx = 1.5;
  return (
    <FigShell
      id={id}
      title="Sixty one-minute buckets, twelve occupied, and what the estimator can see"
      desc="Sixty narrow columns representing the sixty one-minute buckets in a one-hour window. Twelve are filled, spaced five buckets apart with one six-bucket gap, matching the captured series. The estimator divides the bucket length by the mean observation count over occupied buckets. Because every occupied bucket holds exactly one observation, the mean is one and the estimator returns sixty seconds - the bucket length - for a schedule that is three hundred seconds. The empty columns, which carry the evidence of the true interval, are never read."
      viewBox="0 0 860 210"
    >
      {Array.from({ length: 60 }, (_, i) => {
        const x = 8 + i * (bw + gapPx);
        const on = occupied.has(i);
        return (
          <rect
            key={i}
            x={x}
            y={on ? 44 : 84}
            width={bw}
            height={on ? 60 : 20}
            className={on ? `${SIGNAL_STROKE} fill-[var(--ob-signal)]` : `${STROKE_SOFT} fill-[var(--ob-void)]`}
            strokeWidth={1}
          />
        );
      })}
      <line x1={8} y1={112} x2={8 + 60 * (bw + gapPx)} y2={112} className={STROKE_SOFT} strokeWidth={1} />
      <text x={8} y={32} className={`${MUTED} text-[10px]`}>
        60 ONE-MINUTE BUCKETS IN THE WINDOW · 12 RETURNED BY THE API · 48 OMITTED
      </text>
      <text x={8} y={138} className={`${SIGNAL} text-[10.5px]`}>
        occupied buckets, each holding exactly 1 observation → mean = 1.0
      </text>
      <text x={8} y={156} className={`${LABEL} text-[10.5px]`}>
        round(bucket 60s ÷ mean 1.0) = 60s &nbsp;·&nbsp; median bucket-start delta = 300s
      </text>
      <text x={8} y={182} className={`${MUTED} text-[10px]`}>
        The estimator returns min(interval, bucket length). It cannot report an interval longer than the resolution it is fed.
      </text>
    </FigShell>
  );
}

/* ── Figure 6 · what a status payload carries ────────────────────────────── */

const PAYLOAD_PARTS = [
  {
    name: 'Taxonomy',
    carries: '25 provider-defined components',
    supports: 'A service inventory: what the provider considers separately reportable',
    tone: 'default' as const,
  },
  {
    name: 'Current declaration',
    carries: 'one aggregate indicator: "none"',
    supports: 'A single unqualified claim about the whole page, with no interval',
    tone: 'signal' as const,
  },
  {
    name: 'History',
    carries: 'absent from this endpoint',
    supports: 'Nothing. History lives on a separate endpoint that most integrations do not poll',
    tone: 'void' as const,
  },
];

export function StatusPayloadFigure({ id = 'fig-status-payload' }: { id?: string }) {
  return (
    <FigShell
      id={id}
      title="What a hosted status-page payload carries, and what each part can support"
      desc="Three rows. Taxonomy: twenty-five provider-defined components, which supports a service inventory of what the provider considers separately reportable. Current declaration: one aggregate indicator valued none, which supports a single unqualified claim about the whole page and carries no interval. History: absent from this endpoint, which supports nothing, because history lives on a separate endpoint that most integrations do not poll."
      viewBox="0 0 860 236"
    >
      <text x={8} y={22} className={`${MUTED} text-[10px]`}>
        ONE PAYLOAD, THREE EVIDENCE CLASSES
      </text>
      {PAYLOAD_PARTS.map((p, i) => {
        const y = 34 + i * 62;
        return (
          <g key={p.name}>
            <rect
              x={8}
              y={y}
              width={188}
              height={48}
              className={
                p.tone === 'signal'
                  ? `${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`
                  : p.tone === 'void'
                    ? `${STROKE_SOFT} fill-[var(--ob-void)]`
                    : `${STROKE} fill-[var(--ob-raised)]`
              }
              strokeWidth={1}
            />
            <text x={22} y={y + 21} className="fill-[var(--ob-text)] font-mono text-[11.5px]">
              {p.name}
            </text>
            <text x={22} y={y + 37} className={`${MUTED} text-[10px]`}>
              {p.carries}
            </text>
            <line x1={196} y1={y + 24} x2={232} y2={y + 24} className={STROKE_SOFT} strokeWidth={1} />
            <text x={244} y={y + 21} className={`${MUTED} text-[10px]`}>
              SUPPORTS
            </text>
            <text x={244} y={y + 37} className={`${LABEL} text-[10.5px]`}>
              {p.supports}
            </text>
          </g>
        );
      })}
    </FigShell>
  );
}
