// design/cli/render/screen.mjs
//
// The mock renderer. One source of truth for a screen, two outputs:
//
//   toSVG()   -> pixel-accurate PNG (via resvg-js + IBM Plex Mono)
//   toRuns()  -> the same screen as a run list, which demo/reliastra-demo.py
//                replays into a real terminal with real ANSI escapes
//
// So the picture a reviewer approves and the bytes a developer sees cannot
// drift apart: they are the same data.
//
// Hard rule for this file: nothing is drawn inside the terminal surface that a
// terminal cannot print. Every run lands on the character grid, every
// background paints whole cells, every glyph is in the token set. The window
// frame around it is presentation and is allowed to be pretty.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DESIGN_ROOT = path.resolve(here, '..');
export const TOKENS = JSON.parse(fs.readFileSync(path.join(DESIGN_ROOT, 'tokens.json'), 'utf8'));

const M = TOKENS.metrics;
export const CELL = M.cell_w_px;      // 9.0  at font-size 15 (IBM Plex Mono advance = 0.6em)
export const LH = M.line_h_px;        // 22
export const FS = M.font_size_px;     // 15

/* ─────────────────────────────────────────────────────────── colour helpers */

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Blend `fg` over `bg` at `alpha` and return a solid hex. Terminals paint whole
 *  cells, so a "12% tint" has to become a real colour before it reaches one. */
export function blend(fg, bg, alpha) {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

/** role -> resolved colour for a theme ('dark' | 'light') */
export function role(roleName, theme = 'dark') {
  const r = TOKENS.roles[roleName];
  if (!r) throw new Error(`unknown role: ${roleName}`);
  return r[theme];
}

/* ────────────────────────────────────────────────────────────────── styles */
// Style codes used in markup: `{x:✖ DOWN}`. One character, resolved here, so a
// screen author writes roles and never hex values.
//
//   fg    role for the ink
//   bg    role for the cell background (blended when `tint` is set)
//   w     font weight (400/500/600)
//   tint  chip strength from tokens.tints
//   dim   multiply into the background instead of painting a role

export const STYLES = {
  ' ': { fg: 'text.primary' },
  d: { fg: 'text.secondary' },              // prose, hints
  t: { fg: 'text.tertiary' },               // keys, column headers, units
  f: { fg: 'text.faint' },                  // rules, scaffolding
  b: { fg: 'brand' },
  B: { fg: 'brand.bright' },
  u: { fg: 'verdict.up' },
  x: { fg: 'verdict.down' },
  w: { fg: 'verdict.degraded' },
  q: { fg: 'verdict.unknown' },
  p: { fg: 'provenance' },
  i: { fg: 'text.inverse' },
  m: { fg: 'text.secondary' },              // ids, hashes, urls
  h: { fg: 'text.tertiary', w: 600 },       // section label
  H: { fg: 'text.primary', w: 600 },        // wordmark / verdict word
  k: { fg: 'text.tertiary' },               // kv key
  v: { fg: 'text.primary', w: 500 },        // kv value
  n: { fg: 'text.primary', w: 500 },        // numeric
  V: { fg: 'text.primary', w: 600 },        // verdict word, no chip
  1: { fg: 'chart.1' },
  2: { fg: 'chart.2' },
  3: { fg: 'chart.3' },
  4: { fg: 'chart.4' },
  5: { fg: 'chart.5' },
  // chips: tinted cell + role ink, verdict weight
  U: { fg: 'verdict.up', bg: 'verdict.up', tint: 'chip', w: 600 },
  X: { fg: 'verdict.down', bg: 'verdict.down', tint: 'chip', w: 600 },
  W: { fg: 'verdict.degraded', bg: 'verdict.degraded', tint: 'chip', w: 600 },
  Q: { fg: 'verdict.unknown', bg: 'verdict.unknown', tint: 'chip', w: 600 },
  S: { fg: 'text.inverse', bg: 'brand', w: 600 },      // saturated brand chip
  s: { fg: 'text.primary', bg: 'canvas.selection' },   // selected row
  P: { fg: 'provenance', bg: 'provenance', tint: 'chip', w: 600 },
  e: { fgMix: ['text.faint', 'canvas.base', 0.20] },      // meter track: faint at tokens.tints.track toward the canvas
  // pane backgrounds (whole-line washes)
  R: { fg: 'text.primary', bg: 'canvas.raised' },
  K: { fg: 'text.secondary', bg: 'canvas.sunken' },
};

/** Resolve a style code to concrete colours for a theme. */
export function resolveStyle(code, theme = 'dark') {
  const st = STYLES[code] || STYLES[' '];
  const base = role('canvas.base', theme);
  const fg = st.fgMix
    ? blend(role(st.fgMix[0], theme), role(st.fgMix[1], theme), st.fgMix[2])
    : st.fg
      ? role(st.fg, theme)
      : role('text.primary', theme);
  let bg = null;
  if (st.bg) {
    const bgRaw = role(st.bg, theme);
    bg = st.tint ? blend(bgRaw, base, TOKENS.tints[st.tint] ?? 0.16) : bgRaw;
  }
  return { fg, bg, w: st.w || 400, roleFg: st.fg || 'text.primary', roleBg: st.bg || null, tint: st.tint || null };
}

/* ───────────────────────────────────────────────────────────────── markup */

/**
 * Parse `{code:text}` markup into runs. `{{` and `}}` are literal braces.
 * A run is { text, code } where code is a single style character.
 */
export function parseMarkup(input) {
  const runs = [];
  let i = 0;
  let buf = '';
  let code = ' ';
  const flush = () => {
    if (buf.length) {
      const last = runs[runs.length - 1];
      if (last && last.code === code) last.text += buf;
      else runs.push({ text: buf, code });
      buf = '';
    }
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === '{') {
      if (input[i + 1] === '{') { buf += '{'; i += 2; continue; }
      const close = input.indexOf('}', i);
      const colon = input.indexOf(':', i);
      if (close === -1 || colon === -1 || colon > close) { buf += ch; i += 1; continue; }
      flush();
      code = input.slice(i + 1, colon) || ' ';
      i = colon + 1;
      continue;
    }
    if (ch === '}') {
      if (input[i + 1] === '}') { buf += '}'; i += 2; continue; }
      flush();
      code = ' ';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return runs;
}

/** Visible width of a markup string, in terminal columns. */
export function widthOf(input) {
  let n = 0;
  for (const r of parseMarkup(input)) n += [...r.text].length;
  return n;
}

/** Strip markup to plain text (what the `plain` fidelity level prints). */
export function plainOf(input) {
  return parseMarkup(input).map((r) => r.text).join('');
}

/** Pad a markup string to `width` columns. */
export function pad(input, width, align = 'left', fill = ' ') {
  const w = widthOf(input);
  if (w >= width) return input;
  const space = fill.repeat(width - w);
  if (align === 'right') return `{f:${space}}` + input;
  if (align === 'center') {
    const l = Math.floor((width - w) / 2);
    return `{f:${fill.repeat(l)}}` + input + `{f:${fill.repeat(width - w - l)}}`;
  }
  return input + `{f:${space}}`;
}

/** Pad plain (markup-free) text. For values you already know carry no styles. */
export function padPlain(str, width, align = 'left') {
  const n = [...str].length;
  if (n >= width) return str;
  const space = ' '.repeat(width - n);
  if (align === 'right') return space + str;
  if (align === 'center') {
    const l = Math.floor((width - n) / 2);
    return ' '.repeat(l) + str + ' '.repeat(width - n - l);
  }
  return str + space;
}

/** Truncate to `width` columns, ending in the token ellipsis. Markup-safe. */
export function truncate(input, width) {
  if (widthOf(input) <= width) return input;
  let out = '';
  let used = 0;
  for (const r of parseMarkup(input)) {
    for (const ch of r.text) {
      if (used >= width - 1) break;
      out += `{${r.code}:${ch}}`;
      used += 1;
    }
    if (used >= width - 1) break;
  }
  return out + `{t:${TOKENS.glyphs.ellipsis}}`;
}

/* ──────────────────────────────────────────────────────────── components */

const G = TOKENS.glyphs;

/** A ruled section heading: LABEL ─────────────────── meta */
export function section(label, meta = '', cols = 100) {
  const left = `{h:${label.toUpperCase()}}`;
  const right = meta ? ` {t:${meta}}` : '';
  const gap = cols - widthOf(left) - widthOf(right);
  const rule = gap > 2 ? `{f:${' '.repeat(1)}${G.rule.repeat(gap - 1)}}` : '';
  return left + rule + right;
}

/** A full-width hairline rule. */
export function rule(cols = 100, char = G.rule, code = 'f') {
  return `{${code}:${char.repeat(cols)}}`;
}

/** Verdict chip: ` ● UP ` on a tinted cell. Shape + colour + word, always. */
export function chip(word, tone = 'up', glyph = null) {
  const codeMap = { up: 'U', down: 'X', degraded: 'W', unknown: 'Q', brand: 'S', provenance: 'P' };
  const glyphMap = { up: G.tick, down: G.cross, degraded: G.warn, unknown: G.dot };
  const g = glyph === null ? glyphMap[tone] || '' : glyph;
  const code = codeMap[tone] || 'Q';
  return `{${code}:${g ? g + ' ' : ''}${word.toUpperCase()}}`;
}

/** Segmented meter: `cells` blocks, filled ones in `code`, the rest painted in
 *  text.faint (same glyph, quieter ink). The number is always printed beside it
 *  by the caller, because a bar alone is a claim. */
export function meter(fraction, cells = 10, code = 'b', emptyCode = 'e') {
  const filled = Math.max(0, Math.min(cells, Math.round(fraction * cells)));
  return `{${code}:${G.meter_full.repeat(filled)}}{${emptyCode}:${G.meter_empty.repeat(cells - filled)}}`;
}

/** Dot-plot axis: a thin baseline with one marker at the value's position.
 *  Lighter than a filled meter for dense table rows, and it reads as a
 *  measurement, not a progress bar. `fraction` is value / window max. */
export function axis(fraction, cells = 22, code = 'b', baseCode = 'e') {
  const pos = Math.max(0, Math.min(cells - 1, Math.round(fraction * (cells - 1))));
  return `{${baseCode}:${G.rule.repeat(pos)}}{${code}:${G.meter_full}}{${baseCode}:${G.rule.repeat(cells - 1 - pos)}}`;
}

/** Sparkline over the block-elements ramp. */
export function spark(values, cells = null, code = 'p') {
  const vals = cells ? resample(values, cells) : values;
  if (!vals.length) return '';
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const ramp = G.spark;
  let out = '';
  for (const v of vals) {
    const idx = Math.round(((v - min) / span) * (ramp.length - 1));
    out += `{${code}:${ramp[idx]}}`;
  }
  return out;
}

/** Observation sparkline: one block per probe. Neutral ink for probes that
 *  succeeded, verdict.down for the ones that failed — so the shape is the
 *  history and the colour is only ever the fact. `points` is [{up, ms}]. */
export function obsSpark(points, cells = null, { envelopeMs = 2000 } = {}) {
  const vals = cells ? resample(points.map((p) => p.ms), cells) : points.map((p) => p.ms);
  const ups = cells
    ? resample(points.map((p) => (p.up ? 1 : 0)), cells).map((v) => v > 0.5)
    : points.map((p) => p.up);
  if (!vals.length) return '';
  const ramp = G.spark;
  let out = '';
  vals.forEach((v, i) => {
    // absolute scale: block height is latency against the latency envelope,
    // so a calm dependency reads as a calm line and a slow one reads as tall.
    const idx = Math.max(0, Math.min(ramp.length - 1, Math.round((v / envelopeMs) * (ramp.length - 1))));
    out += `{${ups[i] ? 'f' : 'x'}:${ramp[idx]}}`;
  });
  return out;
}

function resample(values, cells) {
  if (values.length === cells) return values;
  const out = [];
  for (let i = 0; i < cells; i += 1) {
    const from = Math.floor((i * values.length) / cells);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / cells));
    out.push(values.slice(from, to).reduce((a, b) => a + b, 0) / (to - from));
  }
  return out;
}

/** Aligned key/value block. Keys in text.tertiary, values in text.primary. */
export function kv(pairs, { keyWidth = 0, indent = 2 } = {}) {
  const w = keyWidth || Math.max(...pairs.map(([k]) => [...k].length));
  return pairs.map(([k, valueMarkup, valueStyle = 'v']) => {
    const padStr = ' '.repeat(indent);
    return `${padStr}{k:${k}}${' '.repeat(w - [...k].length)}  {${valueStyle}:${plainOf(valueMarkup) === valueMarkup ? valueMarkup : valueMarkup}}`;
  });
}

/**
 * Column table.
 *   columns: [{ key, header, align, width, max }]
 *   rows:    [{ cells: [markup,...] }]
 * Widths are explicit or derived from the longest cell, capped at `max`
 * (default 48, matching renderTable in cli/cmd/reliastra/output.go).
 */
export function table(columns, rows, { indent = 0, headerRule = true } = {}) {
  const widths = columns.map((c, i) => {
    if (c.width) return c.width;
    const longest = Math.max(widthOf(c.header), ...rows.map((r) => widthOf(r.cells[i] ?? '')));
    return Math.min(longest, c.max ?? 48);
  });
  const padStr = ' '.repeat(indent);
  const line = (cells) =>
    padStr +
    cells
      .map((cell, i) => pad(truncate(cell ?? '', widths[i]), widths[i], columns[i].align || 'left'))
      .join('  ')
      .replace(/\{f:\s*\}$/, '');
  const out = [];
  out.push(line(columns.map((c) => `{t:${c.header.toUpperCase()}}`)));
  if (headerRule) {
    out.push(
      padStr +
        widths.map((w) => `{f:${G.rule.repeat(w)}}`).join(`{f:${' '.repeat(2)}}`)
    );
  }
  for (const r of rows) out.push(line(r.cells));
  return out;
}

/** A hint line: the next command to run. Brand caret, secondary prose. */
export function hint(text, indent = 0) {
  return `${' '.repeat(indent)}{B:${G.caret}} {d:${text}}`;
}

/** An error block. Rule on the left in the failure tone; the fix on its own
 *  line behind an arrow; the exit code named last. */
export function errorBlock({ kind = 'down', title, detail, fix, exit, cols = 100, indent = 0 }) {
  const railCode = kind === 'down' ? 'x' : kind === 'degraded' ? 'w' : 'b';
  const glyphCode = kind === 'down' ? 'X' : kind === 'degraded' ? 'W' : 'S';
  const padStr = ' '.repeat(indent);
  const lines = [];
  lines.push(`${padStr}{${glyphCode}:${kind === 'down' ? G.cross : kind === 'degraded' ? G.warn : G.dot}} {V:${title}}`);
  if (detail) lines.push(`${padStr}  {${railCode}:${G.rail}} {d:${detail}}`);
  if (fix) lines.push(`${padStr}  {${railCode}:${G.rail}} {B:${G.arrow}} {d:${fix}}`);
  if (exit !== undefined) lines.push(`${padStr}  {f:${G.rail}} {t:exit ${exit}}`);
  return lines;
}

/* ───────────────────────────────────────────────────────────────── Screen */

let uidCounter = 0;

export class Screen {
  constructor({ cols = 100, theme = 'dark', rows = null } = {}) {
    this.cols = cols;
    this.theme = theme;
    this.lines = [];       // markup strings
    this.fixedRows = rows; // when set, pad/clip to exactly this many rows
    this.title = 'reliastra';
    this.uid = (uidCounter += 1);
    this.exitCode = null;
    this.promptInfo = null;
  }

  add(markup) { this.lines.push(markup); return this; }
  addAll(list) { list.forEach((l) => this.lines.push(l)); return this; }
  blank(n = 1) { for (let i = 0; i < n; i += 1) this.lines.push(''); return this; }

  /** A realistic shell prompt + the command line, so reviewers judge output in situ. */
  prompt(argv, { cwd = '~/src/checkout-svc', branch = 'main' } = {}) {
    this.promptInfo = { cwd, branch, argv };
    this.lines.push(
      `{t:${cwd}} {p:${branch}} {B:${G.caret}}  {B:reliastra} {v:${argv.replace(/^reliastra\s*/, '')}}`
    );
    return this;
  }

  /** Plain prompt for interactive frames (no argv echo). */
  promptBare({ cwd = '~/src/checkout-svc', branch = 'main' } = {}) {
    this.lines.push(`{t:${cwd}} {p:${branch}} {B:${G.caret}} `);
    return this;
  }

  toJSON() {
    return {
      cols: this.cols,
      theme: this.theme,
      title: this.title,
      exit: this.exitCode,
      prompt: this.promptInfo,
      lines: this.lines.map((l) => parseMarkup(l)),
    };
  }

  /** Row-normalised run list, exactly what the ANSI player consumes. */
  toRuns() {
    const lines = this.lines.slice();
    if (this.fixedRows) {
      while (lines.length < this.fixedRows) lines.push('');
      lines.length = this.fixedRows;
    }
    return {
      cols: this.cols,
      rows: lines.length,
      theme: this.theme,
      title: this.title,
      exit: this.exitCode,
      prompt: this.promptInfo,
      lines: lines.map((l) => parseMarkup(l).map((r) => [r.code, r.text])),
    };
  }

  /* ── SVG ───────────────────────────────────────────────────────────── */

  /** The window (title bar + terminal surface) drawn at origin 0,0.
   *  Returns { svg, w, h } so several windows can be composed into one sheet. */
  windowSVG({ chrome = 'window' } = {}) {
    const lines = this.lines.slice();
    if (this.fixedRows) {
      while (lines.length < this.fixedRows) lines.push('');
      lines.length = this.fixedRows;
    }
    const rows = lines.length;
    const theme = this.theme;
    const base = role('canvas.base', theme);
    const hair = role('line.hairline', theme);
    const ruleCol = role('line.rule', theme);

    const PAD_X = 20;
    const PAD_TOP = 14;
    const PAD_BOT = 16;
    const TITLE_H = chrome === 'window' ? 36 : 0;
    const w = this.cols * CELL + PAD_X * 2;
    const h = TITLE_H + PAD_TOP + rows * LH + PAD_BOT;
    const parts = [];

    parts.push(`<defs>
      <linearGradient id="railG-${this.uid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${role('brand', theme)}" stop-opacity="0.95"/>
        <stop offset="0.42" stop-color="${role('provenance', theme)}" stop-opacity="0.5"/>
        <stop offset="1" stop-color="${role('provenance', theme)}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>`);
    parts.push(`<rect width="${w}" height="${h}" rx="11" fill="${base}"/>`);

    if (chrome === 'window') {
      parts.push(`<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10.5" fill="none" stroke="${ruleCol}" stroke-opacity="0.85"/>`);
      parts.push(`<rect x="1" y="1" width="${w - 2}" height="${TITLE_H - 1}" rx="10.5" fill="${blend(role('canvas.raised', theme), base, 0.6)}"/>`);
      parts.push(`<rect x="1" y="${TITLE_H - 1}" width="${w - 2}" height="1" fill="${hair}"/>`);
      // signature motif: the observation rail — a measurement scale, one tall tick per 16 cols
      parts.push(`<rect x="1" y="1" width="${w - 2}" height="2.5" rx="1.2" fill="url(#railG-${this.uid})"/>`);
      let ticks = '';
      for (let c = 0; c <= this.cols; c += 2) {
        const tx = PAD_X + c * CELL;
        const tall = c % 16 === 0;
        ticks += `<rect x="${tx.toFixed(2)}" y="${TITLE_H - (tall ? 8 : 5)}" width="1" height="${tall ? 7 : 4}" fill="${role('text.faint', theme)}" opacity="${tall ? 0.5 : 0.26}"/>`;
      }
      parts.push(ticks);

      const titleText = this.title;
      parts.push(
        `<text x="${PAD_X}" y="22" font-family="${M.font_family}" font-size="12.5" font-weight="500" fill="${role('text.secondary', theme)}" xml:space="preserve">${esc(titleText)}</text>`
      );
      const dimText = `  ${G.dot}  ${this.cols}${'\u00d7'}${rows}  ${G.dot}  zsh`;
      const titleW = approxWidth(titleText, 12.5);
      parts.push(
        `<text x="${PAD_X + titleW}" y="22" font-family="${M.font_family}" font-size="12.5" font-weight="400" fill="${role('text.faint', theme)}" xml:space="preserve">${esc(dimText)}</text>`
      );

      if (this.exitCode !== null) {
        const label = `exit ${this.exitCode}`;
        const tone =
          this.exitCode === 0 ? 'verdict.up' : this.exitCode === 4 || this.exitCode === 2 ? 'verdict.down' : 'verdict.degraded';
        const chipBg = blend(role(tone, theme), base, 0.16);
        const wChip = approxWidth(label, 11.5) + 18;
        const cx = w - PAD_X - wChip;
        parts.push(`<rect x="${cx}" y="10" width="${wChip}" height="17" rx="3" fill="${chipBg}"/>`);
        parts.push(
          `<text x="${cx + wChip / 2}" y="22" text-anchor="middle" font-family="${M.font_family}" font-size="11.5" font-weight="600" fill="${role(tone, theme)}" xml:space="preserve">${esc(label)}</text>`
        );
      }
    }

    // the terminal surface: runs on the character grid, whole-cell backgrounds
    const x0 = PAD_X;
    const y0 = TITLE_H + PAD_TOP;
    let bgRects = '';
    let texts = '';

    lines.forEach((line, r) => {
      const runs = mergeRuns(parseMarkup(line));
      let col = 0;
      for (const run of runs) {
        const st = resolveStyle(run.code, theme);
        const n = [...run.text].length;
        const px = x0 + col * CELL;
        const py = y0 + r * LH;
        if (st.bg) {
          bgRects += `<rect x="${px.toFixed(2)}" y="${py}" width="${(n * CELL).toFixed(2)}" height="${LH}" fill="${st.bg}"/>`;
        }
        const visible = run.text.replace(/\s+$/, '');
        // split the run into cell-geometry segments (block elements) and text
        let segStart = 0;
        let segIsBlock = visible.length ? blockCell(visible[0]) !== null : false;
        const flushSeg = (from, to, isBlock) => {
          const seg = visible.slice(from, to);
          if (!seg.length) return;
          if (isBlock) {
            for (let i = 0; i < seg.length; i += 1) {
              const g = blockCell(seg[i]);
              if (!g) continue;
              bgRects += `<rect x="${(px + (from + i) * CELL + g.x * CELL).toFixed(2)}" y="${(py + g.y * LH).toFixed(2)}" width="${(g.w * CELL).toFixed(2)}" height="${(g.h * LH).toFixed(2)}" fill="${st.fg}"/>`;
            }
          } else {
            texts +=
              `<text x="${(px + from * CELL).toFixed(2)}" y="${(py + LH * 0.5 + FS * 0.36).toFixed(2)}" font-family="${M.font_family}" font-size="${FS}" font-weight="${st.w}" fill="${st.fg}" xml:space="preserve" textLength="${(seg.length * CELL).toFixed(2)}" lengthAdjust="spacing">${esc(seg)}</text>`;
          }
        };
        for (let i = 1; i <= visible.length; i += 1) {
          const isBlock = i < visible.length ? blockCell(visible[i]) !== null : segIsBlock;
          if (i === visible.length || isBlock !== segIsBlock) {
            flushSeg(segStart, i, segIsBlock);
            segStart = i;
            segIsBlock = isBlock;
          }
        }
        col += n;
      }
    });

    parts.push(bgRects);
    parts.push(texts);
    return { svg: parts.join(''), w, h };
  }

  toSVG({ chrome = 'window', caption = null } = {}) {
    const win = this.windowSVG({ chrome });
    const theme = this.theme;
    const OUTER = chrome === 'window' ? 34 : 0;
    const CAP_H = caption ? 40 : 0;
    const W = win.w + OUTER * 2;
    const H = win.h + OUTER * 2 + CAP_H;
    const parts = [];
    parts.push(canvasDefs(W, H, theme));
    if (chrome === 'window') parts.push(softShadow(OUTER, OUTER, win.w, win.h, theme));
    parts.push(`<g transform="translate(${OUTER},${OUTER})">${win.svg}</g>`);
    if (caption) {
      parts.push(
        `<text x="${W / 2}" y="${H - 14}" text-anchor="middle" font-family="${M.font_family}" font-size="12.5" font-weight="400" fill="${theme === 'dark' ? '#6B7893' : '#69748A'}" xml:space="preserve">${esc(caption)}</text>`
      );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  }
}

/** Presentation canvas: a quiet vertical gradient. No texture, no glow — the
 *  type carries the design. */
function canvasDefs(W, H, theme) {
  const cTop = theme === 'dark' ? '#0A0E17' : '#EEF1F6';
  const cBot = theme === 'dark' ? '#141B2C' : '#DCE2EB';
  return `<defs><linearGradient id="canvasG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${cTop}"/><stop offset="1" stop-color="${cBot}"/>
  </linearGradient></defs><rect width="${W}" height="${H}" fill="url(#canvasG)"/>`;
}

/** Hand-rolled soft shadow (resvg-safe: no filter dependency). */
function softShadow(x, y, w, h, theme) {
  const steps = 7;
  let out = '';
  for (let s = steps; s >= 1; s -= 1) {
    const grow = s * 3.2;
    const op = (0.055 * (steps - s + 1)) / steps;
    out += `<rect x="${x - grow}" y="${y - grow * 0.45}" width="${w + grow * 2}" height="${h + grow * 1.5}" rx="${12 + grow}" fill="${theme === 'dark' ? '#000000' : '#5A6B85'}" opacity="${op.toFixed(3)}"/>`;
  }
  return out;
}

/**
 * Compose several windows onto one sheet. `entries` is [{ screen, caption }].
 * Used by the fidelity triptych: same screen, three fidelities, one image.
 */
export function composeStack(entries, { gap = 30, chrome = 'window', theme = 'dark', margin = 40 } = {}) {
  const wins = entries.map((e) => ({ ...e, win: e.screen.windowSVG({ chrome }) }));
  const maxW = Math.max(...wins.map((v) => v.win.w));
  let y = margin;
  const placements = wins.map((v) => {
    const p = { ...v, x: margin + Math.round((maxW - v.win.w) / 2), y };
    y += v.win.h + (v.caption ? 26 : 0) + gap;
    return p;
  });
  const W = maxW + margin * 2;
  const H = y - gap + margin;
  const parts = [canvasDefs(W, H, theme)];
  for (const p of placements) {
    parts.push(softShadow(p.x, p.y, p.win.w, p.win.h, theme));
    parts.push(`<g transform="translate(${p.x},${p.y})">${p.win.svg}</g>`);
    if (p.caption) {
      parts.push(
        `<text x="${W / 2}" y="${p.y + p.win.h + 19}" text-anchor="middle" font-family="${M.font_family}" font-size="12.5" font-weight="500" fill="${theme === 'dark' ? '#6B7893' : '#69748A'}" xml:space="preserve">${esc(p.caption)}</text>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}


/** Block elements are cell geometry, not letterforms: U+2588 is the whole cell,
 *  U+2581..U+2587 are the lower n/8 of it. IBM Plex Mono happens to draw them as
 *  narrow letterforms, which would make every meter and sparkline in a mockup
 *  lie about what a real terminal prints. So the mock paints them as cells —
 *  which is also what the Unicode definition says they are.
 *  Returns { x, y, w, h } in cell fractions, or null for a non-block char. */
function blockCell(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x2581 && cp <= 0x2587) {
    const h = (cp - 0x2580) / 8;
    return { x: 0, y: 1 - h, w: 1, h };
  }
  if (cp === 0x2588) return { x: 0, y: 0, w: 1, h: 1 };
  if (cp === 0x2580) return { x: 0, y: 0, w: 1, h: 0.5 };
  if (cp === 0x2584) return { x: 0, y: 0.5, w: 1, h: 0.5 };
  if (cp >= 0x2589 && cp <= 0x258b) {
    const w = (cp - 0x2588 + 8) / 8 - 1 + 1; // 0x2589 = 7/8 … 0x258b = 5/8
    return { x: 0, y: 0, w: (0x2590 - cp) / 8 + 0.5, h: 1 };
  }
  if (cp === 0x258c) return { x: 0, y: 0, w: 0.5, h: 1 };
  if (cp === 0x2590) return { x: 0.5, y: 0, w: 0.5, h: 1 };
  return null;
}

function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.code === r.code) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

function approxWidth(str, size) {
  return [...str].length * size * M.advance_em;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ───────────────────────────────────────────────────────────────── raster */

const TOOLS_CANDIDATES = [
  process.env.RELIASTRA_DESIGN_TOOLS,
  '/home/user/.cache/tools',
  path.join(DESIGN_ROOT, 'tools'),
].filter(Boolean);

export function loadResvg() {
  for (const root of TOOLS_CANDIDATES) {
    try {
      const require = createRequire(path.join(root, 'noop.js'));
      const mod = require('@resvg/resvg-js');
      return { Resvg: mod.Resvg, root };
    } catch { /* try the next candidate */ }
  }
  throw new Error(
    '@resvg/resvg-js not found. Install the render toolchain:\n' +
      '  mkdir -p ~/.cache/tools && cd ~/.cache/tools && npm init -y && \\\n' +
      '  npm i @resvg/resvg-js @expo-google-fonts/ibm-plex-mono @expo-google-fonts/jetbrains-mono\n' +
      '(or point RELIASTRA_DESIGN_TOOLS at a directory that holds those node_modules)'
  );
}

export function fontFiles() {
  for (const root of TOOLS_CANDIDATES) {
    const plex = path.join(root, 'node_modules/@expo-google-fonts/ibm-plex-mono');
    if (!fs.existsSync(plex)) continue;
    const want = [
      '400Regular/IBMPlexMono_400Regular.ttf',
      '500Medium/IBMPlexMono_500Medium.ttf',
      '600SemiBold/IBMPlexMono_600SemiBold.ttf',
      '400Regular_Italic/IBMPlexMono_400Regular_Italic.ttf',
    ];
    const found = want.map((w) => path.join(plex, w)).filter((f) => fs.existsSync(f));
    if (found.length) return found;
  }
  return [];
}

/** Render a Screen to a PNG file. scale 2 = retina. */
export function renderPNG(screen, outFile, { scale = 2, chrome = 'window', caption = null } = {}) {
  const { Resvg } = loadResvg();
  const svg = screen.toSVG({ chrome, caption });
  const resvg = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: false, fontFiles: fontFiles(), defaultFontFamily: M.font_family },
  });
  const png = resvg.render().asPng();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, png);
  return { bytes: png.length, width: resvg.width, height: resvg.height };
}

/** Raster an arbitrary SVG document (used by composed sheets). */
export function renderSVGFile(svg, outFile, { scale = 2 } = {}) {
  const { Resvg } = loadResvg();
  const resvg = new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: false, fontFiles: fontFiles(), defaultFontFamily: M.font_family },
  });
  const png = resvg.render().asPng();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, png);
  return { bytes: png.length, width: resvg.width, height: resvg.height };
}
