/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Primitives
 *
 * Every element here is table-based and inline-styled. The constraints that
 * shaped it, in order of how much damage their violation does:
 *
 *  1. `background-image` on a `<td>` is the only background Gmail and Outlook
 *     agree on. CSS gradients in a `style` attribute are stripped by Gmail.
 *  2. Word has no `max-width`. Every fluid element gets an explicit `<!--[if mso]>`
 *     ghost table; every bounded element gets a literal width.
 *  3. `padding` on `<div>`/`<p>` is unreliable in Outlook. Padding lives on
 *     `<td>` only.
 *  4. Outlook ignores `max-width`, `border-radius` on some nodes, and any
 *     shorthand `font` property. Longhands only.
 *  5. A `<style>` block survives in Gmail and Apple Mail but is *removed with
 *     its content* by the backend sanitizer. So nothing structural may depend
 *     on it. Everything below is inline; the `<style>` block is used only for
 *     the dark-mode affordances that degrade gracefully when dropped.
 *
 * The compiled output is additionally run through the backend's own allowlist
 * sanitizer, and a test asserts the result is a fixed point of that sanitizer -
 * so the HTML reviewed here is byte-identical to the HTML that sends.
 */

import * as React from 'react';
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

import {
  BANNER_H,
  GUTTER,
  MEASURE,
  body,
  bodySmall,
  btn,
  color,
  figure,
  font,
  hash,
  h1,
  h2,
  health,
  label,
  mastheadCaption,
  mastheadClass,
  note,
  noteStrong,
  sectionIndex,
  vmlButton,
  wordmark,
  type HealthKey,
} from './tokens';
// ── Document shell ─────────────────────────────────────────────────────────

/**
 * `Column` widened.
 *
 * React Email's renderer accepts two things its published prop types do not
 * describe, both of which are load-bearing here:
 *
 *   * `bgcolor` - Outlook's Word engine honours the presentation attribute and
 *     largely ignores the CSS `background` shorthand. Gmail is the reverse.
 *     Emitting both is the only way the masthead and the footers are correct in
 *     every client.
 *   * MSO-only CSS such as `mso-padding-alt`, `mso-line-height-rule` and
 *     `v-text-anchor`, which have no meaning in a browser and no equivalent
 *     type in React's `CSSProperties`.
 *
 * The renderer emits them; the types simply predate the requirements. One cast
 * declared here is cheaper than a dozen suppressions at the call sites, and
 * keeps every call site honest about what it is doing.
 */
type EmailStyle = React.CSSProperties & Record<string, string | number | undefined>;

const Cell = Column as React.FC<
  React.ComponentProps<typeof Column> & {
    bgcolor?: string;
    style?: EmailStyle;
  }
>;

/** Same widening for the raw `td` inside the VML button fallback. */
const RawCell = 'td' as unknown as React.FC<
  React.TdHTMLAttributes<HTMLTableDataCellElement> & {
    bgcolor?: string;
    style?: EmailStyle;
  }
>;
export interface MastheadProps {
  /** Classification printed top-right. Empty string renders nothing. */
  classification?: string;
}

/**
 * Full-bleed near-black identity band.
 *
 * `bgcolor` on the outer table plus a VML `rect` on the inner cell, because
 * Gmail honours `bgcolor`, Outlook honours VML, and neither honours a CSS
 * `background` shorthand alone.
 */
export const Masthead: React.FC<MastheadProps> = ({ classification }) => (
  <Section
    bgcolor={color.masthead}
    style={{ backgroundColor: color.masthead }}
  >
    {/*[if mso]>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fillcolor="#050505" stroked="f">
            <v:fill type="solid" color="#050505" />
          </v:rect>
        </td>
      </tr>
    </table>
    <![endif]*/}
    <Row>
      <Cell style={{ padding: '28px 36px 26px' }}>
        <Row>
          <Cell align="left" style={{ verticalAlign: 'middle' }}>
            <Text style={{ ...wordmark, margin: 0 }}>RELIASTRA</Text>
            <Text style={{ ...mastheadCaption, margin: '3px 0 0' }}>
              External Dependency Intelligence
            </Text>
          </Cell>
          {classification ? (
            <Cell align="right" style={{ verticalAlign: 'middle' }}>
              <Text style={{ ...mastheadClass, margin: 0 }}>
                {classification}
              </Text>
            </Cell>
          ) : null}
        </Row>
      </Cell>
    </Row>
    {/* The signal rule. Three pixels of near-white under the wordmark: the
        one place the identity is allowed to assert itself. */}
    <Row>
      <Cell
        bgcolor={color.signalOnDark}
        style={{
          backgroundColor: color.signalOnDark,
          height: '3px',
          lineHeight: '3px',
          fontSize: '0',
        }}
      >
        {' '}
      </Cell>
    </Row>
  </Section>
);

export interface DocProps {
  /** Inbox preheader. 40-100 characters; the rest is the visible subject. */
  previewText: string;
  masthead?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The document. Note that no `<title>` is emitted: the backend sanitizer
 * unwraps `<title>` (it is not on the allowlist) which would leak the title
 * into the visible body of every message.
 */
export const Doc: React.FC<DocProps> = ({ previewText, masthead, children }) => (
  <Html lang="en" dir="ltr">
    <Head>
      {/* Dark-mode affordances only. Losing this costs contrast control, not
          structure - every rule below has a light-mode inline counterpart. */}
      <style>{`
        :root { color-scheme: light only; supported-color-schemes: light only; }
        body { margin: 0 !important; }
        a { text-decoration: none; }
        table { border-collapse: collapse; }
        @media (prefers-color-scheme: dark) {
          .rs-paper { background-color: #0B0F19 !important; }
        }
      `}</style>
    </Head>
    <Preview>{previewText}</Preview>
    <Body style={{ margin: 0, padding: 0, backgroundColor: color.band, ...body }}>
      <Container
        style={{
          width: '100%',
          backgroundColor: color.band,
          fontFamily: font.sans,
        }}
      >
        <Section
          className="rs-paper"
          style={{ backgroundColor: color.band, width: '100%' }}
        >
          <Row>
            <Cell
              //[if mso]><td width="${MEASURE}" valign="top"><![endif]-->
            >
              <Section
                className="rs-paper"
                bgcolor={color.paper}
                style={{
                  backgroundColor: color.paper,
                  width: '100%',
                  maxWidth: `${MEASURE}px`,
                  margin: '0 auto',
                }}
              >
                {masthead ?? <Masthead />}
                {children}
              </Section>
            </Cell>
            {/*[if mso]></td></td><![endif]*/}
          </Row>
        </Section>
      </Container>
    </Body>
  </Html>
);

// ── Structure ──────────────────────────────────────────────────────────────

/**
 * Sequential section register: `01`, `02`, `03`, ...
 *
 * The indices have to be derived from the sections a message actually renders,
 * never written as literals. Every class here has at least one conditional
 * section, and a hardcoded index produces a document that reads "01, 02, 04"
 * the moment a condition is false - which looks like a page with a missing page
 * and undermines the reader's trust in the numbering that tells them the
 * evidence is complete.
 *
 * A component body executes top to bottom, so calling `next()` in JSX prop
 * position hands out indices in document order.
 */
export const sectionIndexer = (): { next: () => string } => {
  let n = 0;
  return {
    next: () => {
      n += 1;
      return String(n).padStart(2, '0');
    },
  };
};

/** Section register: `01` + a rule + title. Reads as a mission report. */
export const SectionHeading: React.FC<{ index?: string; title: string }> = ({
  index,
  title,
}) => (
  <Row>
    <Cell style={{ padding: `28px ${GUTTER}px 0` }}>
      <Row>
        {index ? (
          <Cell style={{ width: '34px', verticalAlign: 'top' }}>
            <Text style={{ ...sectionIndex, margin: '1px 0 0' }}>{index}</Text>
          </Cell>
        ) : null}
        <Cell style={{ verticalAlign: 'top' }}>
          <Text style={{ ...h2, margin: 0 }}>{title}</Text>
        </Cell>
      </Row>
    </Cell>
  </Row>
);

export const Paragraph: React.FC<{
  children: React.ReactNode;
  muted?: boolean;
  spaceAfter?: number;
}> = ({ children, muted, spaceAfter = 14 }) => (
  <Row>
    <Cell style={{ padding: `18px ${GUTTER}px 0` }}>
      <Text style={{ ...(muted ? bodySmall : body), margin: `0 0 ${spaceAfter}px` }}>
        {children}
      </Text>
    </Cell>
  </Row>
);

export const Lede: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Row>
    <Cell style={{ padding: `26px ${GUTTER}px 0` }}>
      <Text style={{ ...h1, margin: 0 }}>{children}</Text>
    </Cell>
  </Row>
);

export const Hairline: React.FC<{ spaceBefore?: number; spaceAfter?: number }> = ({
  spaceBefore = 24,
  spaceAfter = 0,
}) => (
  <Row>
    <Cell style={{ padding: `${spaceBefore}px ${GUTTER}px ${spaceAfter}px` }}>
      <Hr style={{ borderColor: color.rule, margin: 0 }} />
    </Cell>
  </Row>
);

// ── Telemetry ──────────────────────────────────────────────────────────────

export interface Datum {
  label: string;
  value: React.ReactNode;
  /** Renders the value in mono - for hashes, ids, endpoints, codes. */
  mono?: boolean;
  /** Renders the value in the given system-state colour. */
  tone?: HealthKey;
  /** Overrides the default alignment. Defaults follow the value's type. */
  align?: 'left' | 'right';
}

/**
 * How a value sits in its half of the register.
 *
 * Figures and machine strings are right-aligned so numbers share a decimal
 * edge and short codes read as a column. Prose is left-aligned: right-aligning
 * a sentence produces a ragged, centred-looking block that is markedly harder
 * to scan than one ragged left margin. The threshold is where right-alignment
 * stops reading as alignment and starts reading as a mistake.
 */
const alignFor = (row: Datum): 'left' | 'right' => {
  if (row.align) return row.align;
  if (row.mono) return 'left';
  if (typeof row.value === 'string' && row.value.length > 28) return 'left';
  return 'right';
};

/**
 * The label/value register. This is the core instrument of the whole system:
 * every fact a claim rests on is printed as an explicit, named, aligned pair.
 * No fact appears anywhere in these emails that is not also a row here.
 */
export const DataRegister: React.FC<{ rows: Datum[]; caption?: string }> = ({
  rows,
  caption,
}) => (
  <Row>
    <Cell style={{ padding: `20px ${GUTTER}px 0` }}>
      <Section
        bgcolor={color.recessed}
        style={{
          backgroundColor: color.recessed,
          borderRadius: '8px',
          border: `1px solid ${color.rule}`,
        }}
      >
        {caption ? (
          <Row>
            <Cell style={{ padding: '14px 18px 0' }}>
              <Text style={{ ...label, margin: 0 }}>{caption}</Text>
            </Cell>
          </Row>
        ) : null}
        <Row>
          <Cell style={{ padding: caption ? '10px 18px 4px' : '16px 18px 4px' }}>
            {rows.map((row, i) => {
              const align = alignFor(row);
              return (
                <Row key={`${row.label}-${i}`}>
                  <Cell
                    align="left"
                    style={{
                      verticalAlign: 'top',
                      paddingRight: '16px',
                      // Fixed, not auto: an auto-width label column makes each
                      // row's value start somewhere different, which is exactly
                      // the ragged edge the register exists to avoid.
                      width: '46%',
                    }}
                  >
                    <Text style={{ ...label, margin: '6px 0' }}>{row.label}</Text>
                  </Cell>
                  <Cell align={align} style={{ verticalAlign: 'top', width: '54%' }}>
                    <Text
                      style={{
                        ...(row.mono ? hash : figure),
                        ...(row.tone ? { color: health(row.tone).fg } : {}),
                        margin: '6px 0',
                        textAlign: align,
                      }}
                    >
                      {row.value}
                    </Text>
                  </Cell>
                </Row>
              );
            })}
            <Row>
              <Cell>
                <Hr
                  style={{
                    borderColor: color.rule,
                    margin: '8px 0 6px',
                  }}
                />
              </Cell>
            </Row>
          </Cell>
        </Row>
      </Section>
    </Cell>
  </Row>
);

// ── System state ───────────────────────────────────────────────────────────

export const StateTag: React.FC<{ state: HealthKey; children: React.ReactNode }> = ({
  state,
  children,
}) => {
  const tone = health(state);
  return (
    <Text
      style={{
        ...label,
        display: 'inline-block',
        color: tone.fg,
        backgroundColor: tone.wash,
        border: `1px solid ${tone.rule}`,
        borderRadius: '3px',
        padding: '4px 8px',
      }}
    >
      {children}
    </Text>
  );
};

/**
 * Full-width classification banner, immediately under the masthead.
 *
 * Carries the single most important sentence in the message. On a down
 * incident that sentence is "this is the vendor's fault"; the banner is the
 * only element allowed to use a filled state colour.
 */
export const ClassificationBanner: React.FC<{
  state: HealthKey;
  children: React.ReactNode;
}> = ({ state, children }) => {
  const tone = health(state);
  return (
    <Row>
      <Cell
        bgcolor={tone.wash}
        style={{
          backgroundColor: tone.wash,
          borderLeft: `3px solid ${tone.fg}`,
          padding: '13px 36px',
        }}
      >
        <Text
          style={{
            ...label,
            margin: 0,
            color: tone.fg,
            letterSpacing: '0.1em',
          }}
        >
          {children}
        </Text>
      </Cell>
    </Row>
  );
};

/**
 * The five weighted attribution signals with their contribution, plus the
 * honest ceiling. Publishing the ceiling next to the score is what separates
 * an evidence system from a dashboard: with a single observation point the
 * two corroborating signals are structurally zero, so 55.0 is the maximum
 * reachable and a reader must be told that, or they will read 55 as a verdict
 * that failed to compute.
 */
export const SignalLedger: React.FC<{
  signals: { name: string; weight: number; score: number; contributes: boolean }[];
  score: number;
  ceiling: number;
  classification: string;
}> = ({ signals, score, ceiling, classification }) => {
  const capped = ceiling < 100;
  return (
    <Row>
      <Cell style={{ padding: `16px ${GUTTER}px 0` }}>
        <Section
          bgcolor={color.paper}
          style={{ border: `1px solid ${color.rule}`, borderRadius: '8px' }}
        >
          <Row>
            <Cell style={{ padding: '14px 18px 0' }}>
              <Text style={{ ...label, margin: 0 }}>
                Attribution · five weighted signals
              </Text>
            </Cell>
          </Row>
          {signals.map((signal) => {
            const contribution = Math.round(signal.score * signal.weight * 10000) / 100;
            return (
              <Row key={signal.name}>
                <Cell style={{ padding: '0 18px' }}>
                  <Row>
                    <Cell
                      align="left"
                      style={{ verticalAlign: 'top', paddingRight: '12px' }}
                    >
                      <Text
                        style={{
                          ...bodySmall,
                          margin: '7px 0',
                          color: signal.contributes
                            ? color.ink
                            : color.inkTertiary,
                        }}
                      >
                        {signal.name.replace(/_/g, ' ')}
                      </Text>
                    </Cell>
                    <Cell align="right" style={{ verticalAlign: 'top', width: '142px' }}>
                      <Text
                        style={{
                          ...hash,
                          margin: '7px 0',
                          textAlign: 'right',
                          color: signal.contributes
                            ? color.inkSecondary
                            : color.inkTertiary,
                        }}
                      >
                        {signal.score.toFixed(4)} × {signal.weight.toFixed(2)} ={' '}
                        {contribution.toFixed(2)}
                      </Text>
                    </Cell>
                  </Row>
                </Cell>
              </Row>
            );
          })}
          <Row>
            <Cell style={{ padding: '6px 18px 0' }}>
              <Hr style={{ borderColor: color.rule, margin: '8px 0 0' }} />
            </Cell>
          </Row>
          <Row>
            <Cell style={{ padding: '0 18px' }}>
              <Row>
                <Cell align="left" style={{ verticalAlign: 'top' }}>
                  <Text style={{ ...label, margin: '11px 0 11px' }}>
                    Confidence
                  </Text>
                </Cell>
                <Cell align="right" style={{ verticalAlign: 'top' }}>
                  <Text style={{ ...figure, margin: '9px 0 9px', fontSize: '16px' }}>
                    {score.toFixed(2)} / 100
                  </Text>
                </Cell>
              </Row>
            </Cell>
          </Row>
          <Row>
            <Cell
              bgcolor={color.recessed}
              style={{ backgroundColor: color.recessed, padding: '13px 18px 15px' }}
            >
              {/* The single most important sentence in the message, and the one
                  most likely to be cut for length. Publishing the ceiling next
                  to the score is what separates an evidence system from a
                  dashboard: with a single observation point the two
                  corroborating signals are structurally zero, so a reader must
                  be told that a sub-75 score is the honest maximum rather than
                  let them assume the engine failed to converge. */}
              <Text style={{ ...note, margin: 0 }}>
                <span style={noteStrong}>
                  {classification.replace(/_/g, ' ')} at {score.toFixed(2)}
                </span>
                {capped ? (
                  <>
                    . The ceiling for this observation topology is{' '}
                    {ceiling.toFixed(2)}:{' '}
                    {ceiling < 75 ? (
                      <>
                        reaching <strong style={noteStrong}>vendor_failure</strong>{' '}
                        requires 75, and that verdict structurally requires a
                        second independent source, which one observation point
                        cannot provide. A score below the ceiling is the maximum
                        honestly reachable — not an unresolved computation.
                      </>
                    ) : (
                      <>
                        above the 75 required for a{' '}
                        <strong style={noteStrong}>vendor_failure</strong> verdict,
                        but a single vantage point cannot exclude a fault on the
                        observer's own network. Treat it as corroborating, not
                        conclusive.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    . Corroborated by a second independent source, so the two
                    signals that were unavailable to a single observation point
                    are present here.
                  </>
                )}
              </Text>
            </Cell>
          </Row>
        </Section>
      </Cell>
    </Row>
  );
};

// ── Action ─────────────────────────────────────────────────────────────────

export interface ActionProps {
  href: string;
  children: React.ReactNode;
  /** Ghost variant - a bordered rule, for secondary actions. */
  ghost?: boolean;
  /**
   * Explicit pixel width. Omit it and the width is derived from the label.
   *
   * This exists because the alternative is a two-line label inside a
   * single-line button. Word gives an inline-block button no intrinsic width, so
   * the VML fallback has to be told a number - and a number chosen once at the
   * call site goes stale the first time someone edits the label. Deriving it
   * from the label means a reworded button cannot silently start wrapping.
   */
  width?: number;
}

/**
 * Approximate rendered width of a 14px/600 sans label, in pixels.
 *
 * Deliberately generous: an over-wide button reads as generous padding, whereas
 * an under-wide one wraps and reads as broken. Clamped at both ends so a
 * one-word label is not a lozenge and a long sentence does not span the body.
 */
const labelWidth = (text: string): number => {
  const px = text.trim().length * 7.7 + 52;
  return Math.max(168, Math.min(430, Math.round(px / 2) * 2));
};

/**
 * The single call to action. Near-black on white in the primary variant, and a
 * hairline ghost for anything secondary - a filled button is a billboard, a
 * bordered one is an instruction.
 */
export const Action: React.FC<ActionProps> = ({
  href,
  children,
  ghost,
  width: explicitWidth,
}) => {
  const label = typeof children === 'string' ? children : '';
  const width = explicitWidth ?? labelWidth(label);
  const height = 46;
  const bg = ghost ? color.paper : color.signal;
  const fg = ghost ? color.signal : color.signalOnDark;
  const radius = 6;
  const border = ghost ? `1px solid ${color.ruleStrong}` : '1px solid #0B0F17';

  return (
    <Row>
      <Cell style={{ padding: `26px ${GUTTER}px 0` }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ borderCollapse: 'separate' }}
        >
          <tr>
            <RawCell
              align="center"
              bgcolor={bg}
              style={{
                backgroundColor: bg,
                borderRadius: `${radius}px`,
                border,
              }}
            >
              {/*[if mso]>
              <v:roundrect
                xmlns:v="urn:schemas-microsoft-com:vml"
                xmlns:w="urn:schemas-microsoft-com:office:word"
                href={href}
                style={{
                  height: `${height}px`,
                  vTextAnchor: 'middle',
                  width: `${width}px`,
                }}
                arcsize="13%"
                stroke="f"
                fillcolor={bg}
              >
                <w:anchorlock/>
                <center style={{ color: fg, fontFamily: font.sans, fontSize: '14px', fontWeight: 600 }}>
                  {children}
                </center>
              </v:roundrect>
              <![endif]-->
              {/*[if !mso]><!-- */}
              <Button
                href={href}
                style={{
                  ...btn,
                  ...vmlButton(width, height),
                  backgroundColor: bg,
                  color: fg,
                  border,
                  borderRadius: `${radius}px`,
                  height: `${height}px`,
                  lineHeight: `${height - 2}px`,
                  textAlign: 'center',
                  display: 'inline-block',
                  padding: '0 22px',
                  boxSizing: 'border-box',
                }}
              >
                {children}
              </Button>
              {/*[!endif]><!-->*/}
            </RawCell>
          </tr>
        </table>
      </Cell>
    </Row>
  );
};

/** Hairline-framed key/value block - for endpoints, plan limits, terms. */
export const FactPanel: React.FC<{ rows: Datum[]; caption?: string }> = ({
  rows,
  caption,
}) => (
  <Row>
    <Cell style={{ padding: `18px ${GUTTER}px 0` }}>
      <Section
        bgcolor={color.paper}
        style={{ border: `1px solid ${color.rule}`, borderRadius: '8px' }}
      >
        {caption ? (
          <Row>
            <Cell
              bgcolor={color.recessed}
              style={{ backgroundColor: color.recessed, padding: '10px 16px' }}
            >
              <Text style={{ ...label, margin: 0 }}>{caption}</Text>
            </Cell>
          </Row>
        ) : null}
        <Row>
          <Cell style={{ padding: caption ? '6px 16px 4px' : '12px 16px 4px' }}>
            {rows.map((row, i) => {
              const align = alignFor(row);
              return (
                <Row key={`${row.label}-${i}`}>
                  <Cell
                    align="left"
                    style={{ verticalAlign: 'top', paddingRight: '14px', width: '46%' }}
                  >
                    <Text style={{ ...bodySmall, margin: '7px 0' }}>{row.label}</Text>
                  </Cell>
                  <Cell align={align} style={{ verticalAlign: 'top', width: '54%' }}>
                    <Text
                      style={{
                        ...(row.mono ? hash : bodySmall),
                        margin: '7px 0',
                        textAlign: align,
                        fontWeight: 600,
                        color: color.ink,
                      }}
                    >
                      {row.value}
                    </Text>
                  </Cell>
                </Row>
              );
            })}
          </Cell>
        </Row>
      </Section>
    </Cell>
  </Row>
);

/** A discrete callout for the one thing that must not be skimmed past. */
export const Advisory: React.FC<{ state?: HealthKey; children: React.ReactNode }> = ({
  state = 'unknown',
  children,
}) => {
  const tone = health(state);
  return (
    <Row>
      <Cell style={{ padding: `20px ${GUTTER}px 0` }}>
        <Section
          bgcolor={tone.wash}
          style={{
            backgroundColor: tone.wash,
            borderLeft: `3px solid ${tone.fg}`,
            padding: '14px 18px',
          }}
        >
          <Text style={{ ...bodySmall, margin: 0, color: color.ink }}>{children}</Text>
        </Section>
      </Cell>
    </Row>
  );
};

/** Attachment chip - names the artefact without inlining it. */
export const Artefact: React.FC<{ name: string; meta: string; sha256: string }> = ({
  name,
  meta,
  sha256,
}) => (
  <Row>
    <Cell style={{ padding: `14px ${GUTTER}px 0` }}>
      <Section
        bgcolor={color.recessed}
        style={{
          backgroundColor: color.recessed,
          border: `1px solid ${color.rule}`,
          borderRadius: '8px',
        }}
      >
        <Row>
          <Cell style={{ padding: '14px 16px 0' }}>
            <Text style={{ ...label, margin: 0 }}>Artefact</Text>
          </Cell>
        </Row>
        <Row>
          <Cell style={{ padding: '8px 16px 0' }}>
            <Text
              style={{
                ...hash,
                margin: 0,
                color: color.ink,
                fontSize: '12px',
                lineHeight: '18px',
              }}
            >
              {name}
            </Text>
            <Text style={{ ...note, margin: '5px 0 0' }}>{meta}</Text>
          </Cell>
        </Row>
        <Row>
          <Cell style={{ padding: '12px 16px 16px' }}>
            <Text style={{ ...hash, margin: 0 }}>
              <span style={{ color: color.inkTertiary }}>sha-256&nbsp;</span>
              {sha256}
            </Text>
          </Cell>
        </Row>
      </Section>
    </Cell>
  </Row>
);

// ── Footer ─────────────────────────────────────────────────────────────────

export interface FooterProps {
  /** What the reader is receiving and who to ask. */
  purpose: string;
  /** The verification path, when the message makes a checkable claim. */
  verification?: { label: string; href: string; id?: string };
  methodologyVersion?: string;
  replyTo?: string;
  address: string;
  /** IAB-required physical address on commercial mail. */
  unsubscribe?: { label: string; href: string };
  legalNote?: string;
}

/**
 * Compliance footer.
 *
 * Every transactional class renders one. It states the purpose of the message
 * (CASL / CAN-SPAM / GDPR all require it), the sending address (required on
 * commercial mail in several jurisdictions), and - where the message asserts
 * something falsifiable - the path to check it independently.
 */
export const Footer: React.FC<FooterProps> = ({
  purpose,
  verification,
  methodologyVersion,
  replyTo,
  address,
  unsubscribe,
  legalNote,
}) => (
  <>
    <Hairline spaceBefore={32} />
    <Row>
      <Cell
        bgcolor={color.masthead}
        style={{ backgroundColor: color.masthead, padding: '26px 36px 30px' }}
      >
        {verification ? (
          <>
            <Text
              style={{
                ...label,
                margin: '0 0 8px',
                color: color.onDarkTertiary,
              }}
            >
              {verification.label}
            </Text>
            <Text
              style={{
                ...hash,
                margin: '0 0 18px',
                color: color.onDark,
                wordBreak: 'break-all',
              }}
            >
              <a href={verification.href} style={{ color: color.onDark }}>
                {verification.href}
              </a>
              {verification.id ? (
                <>
                  <br />
                  <span style={{ color: color.onDarkTertiary }}>
                    ref {verification.id}
                  </span>
                </>
              ) : null}
            </Text>
          </>
        ) : null}

        <Text
          style={{
            ...hash,
            margin: '0 0 14px',
            color: color.onDarkSecondary,
            fontFamily: font.sans,
            fontSize: '12px',
            lineHeight: '19px',
          }}
        >
          {purpose}
        </Text>

        <Text
          style={{
            ...hash,
            margin: '0 0 4px',
            color: color.onDarkTertiary,
            fontFamily: font.sans,
            fontSize: '12px',
            lineHeight: '19px',
          }}
        >
          {address}
          {replyTo ? (
            <>
              {' · '}
              Reply to{' '}
              <a href={`mailto:${replyTo}`} style={{ color: color.onDarkSecondary }}>
                {replyTo}
              </a>
            </>
          ) : null}
        </Text>

        {unsubscribe ? (
          <Text
            style={{
              ...hash,
              margin: '0 0 4px',
              color: color.onDarkTertiary,
              fontFamily: font.sans,
              fontSize: '12px',
              lineHeight: '19px',
            }}
          >
            {unsubscribe.label}{' '}
            <a href={unsubscribe.href} style={{ color: color.onDarkSecondary }}>
              Manage preferences
            </a>
          </Text>
        ) : null}

        {methodologyVersion ? (
          <Text
            style={{
              ...hash,
              margin: '0 0 4px',
              color: color.onDarkTertiary,
            }}
          >
            Methodology {methodologyVersion} · deterministic, no model inference
          </Text>
        ) : null}

        {legalNote ? (
          <Text
            style={{
              ...hash,
              margin: '14px 0 0',
              color: color.onDarkTertiary,
              fontFamily: font.sans,
              fontSize: '11px',
              lineHeight: '17px',
            }}
          >
            {legalNote}
          </Text>
        ) : null}
      </Cell>
    </Row>
  </>
);

/**
 * The signature block.
 *
 * Renders inside the document, above the hairline and the compliance footer.
 * Signing *after* the legal footer reads as though the signature belongs to the
 * legal notice rather than to the message, and puts the signoff outside the
 * document card entirely.
 *
 * Name first, on its own line, then role. This is the one class where a human
 * being must be unmistakably identifiable, so it is the only place the system
 * uses a two-line signature instead of a single inline rule.
 *
 * `name` is the sender, never the recipient. A service notification signed with
 * the customer's own name implies they wrote it.
 */
export const Signoff: React.FC<{ name?: string; role?: string }> = ({
  name,
  role,
}) => (
  <Row>
    <Cell style={{ padding: `26px ${GUTTER}px 0` }}>
      {name ? (
        <Text style={{ ...body, margin: 0, fontWeight: 600 }}>{name}</Text>
      ) : null}
      {role ? (
        <Text style={{ ...note, margin: name ? '3px 0 0' : 0 }}>{role}</Text>
      ) : null}
    </Cell>
  </Row>
);

export { Img };
