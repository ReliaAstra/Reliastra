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

/* ── Figure · the IAM evaluation pipeline ────────────────────────────────── */

/**
 * The seven stages of the documented single-account evaluation, each labelled
 * with the algebraic role it plays. Three roles only: a stage that
 * short-circuits on a match, a ceiling that can only subtract, and a grant.
 */
const IAM_STAGES: { n: string; name: string[]; role: string; tone: 'signal' | 'default' | 'void'; note: string }[] = [
  {
    n: '1',
    name: ['Deny evaluation'],
    role: 'SHORT-CIRCUIT',
    tone: 'signal',
    note: 'one matching explicit Deny in any applicable policy ends the request',
  },
  {
    n: '2',
    name: ['Organizations RCPs'],
    role: 'CEILING',
    tone: 'default',
    note: 'attaches to resources; no applicable Allow is a final Deny',
  },
  {
    n: '3',
    name: ['Organizations SCPs'],
    role: 'CEILING',
    tone: 'default',
    note: 'attaches to principals; no applicable Allow is a final Deny',
  },
  {
    n: '4',
    name: ['Resource-based', 'policies'],
    role: 'GRANT',
    tone: 'default',
    note: 'same account: can allow outright, depending on the principal type',
  },
  {
    n: '5',
    name: ['Identity-based', 'policies'],
    role: 'GRANT',
    tone: 'default',
    note: 'no applicable Allow is an implicit deny and a final Deny',
  },
  {
    n: '6',
    name: ['Permissions', 'boundary'],
    role: 'CEILING',
    tone: 'default',
    note: 'caps what the identity-based policies may grant',
  },
  {
    n: '7',
    name: ['Session policies'],
    role: 'CEILING',
    tone: 'default',
    note: 'applies to session principals only; absent means a default policy',
  },
];

export function IamEvaluationPipelineFigure({ id = 'fig-iam-pipeline' }: { id?: string }) {
  const rowH = 46;
  const top = 78;
  const stageX = 74;
  const stageW = 226;
  const tagX = 322;
  const tagW = 138;
  const noteX = 482;
  const termY = top + IAM_STAGES.length * rowH + 14;

  return (
    <FigShell
      id={id}
      title="The seven stages of AWS single-account policy evaluation"
      desc="A vertical pipeline of seven stages, in the order AWS documents them: deny evaluation, Organizations resource control policies, Organizations service control policies, resource-based policies, identity-based policies, permissions boundaries, session policies. Each stage carries one of three roles. Deny evaluation short-circuits: a single matching explicit Deny anywhere ends the request. Four stages are ceilings that can only subtract: RCPs, SCPs, permissions boundaries and session policies each return a final Deny when they apply and do not allow. Two stages grant: resource-based and identity-based policies. A dashed bypass lane on the left runs from the request straight to Allow and is labelled for the AWS account root user only, which is the single documented exception to implicit deny. Both terminals are drawn: Allow, and implicit deny."
      viewBox="0 0 960 470"
    >
      {/* root-user bypass lane */}
      <path
        d={`M40 34 H22 V${termY + 16} H${stageX}`}
        fill="none"
        className={SIGNAL_STROKE}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={16}
        y={210}
        className={`${SIGNAL} text-[9.5px]`}
        textAnchor="middle"
        transform="rotate(-90 16 210)"
      >
        ACCOUNT ROOT USER ONLY
      </text>

      <rect x={40} y={18} width={260} height={32} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <text x={54} y={38} className="fill-[var(--ob-text)] font-mono text-[11px]">
        REQUEST + CONTEXT
      </text>
      <text x={312} y={38} className={`${MUTED} text-[10px]`}>
        authenticated, then the applicable policy set is resolved
      </text>

      <line x1={52} y1={top - 8} x2={52} y2={termY - 6} className={STROKE_SOFT} strokeWidth={1} />

      {IAM_STAGES.map((s, i) => {
        const y = top + i * rowH;
        return (
          <g key={s.n}>
            <circle cx={52} cy={y + 16} r={9} className={`${STROKE} fill-[var(--ob-void)]`} strokeWidth={1} />
            <text x={52} y={y + 20} textAnchor="middle" className={`${LABEL} text-[10px]`}>
              {s.n}
            </text>
            <rect
              x={stageX}
              y={y}
              width={stageW}
              height={32}
              className={
                s.tone === 'signal'
                  ? `${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`
                  : `${STROKE} fill-[var(--ob-raised)]`
              }
              strokeWidth={1}
            />
            {s.name.map((line, j) => (
              <text
                key={line}
                x={stageX + 12}
                y={y + (s.name.length === 1 ? 20 : 14 + j * 12)}
                className="fill-[var(--ob-text)] font-mono text-[10.5px]"
              >
                {line}
              </text>
            ))}
            <rect
              x={tagX}
              y={y + 6}
              width={tagW}
              height={20}
              className={
                s.role === 'SHORT-CIRCUIT'
                  ? `${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`
                  : s.role === 'GRANT'
                    ? `stroke-[var(--ob-healthy)] fill-[var(--ob-healthy-wash)]`
                    : `${STROKE_SOFT} fill-[var(--ob-void)]`
              }
              strokeWidth={1}
            />
            <text
              x={tagX + tagW / 2}
              y={y + 20}
              textAnchor="middle"
              className={
                s.role === 'SHORT-CIRCUIT'
                  ? `${SIGNAL} text-[9.5px]`
                  : s.role === 'GRANT'
                    ? 'fill-[var(--ob-healthy)] font-mono text-[9.5px]'
                    : `${MUTED} text-[9.5px]`
              }
            >
              {s.role}
            </text>
            <text x={noteX} y={y + 20} className={`${LABEL} text-[10.5px]`}>
              {s.note}
            </text>
          </g>
        );
      })}

      <line x1={52} y1={termY - 6} x2={52} y2={termY + 16} className={STROKE_SOFT} strokeWidth={1} />
      <rect
        x={stageX}
        y={termY}
        width={120}
        height={32}
        className={`${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`}
        strokeWidth={1}
      />
      <text x={stageX + 60} y={termY + 20} textAnchor="middle" className={`${SIGNAL} text-[11px]`}>
        ALLOW
      </text>
      <rect
        x={stageX + 140}
        y={termY}
        width={190}
        height={32}
        className={`${STROKE_SOFT} fill-[var(--ob-void)]`}
        strokeWidth={1}
      />
      <text x={stageX + 235} y={termY + 20} textAnchor="middle" className={`${MUTED} text-[11px]`}>
        IMPLICIT DENY
      </text>
      <text x={stageX + 350} y={termY + 20} className={`${MUTED} text-[10px]`}>
        the default, and the outcome of every ceiling that does not allow
      </text>
    </FigShell>
  );
}

/* ── Figure · the algebra of the policy classes ──────────────────────────── */

export function IamPolicyAlgebraFigure({ id = 'fig-iam-algebra' }: { id?: string }) {
  return (
    <FigShell
      id={id}
      title="Union inside one account, intersection across accounts, ceilings around both"
      desc="Three panels. The first shows same-account evaluation as two overlapping rectangles, identity-based policies and resource-based policies, whose union is the grant: an Allow in either is sufficient. The second shows the ceilings as four nested rectangles, RCP outermost, then SCP, then permissions boundary, then session policy, wrapping the grant; each nested rectangle can only shrink the area inside it, never enlarge it. The third shows a cross-account request as two separate account bands divided by a dashed trust boundary: the trusted account holds the identity-based policy and its ceilings, the trusting account holds the resource-based policy and its ceilings, and the request is allowed only when both bands independently return Allow."
      viewBox="0 0 960 340"
    >
      {/* panel 1 · union */}
      <text x={20} y={30} className={`${SIGNAL} text-[10px]`}>
        SAME ACCOUNT · UNION
      </text>
      <rect x={44} y={70} width={150} height={130} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <rect x={126} y={70} width={150} height={130} className={`${STROKE} fill-[var(--ob-signal-wash)]`} strokeWidth={1} />
      <text x={70} y={92} className={`${LABEL} text-[10px]`}>
        identity-based
      </text>
      <text x={196} y={92} className={`${SIGNAL} text-[10px]`}>
        resource-based
      </text>
      <text x={167} y={142} textAnchor="middle" className="fill-[var(--ob-text)] font-mono text-[10.5px]">
        I ∪ R
      </text>
      <text x={20} y={228} className={`${MUTED} text-[10px]`}>
        an Allow in either is sufficient;
      </text>
      <text x={20} y={244} className={`${MUTED} text-[10px]`}>
        one explicit Deny anywhere is not
      </text>

      {/* panel 2 · ceilings */}
      <text x={336} y={30} className={`${SIGNAL} text-[10px]`}>
        CEILINGS · INTERSECTION
      </text>
      {[
        { x: 336, y: 44, w: 268, h: 200, label: 'RCP' },
        { x: 356, y: 66, w: 228, h: 156, label: 'SCP' },
        { x: 376, y: 88, w: 188, h: 112, label: 'permissions boundary' },
        { x: 396, y: 110, w: 148, h: 68, label: 'session policy' },
      ].map((b) => (
        <g key={b.label}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            className={`${STROKE_SOFT} fill-none`}
            strokeWidth={1}
          />
          <text x={b.x + 8} y={b.y + 15} className={`${MUTED} text-[9.5px]`}>
            {b.label}
          </text>
        </g>
      ))}
      <rect x={436} y={140} width={68} height={26} className={`${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`} strokeWidth={1} />
      <text x={470} y={157} textAnchor="middle" className={`${SIGNAL} text-[10px]`}>
        grant
      </text>
      <text x={336} y={268} className={`${MUTED} text-[10px]`}>
        each ring can only subtract from what is inside it
      </text>

      {/* panel 3 · cross account */}
      <text x={650} y={30} className={`${SIGNAL} text-[10px]`}>
        CROSS ACCOUNT · INTERSECTION OF TWO VERDICTS
      </text>
      <rect x={650} y={44} width={130} height={200} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <rect x={806} y={44} width={130} height={200} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <line x1={793} y1={36} x2={793} y2={252} className={SIGNAL_STROKE} strokeWidth={1} strokeDasharray="4 4" />
      <text x={715} y={62} textAnchor="middle" className={`${LABEL} text-[10px]`}>
        ACCOUNT A
      </text>
      <text x={715} y={78} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        trusted
      </text>
      <text x={871} y={62} textAnchor="middle" className={`${LABEL} text-[10px]`}>
        ACCOUNT B
      </text>
      <text x={871} y={78} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        trusting
      </text>
      <rect x={666} y={94} width={98} height={40} className={`${STROKE_SOFT} fill-[var(--ob-void)]`} strokeWidth={1} />
      <text x={715} y={112} textAnchor="middle" className={`${LABEL} text-[9.5px]`}>
        identity
      </text>
      <text x={715} y={126} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        + ceilings
      </text>
      <rect x={822} y={94} width={98} height={40} className={`${STROKE_SOFT} fill-[var(--ob-void)]`} strokeWidth={1} />
      <text x={871} y={112} textAnchor="middle" className={`${LABEL} text-[9.5px]`}>
        resource
      </text>
      <text x={871} y={126} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        + ceilings
      </text>
      <rect x={666} y={160} width={98} height={30} className={`${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`} strokeWidth={1} />
      <text x={715} y={180} textAnchor="middle" className={`${SIGNAL} text-[9.5px]`}>
        verdict 1
      </text>
      <rect x={822} y={160} width={98} height={30} className={`${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`} strokeWidth={1} />
      <text x={871} y={180} textAnchor="middle" className={`${SIGNAL} text-[9.5px]`}>
        verdict 2
      </text>
      <text x={793} y={216} textAnchor="middle" className="fill-[var(--ob-text)] font-mono text-[10.5px]">
        verdict 1 ∧ verdict 2
      </text>
      <text x={650} y={268} className={`${MUTED} text-[10px]`}>
        allowed only if both evaluations independently return Allow
      </text>
      <text x={793} y={286} textAnchor="middle" className={`${SIGNAL} text-[9.5px]`}>
        TRUST BOUNDARY
      </text>
    </FigShell>
  );
}

/* ── Figure · the same-account tightening fallacy ────────────────────────── */

export function IamTighteningFallacyFigure({ id = 'fig-iam-tightening' }: { id?: string }) {
  const MECHANISMS = ['permissions boundary', 'service control policy', 'resource control policy', 'explicit Deny statement'];
  return (
    <FigShell
      id={id}
      title="Why a restrictive resource-based policy does not tighten a broad identity-based policy"
      desc="Two panels and one column. The left panel is the designer model: a broad identity-based policy allowing all S3 actions, plus a restrictive bucket policy, drawn as if the two intersected, producing an arrow to a narrowed effective permission set. The centre panel is the documented outcome: the same two policies combined by union, so the broad Allow survives and the effective permission set is unchanged. The right column lists the four mechanisms that do reduce effective permissions inside one account: a permissions boundary, a service control policy, a resource control policy, or an explicit Deny statement."
      viewBox="0 0 960 300"
    >
      <text x={20} y={28} className={`${MUTED} text-[10px]`}>
        DESIGNER MODEL
      </text>
      <rect x={20} y={40} width={270} height={196} className={`${STROKE_SOFT} fill-[var(--ob-void)]`} strokeWidth={1} />
      <rect x={44} y={66} width={104} height={44} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <text x={96} y={86} textAnchor="middle" className={`${LABEL} text-[9.5px]`}>
        identity
      </text>
      <text x={96} y={100} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        s3:*
      </text>
      <rect x={112} y={92} width={104} height={44} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <text x={164} y={112} textAnchor="middle" className={`${LABEL} text-[9.5px]`}>
        bucket policy
      </text>
      <text x={164} y={126} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        read only
      </text>
      <text x={155} y={170} textAnchor="middle" className="fill-[var(--ob-text)] font-mono text-[10.5px]">
        I ∩ R
      </text>
      <Arrow x1={155} x2={225} y={196} />
      <text x={232} y={200} className={`${MUTED} text-[9.5px]`}>
        narrowed
      </text>

      <text x={330} y={28} className={`${SIGNAL} text-[10px]`}>
        DOCUMENTED OUTCOME
      </text>
      <rect x={330} y={40} width={290} height={196} className={`${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`} strokeWidth={1} />
      <rect x={354} y={66} width={104} height={44} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <text x={406} y={86} textAnchor="middle" className={`${LABEL} text-[9.5px]`}>
        identity
      </text>
      <text x={406} y={100} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        s3:*
      </text>
      <rect x={422} y={92} width={104} height={44} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
      <text x={474} y={112} textAnchor="middle" className={`${LABEL} text-[9.5px]`}>
        bucket policy
      </text>
      <text x={474} y={126} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        read only
      </text>
      <text x={465} y={170} textAnchor="middle" className="fill-[var(--ob-text)] font-mono text-[10.5px]">
        I ∪ R
      </text>
      <Arrow x1={465} x2={535} y={196} />
      <text x={542} y={200} className={`${SIGNAL} text-[9.5px]`}>
        s3:* still effective
      </text>

      <text x={664} y={28} className={`${LABEL} text-[10px]`}>
        WHAT ACTUALLY REDUCES IT
      </text>
      {MECHANISMS.map((m, i) => {
        const y = 44 + i * 48;
        return (
          <g key={m}>
            <rect x={664} y={y} width={272} height={36} className={`${STROKE} fill-[var(--ob-raised)]`} strokeWidth={1} />
            <text x={678} y={y + 22} className={`${LABEL} text-[10.5px]`}>
              {m}
            </text>
            <text x={922} y={y + 22} textAnchor="end" className={`${MUTED} text-[9.5px]`}>
              {i === 3 ? 'overrides' : 'caps'}
            </text>
          </g>
        );
      })}
      <text x={20} y={270} className={`${MUTED} text-[10px]`}>
        inside one account a resource-based policy adds permission, it never removes it; only a ceiling or an explicit Deny removes it
      </text>
    </FigShell>
  );
}

/* ── Figure · the verification gap ───────────────────────────────────────── */

/** One cell of a capability matrix. Tone decides the fill; label is printed. */
function MatrixCell({
  x,
  y,
  w,
  h,
  tone,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'yes' | 'partial' | 'no';
  label: string;
}) {
  const fill =
    tone === 'yes'
      ? 'fill-[var(--ob-healthy-wash)]'
      : tone === 'partial'
        ? 'fill-[var(--ob-signal-wash)]'
        : 'fill-[var(--ob-void)]';
  const stroke =
    tone === 'yes' ? 'stroke-[var(--ob-healthy)]' : tone === 'partial' ? SIGNAL_STROKE : STROKE_SOFT;
  const text =
    tone === 'yes'
      ? 'fill-[var(--ob-healthy)] font-mono'
      : tone === 'partial'
        ? `${SIGNAL}`
        : `${MUTED}`;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} className={`${stroke} ${fill}`} strokeWidth={1} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" className={`${text} text-[9.5px]`}>
        {label}
      </text>
    </g>
  );
}

/**
 * Capability of each verification route, per policy class, as documented on the
 * access dates in the paper's references. 'partial' means the route evaluates
 * the class only under conditions the paper states in the same row.
 */
const VERIFICATION_MATRIX: { cls: string; cells: { tone: 'yes' | 'partial' | 'no'; label: string }[] }[] = [
  {
    cls: 'identity-based',
    cells: [
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'partial', label: 'AFTER THE FACT' },
    ],
  },
  {
    cls: 'resource-based',
    cells: [
      { tone: 'partial', label: 'NOT FOR ROLES' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'partial', label: 'AFTER THE FACT' },
    ],
  },
  {
    cls: 'permissions boundary',
    cells: [
      { tone: 'partial', label: 'ONE AT A TIME' },
      { tone: 'partial', label: 'IDENTITY POLICY' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'no', label: 'NOT NAMED' },
    ],
  },
  {
    cls: 'session policy',
    cells: [
      { tone: 'no', label: 'NOT ACCEPTED' },
      { tone: 'no', label: 'NOT AN INPUT' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'no', label: 'NOT NAMED' },
    ],
  },
  {
    cls: 'SCP',
    cells: [
      { tone: 'partial', label: 'WITH HIERARCHY' },
      { tone: 'partial', label: 'POLICY TYPE' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'partial', label: 'SOMETIMES NAMED' },
    ],
  },
  {
    cls: 'RCP',
    cells: [
      { tone: 'no', label: 'NOT SUPPORTED' },
      { tone: 'no', label: 'NOT AN INPUT' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'no', label: 'NOT NAMED' },
    ],
  },
  {
    cls: 'role trust policy',
    cells: [
      { tone: 'no', label: 'IGNORED FOR STS' },
      { tone: 'yes', label: 'VALIDATED' },
      { tone: 'yes', label: 'EVALUATED' },
      { tone: 'no', label: 'NOT NAMED' },
    ],
  },
];

export function IamVerificationGapFigure({ id = 'fig-iam-verification-gap' }: { id?: string }) {
  const TOOLS = ['IAM Policy Simulator', 'Access Analyzer check', 'live API call', 'decoded auth message'];
  const labelW = 196;
  const cellW = 176;
  const cellH = 32;
  const top = 66;
  const gap = 6;

  return (
    <FigShell
      id={id}
      title="What each verification route can evaluate, by policy class"
      desc="A capability matrix. Rows are the seven policy classes that participate in an authorisation decision: identity-based, resource-based, permissions boundary, session policy, service control policy, resource control policy and IAM role trust policy. Columns are the four routes an engineer can use to check a decision before or after it happens: the IAM Policy Simulator, an IAM Access Analyzer custom policy check, a live API call against the control plane, and the decoded authorization message returned after a denial. Cells are marked evaluated, partial with the condition stated, or not supported. The pattern the matrix shows is that the two cheap pre-deployment routes each leave at least one policy class unevaluated, the live API call evaluates every class but only for the request actually issued, and the decoded message distinguishes an explicit deny from an absent allow without naming the policy class that decided."
      viewBox="0 0 960 380"
    >
      {TOOLS.map((t, i) => (
        <text
          key={t}
          x={labelW + 16 + i * (cellW + gap) + cellW / 2}
          y={44}
          textAnchor="middle"
          className={`${LABEL} text-[10px]`}
        >
          {t}
        </text>
      ))}
      <line
        x1={12}
        y1={54}
        x2={labelW + 16 + TOOLS.length * (cellW + gap)}
        y2={54}
        className={STROKE_SOFT}
        strokeWidth={1}
      />
      {VERIFICATION_MATRIX.map((row, r) => {
        const y = top + r * (cellH + gap);
        return (
          <g key={row.cls}>
            <text x={12} y={y + 20} className="fill-[var(--ob-text)] font-mono text-[10.5px]">
              {row.cls}
            </text>
            {row.cells.map((c, i) => (
              <MatrixCell
                key={c.label + i}
                x={labelW + 16 + i * (cellW + gap)}
                y={y}
                w={cellW}
                h={cellH}
                tone={c.tone}
                label={c.label}
              />
            ))}
          </g>
        );
      })}
      <text x={12} y={top + VERIFICATION_MATRIX.length * (cellH + gap) + 26} className={`${MUTED} text-[10px]`}>
        evaluated = the route decides the class; partial = decides it only under the stated condition; not supported = the route does not accept it
      </text>
      <text x={12} y={top + VERIFICATION_MATRIX.length * (cellH + gap) + 44} className={`${SIGNAL} text-[10px]`}>
        no single pre-deployment route covers all seven classes
      </text>
    </FigShell>
  );
}

/* ── Figure · the attribution path ───────────────────────────────────────── */

const ATTRIBUTION_STEPS: { source: string; lines: string[]; tone: 'yes' | 'partial' }[] = [
  {
    source: 'error message text',
    lines: ['sometimes names the', 'deciding layer; wording', 'is service specific'],
    tone: 'partial',
  },
  {
    source: 'sts:DecodeAuthorization',
    lines: ['explicit deny vs absent', 'allow, plus principal,', 'action, resource, context'],
    tone: 'partial',
  },
  {
    source: 'CloudTrail userIdentity',
    lines: ['IAMUser / AssumedRole /', 'FederatedUser / Root -', 'selects the branch'],
    tone: 'yes',
  },
  {
    source: 'account policy inventory',
    lines: ['the statement that', 'matched, once the', 'branch is known'],
    tone: 'yes',
  },
];

export function IamAttributionPathFigure({ id = 'fig-iam-attribution' }: { id?: string }) {
  const w = 214;
  const gap = 22;
  const y = 96;
  const h = 92;

  return (
    <FigShell
      id={id}
      title="From an observed AccessDenied to the policy class that decided it"
      desc="A left-to-right chain of four evidence sources used to attribute an authorisation failure. The error message text sometimes names the deciding layer, and its wording is service specific, so it is partial evidence. The decoded authorization message states whether the denial was an explicit deny or an absent allow, together with the principal, action, resource and condition values, but it does not name the policy class that decided. The CloudTrail userIdentity type is the discriminator: whether the principal was an IAM user, an assumed role session, a federated user session or the account root user determines which branch of the resource-based policy rule applied, and therefore whether a permissions boundary or session policy could have capped the request. Only once the branch is known does the account policy inventory identify the statement that matched. The chain ends at the deciding policy class."
      viewBox="0 0 960 250"
    >
      <rect x={12} y={y} width={120} height={h} className={`${STROKE_SOFT} fill-[var(--ob-void)]`} strokeWidth={1} />
      <text x={72} y={y + 40} textAnchor="middle" className="fill-[var(--ob-text)] font-mono text-[10.5px]">
        AccessDenied
      </text>
      <text x={72} y={y + 58} textAnchor="middle" className={`${MUTED} text-[9.5px]`}>
        observed failure
      </text>

      {ATTRIBUTION_STEPS.map((s, i) => {
        const x = 152 + i * (w + gap);
        return (
          <g key={s.source}>
            {i === 0 && <Arrow x1={132} x2={x} y={y + h / 2} />}
            {i > 0 && <Arrow x1={x - gap} x2={x} y={y + h / 2} />}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              className={
                s.tone === 'yes'
                  ? `${STROKE} fill-[var(--ob-raised)]`
                  : `${SIGNAL_STROKE} fill-[var(--ob-signal-wash)]`
              }
              strokeWidth={1}
            />
            <text x={x + 12} y={y + 22} className="fill-[var(--ob-text)] font-mono text-[10px]">
              {s.source}
            </text>
            <text x={x + 12} y={y + 40} className={`${MUTED} text-[9px]`}>
              {s.tone === 'yes' ? 'DISCRIMINATES' : 'PARTIAL'}
            </text>
            {s.lines.map((line, j) => (
              <text key={line} x={x + 12} y={y + 58 + j * 12} className={`${LABEL} text-[9.5px]`}>
                {line}
              </text>
            ))}
          </g>
        );
      })}

      <text x={12} y={228} className={`${MUTED} text-[10px]`}>
        the principal type recorded in CloudTrail is the input that decides which branch of the resource-based rule the request took
      </text>
    </FigShell>
  );
}
