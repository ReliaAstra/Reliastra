/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Tokens
 *
 * A separate token set from `globals.css` on purpose. The console (rs-*) and the
 * public site (ob-*) both render in a browser that can resolve CSS variables,
 * custom properties and media queries. An email client cannot: Outlook's
 * renderer is a Word engine from 2007. So the values that matter here are frozen
 * hex literals with no indirection, and the only responsive mechanism used is
 * the one Outlook actually honours - the `<!--[if mso]>` VML conditional.
 *
 * The visual language is inherited from `ob-*` (Obsidian Infrastructure) but
 * inverted for the inbox: a near-black masthead carrying the identity, then a
 * white document body. Dark mail reads modern but forces-rewrites badly in
 * Outlook.com and corporate gateways, and this mail lands in inboxes where a
 * broken layout costs credibility. Billing and security notices in particular
 * get printed, forwarded and archived.
 *
 * Decoration budget: one hairline weight, one accent (near-black), and colour
 * reserved exclusively for reporting system state.
 */

export const px = (n: number): string => `${n}px`;

/** Content measure. 600px renders identically in Outlook, Gmail and Apple Mail. */
export const MEASURE = 600;

/**
 * Horizontal padding inside the document body. Drops to 20px on narrow
 * viewports via the `max-width` variant below, never via a media query.
 */
export const GUTTER = 36;

/** The nine classes all share one classification banner height. */
export const BANNER_H = 44;

// ── Surfaces ───────────────────────────────────────────────────────────────
export const color = {
  /** Masthead ground. Never #000 - pure black bands look like a rendering fault. */
  masthead: '#050505',
  /** Document ground. */
  paper: '#FFFFFF',
  /** Recessed panel: telemetry blocks, provenance, notices. */
  recessed: '#F7F8FA',
  /** Table header / zebra band. */
  band: '#FBFBFC',

  // Masthead type
  onDark: '#F5F5F5',
  onDarkSecondary: '#A0A0A0',
  onDarkTertiary: '#8F8F8F',

  // Body type - all verified against #FFFFFF
  ink: '#0B0F17', // 19.1:1
  inkSecondary: '#4A5261', // 8.2:1
  inkTertiary: '#6E7686', // 5.0:1

  // Structure
  rule: '#E3E6EB',
  ruleStrong: '#C9CFD8',
  ruleDark: 'rgba(255,255,255,0.14)',
  ruleDarkStrong: 'rgba(255,255,255,0.28)',

  /** The single accent. Monochrome on purpose - see module docstring. */
  signal: '#0B0F17',
  signalOnDark: '#F5F5F5',

  // System state - the only permitted use of hue
  up: '#1E7A4D',
  down: '#B3352C',
  degraded: '#A6721A',
  unknown: '#6E7686',

  upWash: '#F2F8F4',
  downWash: '#FCF4F3',
  degradedWash: '#FBF7F0',
  unknownWash: '#F7F8FA',
} as const;

export type HealthKey = 'up' | 'degraded' | 'down' | 'unknown';

export const health = (
  key: HealthKey,
): { fg: string; wash: string; rule: string } => {
  switch (key) {
    case 'up':
      return { fg: color.up, wash: color.upWash, rule: '#BFDCCE' };
    case 'degraded':
      return { fg: color.degraded, wash: color.degradedWash, rule: '#E4D3AE' };
    case 'down':
      return { fg: color.down, wash: color.downWash, rule: '#E9C4C0' };
    default:
      return { fg: color.unknown, wash: color.unknownWash, rule: color.rule };
  }
};

// ── Type ───────────────────────────────────────────────────────────────────
// No webfont is fetched. An email that waits on a font host is an email that
// arrives unstyled, and Outlook ignores webfonts regardless. These stacks
// resolve to a serious grotesk on every mainstream OS.

export const font = {
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,'Helvetica Neue',Arial,sans-serif",
  mono: "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace",
} as const;

/**
 * The telemetry label: mono, uppercase, wide-tracked. This is the single
 * strongest NASA/SpaceX signal in the system and it is used for *data field
 * names only* - never for prose. Tracked-out sans caps read as fashion;
 * tracked-out mono caps read as instrumentation.
 */
export const label = {
  fontFamily: font.mono,
  fontSize: '10px',
  lineHeight: '14px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: color.inkTertiary,
  msoLineHeightRule: 'exactly',
} as const;

/** Section index in the mission-report register: `01`, `02`, ... */
export const sectionIndex = {
  ...label,
  color: color.signal,
} as const;

export const h1 = {
  fontFamily: font.sans,
  fontSize: '21px',
  lineHeight: '28px',
  fontWeight: 600,
  letterSpacing: '-0.018em',
  color: color.ink,
} as const;

export const h2 = {
  fontFamily: font.sans,
  fontSize: '15px',
  lineHeight: '22px',
  fontWeight: 600,
  letterSpacing: '-0.008em',
  color: color.ink,
} as const;

export const body = {
  fontFamily: font.sans,
  fontSize: '15px',
  lineHeight: '24px',
  fontWeight: 400,
  letterSpacing: '-0.003em',
  color: color.ink,
} as const;

export const bodySmall = {
  fontFamily: font.sans,
  fontSize: '13px',
  lineHeight: '20px',
  fontWeight: 400,
  color: color.inkSecondary,
} as const;

/** Figures. Tabular so a column of numbers aligns down the document. */
export const figure = {
  fontFamily: font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: color.ink,
} as const;

/** Long machine strings: checksums, verification ids, endpoints. */
export const hash = {
  fontFamily: font.mono,
  fontSize: '11px',
  lineHeight: '17px',
  letterSpacing: '-0.005em',
  color: color.inkSecondary,
  wordBreak: 'break-all',
} as const;

/**
 * Explanatory prose that sits inside a panel - the ceiling disclosure, the
 * observation caveat, the signed/unsigned distinction.
 *
 * Sans, not mono. Mono is for data, and a paragraph set in mono reads as a
 * machine dump at exactly the moment the design is trying to be persuasive
 * about a limitation rather than report one.
 */
export const note = {
  fontFamily: font.sans,
  fontSize: '12px',
  lineHeight: '19px',
  fontWeight: 400,
  letterSpacing: '-0.002em',
  color: color.inkSecondary,
} as const;

/** The emphasised form of `note`, for the clause that must not be skimmed. */
export const noteStrong = {
  fontFamily: font.sans,
  color: color.ink,
  fontWeight: 600,
} as const;

/**
 * The wordmark.
 *
 * The one place the identity asserts itself. Heavier and tighter than any
 * other text in the system, on the near-black ground, immediately above the
 * three-pixel signal rule.
 */
export const wordmark = {
  fontFamily: font.sans,
  fontSize: '17px',
  lineHeight: '22px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: color.onDark,
} as const;

/** The one-line descriptor under the wordmark. */
export const mastheadCaption = {
  fontFamily: font.mono,
  fontSize: '9px',
  lineHeight: '13px',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: color.onDarkTertiary,
  msoLineHeightRule: 'exactly',
} as const;

/** The message class printed top-right of the masthead. */
export const mastheadClass = {
  fontFamily: font.mono,
  fontSize: '10px',
  lineHeight: '14px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: color.onDarkSecondary,
  msoLineHeightRule: 'exactly',
} as const;

export const btn = {
  fontFamily: font.sans,
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: 600,
  letterSpacing: '0.005em',
} as const;

// ── Outlook / VML ──────────────────────────────────────────────────────────
/**
 * Button geometry needs explicit dimensions in VML: Word gives inline-block
 * buttons no intrinsic width, so without `mso-width` the CTA collapses to the
 * width of its label and the layout reads broken in exactly the client a
 * corporate inbox is most likely to be.
 *
 * Returned as an object, not a CSS declaration string. Spreading a
 * declaration string into a React style object produces one nonsense property
 * and silently drops every rule inside it.
 */
export const vmlButton = (
  width: number,
  height: number,
): Record<string, string> => ({
  msoPaddingAlt: '0',
  msoWidth: `${width}px`,
  msoHeight: `${height}px`,
  width: `${width}px`,
});

/** The equivalent geometry as a VML `style` attribute for the Word fallback. */
export const vmlRectStyle = (width: number, height: number): string =>
  `height:${height}px;v-text-anchor:middle;width:${width}px`;
