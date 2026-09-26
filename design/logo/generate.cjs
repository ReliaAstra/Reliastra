#!/usr/bin/env node
/**
 * RELIASTRA — identity generator.
 *
 * Emits the whole identity deterministically: the mark, the lockups, the
 * application icons and the review preview. Every file in this directory is
 * produced by this script; nothing is hand-edited afterwards.
 *
 *   node generate.cjs
 *
 * Requires @resvg/resvg-js (raster export + text proofing) and opentype.js
 * (the wordmark is outlined, so the shipped SVGs carry no font dependency).
 * Both are resolved from TOOLS: set RELIASTRA_TOOLS to move them.
 *
 * ---------------------------------------------------------------------------
 * THE MARK — "THE APERTURE"
 * ---------------------------------------------------------------------------
 * Four segments of equal width, assembled along the edges of a square rotated
 * 45 degrees, each segment running slightly past the vertex it meets so the
 * corners read as joints in a fabricated article rather than as a drawn shape.
 * A single amber diamond sits in the opening: the observation point.
 *
 * The construction is deliberate, and it is the whole argument of the mark:
 *
 *   - A square rotated 45 degrees is a frame that has no front. It reads as a
 *     boundary, a field, a measurement aperture - not as a logo with a face.
 *   - Four equal segments answer to four equal quadrants: north, east, south,
 *     west. Two of them are vantage points, two of them are readings. The
 *     method - observe, correlate, attribute - is in the geometry, not in a
 *     caption.
 *   - The overhang at each vertex is the one irregular decision in an
 *     otherwise exact figure. It is what stops the mark being a diamond with
 *     a dot in it, and it survives down to 16 px as a flare of light at the
 *     diagonals.
 *   - The amber core is the signal square the interface already uses for an
 *     observation point, at seal scale. Amber is the product's single accent
 *     and also its degraded state - the accent colour of this product is the
 *     colour of something needing attention.
 *
 * Drawn on a 100 x 100 grid. No gradients, no rounded corners, no shadows:
 * the mark must remain exact at every size and in one colour.
 */
const fs = require('fs');
const path = require('path');

const TOOLS = process.env.RELIASTRA_TOOLS || '/home/user/.cache/tools';
const HERE = __dirname;
const { Resvg } = require(path.join(TOOLS, 'node_modules/@resvg/resvg-js'));
const opentype = require(path.join(TOOLS, 'node_modules/opentype.js'));

const FONT_FILE = path.join(
  TOOLS,
  'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
);

/* ─────────────────────────────────────────────────────────── palette ─── */
const C = {
  void: '#08090A', // observatory foundation
  light: '#F2F2EE', // instrument light (mark stroke on void)
  signal: '#D9A441', // single accent / observation point
  ink: '#0B1220', // product text ink (mark stroke on light)
  brand: '#2563EB', // product brand blue (core on light)
};

/* ──────────────────────────────────────────────────────────── units ─── */
const U = 100; // master grid
const R = 40; // diamond vertex radius from centre
const BAR = 13; // segment width
const OVER = 7; // segment overrun past each vertex
const CORE = 22; // amber core half-diagonal
const VERT = [
  [50, 50 - R],
  [50 + R, 50],
  [50, 50 + R],
  [50 - R, 50],
]; // N E S W

const n = (v) => Number(v.toFixed(2));

/* The four segments, in master units. Returned as path `d` strings. */
function segments() {
  const len = Math.hypot(R, R);
  return [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ].map(([a, b]) => {
    const [x1, y1] = VERT[a];
    const [x2, y2] = VERT[b];
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    return `M${n(x1 - ux * OVER)} ${n(y1 - uy * OVER)}L${n(x2 + ux * OVER)} ${n(y2 + uy * OVER)}`;
  });
}

/* The core diamond. */
const corePath = () => `M50 ${50 - CORE}L${50 + CORE} 50L50 ${50 + CORE}L${50 - CORE} 50Z`;

/**
 * The mark as SVG source, in a viewBox of `box` units.
 * `bar`/`core` carry colour; `ring` is the optional inner keyline that keeps
 * the core separated from the segments when the two values are close.
 */
function markSvg({
  bar = 'currentColor',
  core = C.signal,
  ring = null,
  box = U,
  margin = 0,
  id = '',
} = {}) {
  const scale = (box - margin * 2) / U;
  const stroke = VERT.length ? segments() : [];
  const title = id ? `<title>${id}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" role="img" aria-label="RELIASTRA">${title}
  <g transform="translate(${n(margin)} ${n(margin)}) scale(${n(scale)})">
    <g stroke="${bar}" stroke-width="${BAR}" fill="none">
${stroke.map((d) => `      <path d="${d}"/>`).join('\n')}
    </g>
    ${ring ? `<path d="${corePath()}" fill="none" stroke="${ring}" stroke-width="7"/>` : ''}
    <path d="${corePath()}" fill="${core}"/>
  </g>
</svg>
`;
}

/* ──────────────────────────────────────────────────────── wordmark ─── */
/**
 * RELIASTRA, outlined from Inter SemiBold at a given tracking.
 * Outlined deliberately: the shipped lockups must render identically in a
 * README, an email client, a print pipeline and a browser tab, with no font
 * file travelling alongside them. Inter is the interface face, so the
 * wordmark and the product set in the same voice.
 */
let _font = null;
function inter() {
  if (_font) return _font;
  const buf = fs.readFileSync(FONT_FILE);
  // opentype.js 2.x cannot walk Inter's GSUB ccmp table; glyph-by-glyph
  // lookup sidesteps the feature query entirely and is all we need for caps.
  _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return _font;
}

function wordmarkPath({ size = 34, tracking = 0.21, text = 'RELIASTRA' } = {}) {
  const font = inter();
  const upm = font.unitsPerEm;
  const path = new opentype.Path();
  let x = 0;
  const chars = [...text];
  chars.forEach((ch, i) => {
    const g = font.charToGlyph(ch);
    path.extend(g.getPath(x, 0, size));
    x += (g.advanceWidth / upm) * size;
    if (i < chars.length - 1) x += tracking * size;
  });
  return { path, advance: x };
}

/**
 * Horizontal lockup: mark, gap, wordmark, all optically centred on the same
 * axis. Geometry is derived, not eyeballed - the text block is centred on the
 * mark's centre line using its own bounding box.
 */
function lockupHorizontal({ bar = C.light, core = C.signal, text = C.light, font = 34, tracking = 0.21 } = {}) {
  const MK = U; // mark box
  const GAP = 30;
  const { path: tp, advance } = wordmarkPath({ size: font, tracking });
  const bb = tp.getBoundingBox();
  const textH = bb.y2 - bb.y1;
  const textY = MK / 2 - (bb.y1 + textH / 2); // vertical centring offset
  const pad = 14;
  const totalW = MK + GAP + advance + pad * 2;
  const totalH = MK + pad * 2;
  const d = tp.toPathData(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(totalW)} ${n(totalH)}" width="${n(totalW)}" height="${n(totalH)}" role="img" aria-label="RELIASTRA">
  <title>RELIASTRA</title>
  <g transform="translate(${n(pad)} ${n(pad)})">
    <g stroke="${bar}" stroke-width="${BAR}" fill="none">
${segments().map((s) => `      <path d="${s}"/>`).join('\n')}
    </g>
    <path d="${corePath()}" fill="${core}"/>
  </g>
  <g transform="translate(${n(pad + MK + GAP)} ${n(pad + textY)})">
    <path d="${d}" fill="${text}" fill-rule="nonzero"/>
  </g>
</svg>
`;
}

/**
 * Stacked lockup: mark over centred wordmark over descriptor.
 * Used where there is no room to sit beside the name - a profile avatar field,
 * a document cover, a sponsorship plate. The descriptor is small, letterspaced
 * and dimmed: it is a caption, never a second headline.
 */
function lockupStacked({
  bar = C.light,
  core = C.signal,
  text = C.light,
  desc = 'INDEPENDENT EVIDENCE FOR EXTERNAL DEPENDENCIES',
} = {}) {
  const W = 460;
  const MK = 104;
  const topPad = 16;
  const nameSize = 30;
  const descSize = 8.6;
  const { path: tp, advance } = wordmarkPath({ size: nameSize, tracking: 0.3 });
  const tb = tp.getBoundingBox();
  const nameY = topPad + MK + 62;
  const { path: dp, advance: dav } = wordmarkPath({ size: descSize, tracking: 0.36, text: desc });
  const db = dp.getBoundingBox();
  const descY = nameY + 34;
  const H = descY - db.y1 + 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${n(H)}" width="${W}" height="${n(H)}" role="img" aria-label="RELIASTRA">
  <title>RELIASTRA</title>
  <g transform="translate(${n((W - MK) / 2)} ${topPad})">
    <g stroke="${bar}" stroke-width="${BAR}" fill="none">
${segments().map((s) => `      <path d="${s}"/>`).join('\n')}
    </g>
    <path d="${corePath()}" fill="${core}"/>
  </g>
  <g transform="translate(${n((W - advance) / 2)} ${n(nameY)})">
    <path d="${tp.toPathData(2)}" fill="${text}" fill-rule="nonzero"/>
  </g>
  <g transform="translate(${n((W - dav) / 2)} ${n(descY)})">
    <path d="${dp.toPathData(2)}" fill="${text}" fill-opacity="0.62" fill-rule="nonzero"/>
  </g>
</svg>
`;
}

/* ───────────────────────────────────────────── construction plates ─── */
/**
 * Construction plate: the mark over its own geometry. A grid of ten units,
 * the circumscribed diamond, the two axes, and the four vertex points. This is
 * a specification drawing, not decoration - it shows that every dimension in
 * the mark is a decision someone can check.
 */
function constructionSvg({ size = 400, bg = '#0E1013', grid = 'rgba(242,242,238,0.06)', guide = 'rgba(242,242,238,0.22)' } = {}) {
  const s = size / U;
  const lines = [];
  for (let i = 1; i < 10; i++) {
    const p = n(i * 10);
    lines.push(`<path d="M${p} 0V100M0 ${p}H100" stroke="${grid}" stroke-width="0.4"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${U} ${U}" role="img" aria-label="RELIASTRA mark construction">
  <rect width="${U}" height="${U}" fill="${bg}"/>
  ${lines.join('\n  ')}
  <g stroke="${guide}" stroke-width="0.6" fill="none">
    <path d="M50 10L90 50L50 90L10 50Z"/>
    <path d="M50 0V100M0 50H100" stroke-dasharray="2 3"/>
    <circle cx="50" cy="50" r="${R * 0.7071}" stroke-dasharray="1.5 2.5"/>
  </g>
  <g stroke="${C.light}" stroke-width="${BAR}" fill="none">
${segments().map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
  <path d="${corePath()}" fill="${C.signal}"/>
  <g fill="${C.signal}">
${VERT.map(([x, y]) => `    <circle cx="${x}" cy="${y}" r="1.6"/>`).join('\n')}
  </g>
</svg>
`;
}

/**
 * Parts plate: the four segments separated in value, so the assembly is
 * legible. Two light, two pulled back - the mark is built from parts, and the
 * parts are what the product observes.
 */
function partsSvg({ size = 400, bg = '#0E1013' } = {}) {
  const shade = ['#F2F2EE', '#C9CBC6', '#9A9C99', '#6E706E'];
  const segs = segments();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${U} ${U}" role="img" aria-label="RELIASTRA mark parts">
  <rect width="${U}" height="${U}" fill="${bg}"/>
${segs.map((d, i) => `  <path d="${d}" stroke="${shade[i]}" stroke-width="${BAR}" fill="none"/>`).join('\n')}
  <path d="${corePath()}" fill="${C.signal}"/>
</svg>
`;
}

/* ──────────────────────────────────────────────────────── sheets ─── */
/**
 * Brand sheet: the whole identity in one image, for places that need a single
 * artifact - a pull request, a sponsorship deck, a social post. Composed from
 * the same primitives as everything else and outlined, so it carries no font
 * either.
 */
function brandSheet({ W = 1600, H = 1180 } = {}) {
  const text = (str, size, tracking = 0.2) => wordmarkPath({ text: str, size, tracking });
  /** label left-aligned at (x, y) where y is the text baseline */
  const eye = (str, x, y, size = 12, tracking = 0.24, fill = '#8B9095') => {
    const l = text(str, size, tracking);
    return `<g transform="translate(${n(x)} ${n(y)})"><path d="${l.path.toPathData(2)}" fill="${fill}" fill-rule="nonzero"/></g>`;
  };
  /** label right-aligned so it ends at (x, y) */
  const eyeEnd = (str, x, y, size = 12, tracking = 0.24, fill = '#8B9095') => {
    const l = text(str, size, tracking);
    return eye(str, x - l.advance, y, size, tracking, fill);
  };
  const markAt = (x, y, px, bar = C.light, core = C.signal) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(px / U)})"><g stroke="${bar}" stroke-width="${BAR}" fill="none">` +
    segments().map((d) => `<path d="${d}"/>`).join('') +
    `</g><path d="${corePath()}" fill="${core}"/></g>`;
  const rule = (x, y, w, op = 0.1) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="1" fill="#F2F2EE" opacity="${op}"/>`;
  /** an existing lockup SVG, stripped of its <svg> wrapper, scaled to `w` wide */
  const lockAt = (svg, x, y, w) => {
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    const scale = w / Number(vb[1]);
    return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})">${svg.replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>`;
  };

  const parts = [`<rect width="${W}" height="${H}" fill="${C.void}"/>`];

  /* ── header ─────────────────────────────────────────────────────── */
  parts.push(markAt(64, 54, 40));
  parts.push(eye('RELIASTRA', 118, 82, 17, 0.26, C.light));
  parts.push(eyeEnd('THE APERTURE / IDENTITY SYSTEM v1.0', W - 64, 80, 10, 0.22));
  parts.push(rule(64, 116, W - 128, 0.12));

  /* ── row 1: primary forms and the size ladder ───────────────────── */
  const R1 = 176;
  parts.push(markAt(150, R1, 220));
  parts.push(eye('PRIMARY', 150, R1 + 274));

  const plateX = 470, plateS = 200, platePad = 22;
  parts.push(`<rect x="${plateX}" y="${R1}" width="${plateS}" height="${plateS}" fill="#F2F2EE"/>`);
  parts.push(markAt(plateX + platePad, R1 + platePad, plateS - platePad * 2, C.ink, C.brand));
  parts.push(eye('ON PAPER', plateX, R1 + 274));

  const monoX = 740;
  parts.push(markAt(monoX, R1, 200, C.light, C.light));
  parts.push(eye('ONE COLOUR', monoX, R1 + 274));

  const sizes = [16, 24, 32, 48, 64];
  const gap = 26;
  const ladderW = sizes.reduce((a, b) => a + b, 0) + gap * (sizes.length - 1);
  let lx = 1000 + (W - 64 - 1000 - ladderW) / 2;
  sizes.forEach((s) => {
    parts.push(markAt(lx, R1 + (200 - s) / 2, s));
    lx += s + gap;
  });
  parts.push(eye('SIZE LADDER / 16 → 64 PX', 1000, R1 + 274));
  parts.push(rule(64, 524, W - 128, 0.1));

  /* ── row 2: lockup on void ──────────────────────────────────────── */
  const LW = 560;
  parts.push(lockAt(LOCK_SVG, 64, 570, LW));
  parts.push(eye('HORIZONTAL LOCKUP / VOID', 64, 800));

  /* ── row 3: lockup on paper ─────────────────────────────────────── */
  const pw = LW + 32, ph = 190;
  parts.push(`<rect x="64" y="844" width="${pw}" height="${ph}" fill="#F2F2EE"/>`);
  parts.push(lockAt(LOCK_INK_SVG, 80, 856, LW));
  parts.push(eye('INK / PAPER', 64, 1074));

  /* ── right column: tokens and the statement ─────────────────────── */
  const cx = 1064;
  parts.push(rule(cx, 570, W - 64 - cx, 0.1));
  parts.push(eye('TOKENS', cx, 606));
  const tokens = [
    ['#08090A', 'OBSERVATORY VOID', 'field on dark surfaces'],
    ['#F2F2EE', 'INSTRUMENT LIGHT', 'the mark on dark surfaces'],
    ['#D9A441', 'SIGNAL AMBER', 'the core — an observation point'],
    ['#0B1220', 'PRODUCT INK', 'the mark on paper'],
    ['#2563EB', 'BRAND BLUE', 'the core on paper'],
  ];
  tokens.forEach(([hex, name, note], i) => {
    const y = 636 + i * 52;
    parts.push(`<rect x="${cx}" y="${y}" width="48" height="28" fill="${hex}" stroke="#F2F2EE" stroke-opacity="0.16"/>`);
    parts.push(eye(hex, cx + 62, y + 19, 11, 0.14, C.light));
    parts.push(eye(name, cx + 158, y + 19, 10, 0.2, '#D5D7D5'));
    parts.push(eye(note, cx + 158, y + 36, 9, 0.14, '#6E7378'));
  });
  parts.push(rule(cx, 918, W - 64 - cx, 0.1));
  parts.push(eye('FOUR SEGMENTS · ONE OBSERVATION POINT', cx, 954, 10, 0.22, C.signal));
  parts.push(eye('NO GRADIENT · NO SHADOW · NO ROUNDED CORNER', cx, 978, 10, 0.22));
  parts.push(eye('TWO COLOUR OR ONE COLOUR · NOTHING BETWEEN', cx, 1002, 10, 0.22));

  /* ── footer ─────────────────────────────────────────────────────── */
  parts.push(rule(64, H - 84, W - 128, 0.1));
  parts.push(eye('INDEPENDENT EVIDENCE FOR EXTERNAL DEPENDENCIES', 64, H - 50, 12, 0.3, '#8B9095'));
  parts.push(eyeEnd('RELIASTRA.COM', W - 64, H - 50, 12, 0.3, C.signal));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="RELIASTRA identity sheet">
  <title>RELIASTRA — identity sheet</title>
${parts.join('\n  ')}
</svg>
`;
}

/* ─────────────────────────────────────────────────── app icons ─── */
/** Icon tile: void field, mark inset with optical margin. Sharp corners. */
function iconSvg({ size = 512, bg = C.void, bar = C.light, core = C.signal, inset = 0.155, ring = null } = {}) {
  const margin = size * inset;
  const scale = (size - margin * 2) / U;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="RELIASTRA">
  <title>RELIASTRA</title>
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <g transform="translate(${n(margin)} ${n(margin)}) scale(${n(scale)})">
    <g stroke="${bar}" stroke-width="${BAR}" fill="none">
${segments().map((s) => `      <path d="${s}"/>`).join('\n')}
    </g>
    ${ring ? `<path d="${corePath()}" fill="none" stroke="${ring}" stroke-width="7"/>` : ''}
    <path d="${corePath()}" fill="${core}"/>
  </g>
</svg>
`;
}

/* ─────────────────────────────────────────────────────── raster ─── */
const pngCache = new Map();

function png(svg, width) {
  const key = `${width}:${svg}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const buf = Buffer.from(r.render().asPng());
  pngCache.set(key, buf);
  return buf;
}

function write(rel, data) {
  const abs = path.join(HERE, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  const kb = (Buffer.byteLength(data) / 1024).toFixed(1);
  console.log(`  ${rel.padEnd(42)} ${kb.padStart(8)} KB`);
}

/* ═════════════════════════════════════════════════════════ emit ═══════ */

console.log('mark + masters');
const _sheetPlaceholder = null; // brand sheet is emitted after the lockups below
const MARK_SVG = markSvg({ bar: C.light, core: C.signal });
const MARK_INK_SVG = markSvg({ bar: C.ink, core: C.brand });
const MARK_MONO_SVG = markSvg({ bar: C.light, core: C.light });
write('mark.svg', MARK_SVG);
write('mark-ink.svg', MARK_INK_SVG);
write('mark-mono.svg', MARK_MONO_SVG);
write('construction.svg', constructionSvg({}));
write('parts.svg', partsSvg({}));

const LOCK_SVG = lockupHorizontal({});
const LOCK_INK_SVG = lockupHorizontal({ bar: C.ink, core: C.brand, text: C.ink });
const LOCK_MONO_SVG = lockupHorizontal({ text: C.light, core: C.light });
const LOCK_STACK_SVG = lockupStacked({});
write('lockup-horizontal.svg', LOCK_SVG);
write('lockup-horizontal-ink.svg', LOCK_INK_SVG);
write('lockup-horizontal-mono.svg', LOCK_MONO_SVG);
write('lockup-stacked.svg', LOCK_STACK_SVG);

const SHEET_SVG = brandSheet({});
write('brand-sheet.svg', SHEET_SVG);
write('brand-sheet-1600.png', png(SHEET_SVG, 1600));
write('brand-sheet-3200.png', png(SHEET_SVG, 3200));

console.log('application icons');
/* Favicons and app icons carry the mark inside a void tile: a light mark on a
   transparent field would vanish in a light browser chrome, and the void tile
   is the identity anyway. */
const ICON_MASTER = iconSvg({ size: 1024, inset: 0.17 });
write('app-icon.svg', iconSvg({ size: 512, inset: 0.17 }));
write('app-icon-1024.png', png(ICON_MASTER, 1024));
write('app-icon-512.png', png(ICON_MASTER, 512));
write('app-icon-192.png', png(ICON_MASTER, 192));
write('apple-touch-icon-180.png', png(iconSvg({ size: 1024, inset: 0.13 }), 180));
write('favicon-32.png', png(ICON_MASTER, 32));
write('favicon-16.png', png(iconSvg({ size: 1024, inset: 0.1, core: C.signal, bar: C.light }), 16));
write('mark-1024.png', png(markSvg({ bar: C.light, core: C.signal, box: 1024, margin: 54 }), 1024));
write('lockup-horizontal-1600.png', png(LOCK_SVG, 1600));

/* Avatar: the square used by email and by accounts that only accept a photo.
   Slightly larger inset than an app icon because mail clients crop. */
console.log('avatar');
const AVATAR_SVG = iconSvg({ size: 512, inset: 0.185 });
write('avatar-512.png', png(AVATAR_SVG, 512));
write('avatar.svg', AVATAR_SVG);

/* ─────────────────────────────────────── frontend/public delivery ─── */
/**
 * The site consumes a stable set of paths. Their names are a public contract
 * (structured data, metadata, mail), so this script writes them rather than
 * asking anyone to copy files by hand.
 */
const PUBLIC = path.resolve(HERE, '../../frontend/public');
if (fs.existsSync(PUBLIC)) {
  console.log('frontend/public');
  const pub = (rel, data) => {
    const abs = path.join(PUBLIC, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
    console.log(`  frontend/public/${rel}`);
  };
  /* /logo.svg stays the icon at the same path the metadata already declares. */
  pub('logo.svg', iconSvg({ size: 32, inset: 0.17 }));
  pub('logo-mark.svg', MARK_SVG);
  pub('logo-mark-ink.svg', MARK_INK_SVG);
  pub('logo-lockup.svg', LOCK_SVG);
  pub('logo-lockup-ink.svg', LOCK_INK_SVG);
  pub('logo-lockup-stacked.svg', LOCK_STACK_SVG);
  pub('icon-192.png', png(ICON_MASTER, 192));
  pub('icon-512.png', png(ICON_MASTER, 512));
  pub('apple-touch-icon.png', png(iconSvg({ size: 1024, inset: 0.13 }), 180));
  pub('social/reliastra-email-avatar.svg', AVATAR_SVG);
  pub('social/reliastra-email-avatar.png', png(AVATAR_SVG, 512));
}

/* ─────────────────────────────────────────────────────── preview ─── */
/**
 * The preview is generated so the arguments for the mark are reviewable next
 * to the artwork itself. It is served as a static directory - see README.md.
 */
console.log('preview');
const PREVIEW = path.join(HERE, 'preview');
const previewAssets = {
  'mark.svg': MARK_SVG,
  'mark-ink.svg': MARK_INK_SVG,
  'mark-mono.svg': MARK_MONO_SVG,
  'lockup-horizontal.svg': LOCK_SVG,
  'lockup-horizontal-ink.svg': LOCK_INK_SVG,
  'lockup-stacked.svg': LOCK_STACK_SVG,
  'app-icon.svg': iconSvg({ size: 512, inset: 0.17 }),
  'construction.svg': constructionSvg({}),
  'parts.svg': partsSvg({}),
};
for (const [f, data] of Object.entries(previewAssets)) write(path.join('preview/assets', f), data);
for (const [f, buf] of Object.entries({
  'icon-512.png': png(ICON_MASTER, 512),
  'icon-192.png': png(ICON_MASTER, 192),
  'favicon-32.png': png(ICON_MASTER, 32),
  'favicon-16.png': png(iconSvg({ size: 1024, inset: 0.1 }), 16),
  'avatar-512.png': png(AVATAR_SVG, 512),
  'lockup-1600.png': png(LOCK_SVG, 1600),
  'mark-mono-512.png': png(markSvg({ bar: C.light, core: C.light, box: 512, margin: 20 }), 512),
})) write(path.join('preview/assets', f), buf);

console.log('done');
