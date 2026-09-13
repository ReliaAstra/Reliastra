#!/usr/bin/env node
/**
 * Export the five figures of the AWS IAM evaluation-order paper as standalone
 * SVG files, for syndication and for the artifact record.
 *
 * The figures are React components rendered to SVG on the server, styled with
 * Tailwind arbitrary values over the observatory palette. That is the right
 * design for the page and the wrong format for an image that has to travel: a
 * standalone SVG cannot resolve `stroke-[var(--ob-line-3)]`, and it does not
 * carry the site stylesheet.
 *
 * So this script does not re-draw anything. It fetches the *rendered paper*,
 * lifts each figure's SVG out of the HTML, and rewrites the closed set of
 * Tailwind class tokens into presentation attributes with literal colour values
 * read out of the site's own palette. An unknown token is a hard failure: the
 * map cannot drift silently away from the components it exports.
 *
 * Deriving from the rendered page is deliberate. A hand-copied SVG would be a
 * second source of truth for a figure that is evidence in a paper, and the two
 * would diverge the first time someone edited the component.
 *
 * Usage:
 *   cd frontend && npm run dev        # or a production build
 *   node research/aws-iam-evaluation-order/figures/export-figures.mjs [--png]
 *
 * Options:
 *   --url <u>   page to read (default http://127.0.0.1:3000/research/cloud-security/aws-iam-policy-evaluation-order)
 *   --out <d>   output directory (default: this directory)
 *   --png       also rasterise with ImageMagick `convert`, when available
 *
 * Requires Node 18+. No dependencies.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── Configuration ─────────────────────────────────────────────────────── */

const PAPER_PATH =
  '/research/cloud-security/aws-iam-policy-evaluation-order';

/** Figure order as published, mapped to output filenames. */
const FIGURES = [
  'fig-1-evaluation-pipeline',
  'fig-2-policy-algebra',
  'fig-3-tightening-fallacy',
  'fig-4-verification-gap',
  'fig-5-attribution-path',
];

/**
 * The observatory palette, copied from `frontend/src/app/globals.css`. The
 * research template has one theme - there is no light override - so one export
 * variant is correct rather than a compromise.
 */
const PALETTE = {
  '--ob-void': '#08090A',
  '--ob-base': '#0D0F10',
  '--ob-raised': '#111416',
  '--ob-elevated': '#181B1D',
  '--ob-text': '#F2F2EE',
  '--ob-text-2': '#D6D8D5',
  '--ob-text-3': '#94999D',
  '--ob-text-4': '#666B70',
  '--ob-line': 'rgba(242, 242, 238, 0.09)',
  '--ob-line-2': 'rgba(242, 242, 238, 0.16)',
  '--ob-line-3': 'rgba(242, 242, 238, 0.28)',
  '--ob-signal': '#D9A441',
  '--ob-signal-dim': '#A87F32',
  '--ob-signal-wash': 'rgba(217, 164, 65, 0.10)',
  '--ob-healthy': '#57A773',
  '--ob-healthy-wash': 'rgba(87, 163, 115, 0.12)',
  '--ob-degraded': '#D9A441',
  '--ob-degraded-wash': 'rgba(217, 164, 65, 0.12)',
  '--ob-critical': '#C8544C',
  '--ob-critical-wash': 'rgba(200, 84, 76, 0.12)',
  '--ob-unknown': '#666B70',
};

const MONO =
  '"JetBrains Mono", "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';

/* ── Arguments ─────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const ORIGIN = option('--origin', 'http://127.0.0.1:3000');
const PAGE_URL = option('--url', `${ORIGIN}${PAPER_PATH}`);
const OUT = option('--out', HERE);
const WANT_PNG = flag('--png');

/* ── Class → attribute rewriting ───────────────────────────────────────── */

/**
 * Translate one Tailwind class token into presentation attributes.
 *
 * Throws on anything unrecognised. Every token the research figures use is
 * listed here; a new token means a new component style, and an exporter that
 * guesses at it would publish a figure that does not match the paper.
 */
/**
 * Layout classes that describe how the figure sits in the page rather than how
 * it is drawn. They are dropped on export, where the SVG carries an explicit
 * width and height instead. Anything else unrecognised is still a hard failure.
 */
const LAYOUT_ONLY = new Set(['w-full', 'h-full']);

function tokenToAttrs(token) {
  let m;
  if (LAYOUT_ONLY.has(token)) return [];
  if ((m = token.match(/^stroke-\[var\((--ob-[a-z0-9-]+)\)\]$/))) {
    return [['stroke', require_(m[1], token)]];
  }
  if ((m = token.match(/^fill-\[var\((--ob-[a-z0-9-]+)\)\]$/))) {
    return [['fill', require_(m[1], token)]];
  }
  if (token === 'fill-none') return [['fill', 'none']];
  if ((m = token.match(/^text-\[([0-9.]+)px\]$/))) return [['font-size', `${m[1]}px`]];
  if (token === 'font-mono') return [['font-family', MONO]];
  if ((m = token.match(/^opacity-(\d+)$/))) return [['opacity', String(Number(m[1]) / 100)]];
  throw new Error(
    `export-figures: unknown class token "${token}".\n` +
      '  Add it to tokenToAttrs() after checking what it renders to, or the\n' +
      '  exported figure will not match the published one.'
  );
}

function require_(token, usedBy) {
  const value = PALETTE[token];
  if (!value) {
    throw new Error(`export-figures: palette token "${token}" (used by "${usedBy}") is not in PALETTE.`);
  }
  return value;
}

function rewriteClasses(svg) {
  return svg.replace(/class="([^"]*)"/g, (_all, cls) =>
    cls
      .split(/\s+/)
      .filter(Boolean)
      .flatMap(tokenToAttrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
  );
}

/** Add the namespace a standalone file needs, and the ground the page supplies. */
function makeStandalone(svg) {
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!vb) throw new Error('export-figures: figure has no viewBox');
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);

  let out = svg.replace(
    /^<svg/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`
  );
  out = out.replace(
    /(<svg[^>]*>)/,
    `$1<rect x="0" y="0" width="${w}" height="${h}" fill="${PALETTE['--ob-void']}"/>`
  );
  return { svg: out, width: w, height: h };
}

/* ── Extraction ────────────────────────────────────────────────────────── */

function extractFigures(html) {
  const figures = [];
  const re = /<figure\b[^>]*>([\s\S]*?)<\/figure>/g;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[1];
    const svgMatch = inner.match(/<svg\b[\s\S]*?<\/svg>/);
    if (!svgMatch) continue; // a figure with no SVG is not one of ours
    const label = inner.match(/Figure\s+(\d+)/);
    const caption = inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/);
    figures.push({
      n: label ? Number(label[1]) : figures.length + 1,
      svg: svgMatch[0],
      caption: caption ? caption[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '',
    });
  }
  return figures;
}

/* ── Rasterisation ─────────────────────────────────────────────────────── */

/**
 * Rasterise one SVG.
 *
 * A rasteriser is not guaranteed and is not faked: the SVG is the artifact of
 * record, and a PNG that renders text in a fallback font is a worse image than
 * no image. Preference order is resvg, then rsvg-convert, then ImageMagick
 * `convert` - which on most distributions delegates to rsvg-convert and fails
 * without it, so that case is reported as a missing delegate rather than as a
 * mysterious conversion error.
 */
function rasterise(svgPath, pngPath) {
  const candidates = [
    ['resvg', ['--dpi', '192', svgPath, pngPath]],
    ['rsvg-convert', ['--dpi-x', '192', '--dpi-y', '192', '-o', pngPath, svgPath]],
    ['convert', ['-density', '192', '-background', PALETTE['--ob-void'], svgPath, pngPath]],
  ];
  for (const [bin, args] of candidates) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (probe.error) continue;
    const res = spawnSync(bin, args, { encoding: 'utf8' });
    if (res.status === 0) return bin;
    if (bin === 'convert' && /delegate failed/.test(res.stderr || '')) {
      console.warn(
        '  ! ImageMagick is present but its SVG delegate is not - PNG skipped.\n' +
        '    Install librsvg (rsvg-convert) or resvg, then re-run with --png.'
      );
      return null;
    }
  }
  console.warn(
    '  ! No SVG rasteriser found (resvg, rsvg-convert, convert) - PNG skipped.\n' +
    '    The SVG is the artifact of record; the PNG is only needed for platforms\n' +
    '    that will not host an SVG. Install one and re-run with --png.'
  );
  return null;
}

/* ── Main ──────────────────────────────────────────────────────────────── */

const res = await fetch(PAGE_URL, { headers: { accept: 'text/html' } });
if (!res.ok) {
  console.error(`export-figures: ${PAGE_URL} returned HTTP ${res.status}.`);
  console.error('  Start the site first: cd frontend && npm run dev');
  process.exit(1);
}
const html = await res.text();
const figures = extractFigures(html);

if (figures.length !== FIGURES.length) {
  console.error(
    `export-figures: expected ${FIGURES.length} figures on the page, found ${figures.length}.\n` +
      '  The page did not render, or a figure was added or removed without\n' +
      '  updating FIGURES in this script.'
  );
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

for (const [i, fig] of figures.entries()) {
  const rewritten = rewriteClasses(fig.svg);
  const { svg, width, height } = makeStandalone(rewritten);

  if (!/<title[^>]*>[\s\S]*?<\/title>/.test(svg)) {
    console.error(`export-figures: figure ${fig.n} has no <title>; refusing to export it.`);
    process.exit(1);
  }

  const base = join(OUT, `${FIGURES[i]}.svg`);
  await writeFile(base, `<!-- ${new URL(PAGE_URL).pathname} · Figure ${fig.n} · ${width}×${height} -->\n${svg}\n`);
  console.log(`  ✓ ${FIGURES[i]}.svg  ${width}×${height}`);

  if (WANT_PNG) {
    const png = base.replace(/\.svg$/, '.png');
    const bin = rasterise(base, png);
    if (bin) console.log(`  ✓ ${FIGURES[i]}.png  (via ${bin})`);
  }
}

console.log(
  `\nExported ${figures.length} figures from ${PAGE_URL}\n` +
    'Captions are not written into the SVG: the published figure carries its\n' +
    'conclusion in a <figcaption>, and a syndicated copy must carry the same\n' +
    'sentence under the image. They are printed here for that purpose:\n'
);
for (const fig of figures) {
  console.log(`Figure ${fig.n}\n  ${fig.caption}\n`);
}
