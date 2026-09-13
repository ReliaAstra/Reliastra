#!/usr/bin/env node
/**
 * Generate the Open Graph card for a research paper.
 *
 * Why this exists: the site-wide `/opengraph-image.png` is a brand card. A
 * research paper shared on its own should carry its own title, its own byline
 * and its own finding, because that is what a reader decides to click on - and
 * what an LLM's link preview quotes.
 *
 * The card is NOT hand-lettered from a copy of the record. The script resolves
 * the slug against the live sitemap, fetches the rendered paper, and reads the
 * title, category, reading time and byline out of the page's own `TechArticle`
 * JSON-LD. If the record changes, the card changes with it; if the page cannot
 * be reached, the script fails rather than emitting a card from stale copy.
 *
 * What IS authored here is the card's design content: the seven-stage band and
 * the one-line thesis. The band mirrors Table 1 of the paper
 * (`src/content/research/aws-iam-policy-evaluation-order.tsx`). If AWS changes
 * the documented order, the paper, its figures and this band all change
 * together - there is no mechanism that could update one and not the others.
 *
 * Usage (from `frontend/`, with the site running):
 *
 *   npm run dev
 *   node scripts/generate-paper-og-image.mjs
 *   node scripts/generate-paper-og-image.mjs --slug <slug> --origin http://127.0.0.1:3000
 *
 * Outputs, both committed (production serves them without runtime rendering):
 *   public/social/research/<slug>-og.svg   editable vector source
 *   public/social/research/<slug>-og.png   1200x630 raster
 *
 * Requires `sharp` (a dependency) and DejaVu Sans + DejaVu Sans Mono on the
 * machine, the same requirement `generate-social-images.mjs` documents.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_SLUG = 'aws-iam-policy-evaluation-order';

function option(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SLUG = option('--slug', DEFAULT_SLUG);
const ORIGIN = option('--origin', 'http://127.0.0.1:3000').replace(/\/$/, '');
const root = fileURLToPath(new URL('../', import.meta.url));

/* ── Palette ─────────────────────────────────────────────────────────────
 * Copied from the observatory tokens in src/app/globals.css. Social artwork
 * hardcodes its colours because an SVG rendered by sharp has no stylesheet to
 * resolve custom properties against; if a token changes here it must change
 * there too. One accent only (--ob-signal), as on the public site.
 */
const C = {
  void: '#08090A',
  text: '#F2F2EE',
  text2: '#D6D8D5',
  text3: '#94999D',
  text4: '#666B70',
  line: 'rgba(242, 242, 238, 0.09)',
  line2: 'rgba(242, 242, 238, 0.16)',
  line3: 'rgba(242, 242, 238, 0.28)',
  signal: '#D9A441',
  signalWash: 'rgba(217, 164, 65, 0.10)',
};
const MONO = 'DejaVu Sans Mono, monospace';
const SANS = 'DejaVu Sans, sans-serif';

/* ── Card content ────────────────────────────────────────────────────────
 * The stage band is the paper's Table 1 reduced to a strip: stage number, the
 * class, and the algebraic role that class plays. Role is printed in every
 * cell, so nothing is conveyed by colour alone - the same rule the paper's
 * figures follow. Treatments differ by role: filled accent = short-circuit,
 * accent outline = grant, neutral outline = cap.
 */
const CARDS = {
  'aws-iam-policy-evaluation-order': {
    thesis: [
      'Seven classes, one procedure: one short-circuit, four ceilings, two grants -',
      'and no pre-deployment route that covers all seven.',
    ],
    relations:
      'SAME-ACCOUNT: UNION · CROSS-ACCOUNT: CONJUNCTION · EXPLICIT DENY: SHORT-CIRCUIT',
    stages: [
      { n: '1', name: 'DENY', role: 'short-circuit', tone: 'short' },
      { n: '2', name: 'RCP', role: 'cap', tone: 'cap' },
      { n: '3', name: 'SCP', role: 'cap', tone: 'cap' },
      { n: '4', name: 'RESOURCE', role: 'grant', tone: 'grant' },
      { n: '5', name: 'IDENTITY', role: 'grant', tone: 'grant' },
      { n: '6', name: 'BOUNDARY', role: 'cap', tone: 'cap' },
      { n: '7', name: 'SESSION', role: 'cap', tone: 'cap' },
    ],
  },
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Split "Title: subtitle" into two card lines, keeping the colon off the end. */
function titleLines(headline) {
  const i = headline.indexOf(':');
  if (i === -1) return [headline, ''];
  return [headline.slice(0, i).trim(), headline.slice(i + 1).trim()];
}

function card({ headline, section, minutes, authorName, authorRole }) {
  const W = 1200;
  const H = 630;
  const M = 64; // left/right margin
  const inner = W - M * 2;
  const card = CARDS[SLUG];
  if (!card) {
    throw new Error(
      `generate-paper-og-image: no card content for slug "${SLUG}".\n` +
        `  Add a thesis line and a stage band to CARDS in this script, or run it\n` +
        `  for a slug that already has one. The paper's own figures are the source\n` +
        `  for what belongs on the band.`
    );
  }
  const [t1, t2] = titleLines(headline);

  /* Faint graph paper, 60px, at half the line token's opacity: present enough
   * to read as an instrument panel, quiet enough not to compete with type. */
  const grid = [];
  for (let x = M; x <= W - M; x += 60) {
    grid.push(`<path d="M${x} 0V${H}" stroke="${C.line}" stroke-opacity=".45"/>`);
  }
  for (let y = 60; y < H; y += 60) {
    grid.push(`<path d="M0 ${y}H${W}" stroke="${C.line}" stroke-opacity=".45"/>`);
  }

  const gap = 10;
  const cw = (inner - gap * (card.stages.length - 1)) / card.stages.length;
  const bandY = 344;
  const bandH = 108;
  const tone = {
    short: { stroke: C.signal, fill: C.signalWash, text: C.signal },
    grant: { stroke: C.signal, fill: 'none', text: C.signal },
    cap: { stroke: C.line3, fill: 'none', text: C.text3 },
  };
  const cells = card.stages
    .map((s, i) => {
      const x = M + i * (cw + gap);
      const t = tone[s.tone];
      return `  <g>
    <rect x="${x.toFixed(2)}" y="${bandY}" width="${cw.toFixed(2)}" height="${bandH}" fill="${t.fill}" stroke="${t.stroke}"/>
    <text x="${(x + cw / 2).toFixed(2)}" y="${bandY + 30}" font-family="${MONO}" font-size="12" letter-spacing="1.6" text-anchor="middle" fill="${C.text4}">STAGE ${s.n}</text>
    <text x="${(x + cw / 2).toFixed(2)}" y="${bandY + 62}" font-family="${MONO}" font-size="15" text-anchor="middle" fill="${t.text}">${esc(s.name)}</text>
    <text x="${(x + cw / 2).toFixed(2)}" y="${bandY + 88}" font-family="${MONO}" font-size="11" letter-spacing=".4" text-anchor="middle" fill="${C.text4}">${esc(s.role)}</text>
  </g>`;
    })
    .join('\n');

  const byline = authorRole ? `${authorName} · ${authorRole}` : authorName;

  // Drawn at 2x (width/height doubled, viewBox unchanged) and downscaled after
  // rasterisation, so hairline strokes and 11px mono type land between pixels
  // and are resampled rather than snapped.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}">
  <title>${esc(headline)}</title>
  <desc>RELIASTRA Research card for ${esc(headline)}, by ${esc(byline)}. ${esc(card.thesis.join(' '))} The strip shows the seven stages of the documented single-account procedure and the algebraic role of each.</desc>
  <rect width="${W}" height="${H}" fill="${C.void}"/>
  <g>${grid.join('')}</g>

  <text x="${M}" y="58" font-family="${MONO}" font-size="13" letter-spacing="3.2" fill="${C.text4}">RELIASTRA RESEARCH</text>
  <text x="${W - M}" y="58" font-family="${MONO}" font-size="13" letter-spacing="2.4" text-anchor="end" fill="${C.text4}">${esc(section.toUpperCase())} · ${minutes} MIN READ · SOURCED ANALYSIS</text>
  <path d="M${M} 80H${W - M}" stroke="${C.line2}"/>

  <text x="${M}" y="164" font-family="${SANS}" font-weight="bold" font-size="46" letter-spacing="-1.1" fill="${C.text}">${esc(t1)}</text>
  <text x="${M}" y="220" font-family="${SANS}" font-weight="bold" font-size="46" letter-spacing="-1.1" fill="${C.text2}">${esc(t2)}</text>

  <text x="${M}" y="278" font-family="${SANS}" font-size="21" fill="${C.text3}">${esc(card.thesis[0])}</text>
  <text x="${M}" y="308" font-family="${SANS}" font-size="21" fill="${C.text3}">${esc(card.thesis[1])}</text>

${cells}

  <text x="${M}" y="500" font-family="${MONO}" font-size="13" letter-spacing="1.6" fill="${C.text4}">${esc(card.relations)}</text>
  <path d="M${M} 536H${W - M}" stroke="${C.line2}"/>
  <rect x="${M}" y="566" width="8" height="8" fill="${C.signal}"/>
  <text x="${M + 22}" y="575" font-family="${MONO}" font-size="15" fill="${C.text2}">${esc(byline)}</text>
  <text x="${W - M}" y="575" font-family="${MONO}" font-size="15" letter-spacing="2" text-anchor="end" fill="${C.text3}">reliastra.com</text>
</svg>
`;
}

/* ── Resolve the slug against the live sitemap, then read the page ──────── */
async function paperUrl() {
  const res = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap returned HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const hit = urls.find((u) => u.endsWith(`/${SLUG}`));
  if (!hit) {
    throw new Error(
      `generate-paper-og-image: "${SLUG}" is not in ${ORIGIN}/sitemap.xml.\n` +
        `  Is the paper declared in src/lib/routes.ts, and is the site built or\n` +
        `  running at ${ORIGIN}?`
    );
  }
  // Sitemap URLs are absolute and point at production. Keep the path, fetch it
  // from the origin we were given, so a card is always generated from the code
  // in this working tree rather than from whatever is deployed.
  return `${ORIGIN}${new URL(hit).pathname}`;
}

async function techArticle(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const html = await res.text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, body] of blocks) {
    let node;
    try {
      node = JSON.parse(body);
    } catch {
      continue; // the page carries more than one JSON-LD block
    }
    const list = Array.isArray(node) ? node : [node];
    const article = list.find((n) => n && n['@type'] === 'TechArticle');
    if (article) return article;
  }
  throw new Error(`no TechArticle JSON-LD found at ${url}`);
}

const url = await paperUrl();
const article = await techArticle(url);
const minutes = /^PT(\d+)M$/.exec(article.timeRequired ?? '')?.[1] ?? '?';
const author = article.author ?? {};
const fields = {
  headline: article.headline,
  section: article.articleSection ?? 'Research',
  minutes,
  authorName: author.name ?? 'RELIASTRA Research',
  authorRole: author.jobTitle ?? '',
};

console.log(`generate-paper-og-image: ${url}`);
for (const [k, v] of Object.entries(fields)) console.log(`  ${k.padEnd(11)} ${v}`);

const svg = card(fields);
await mkdir(`${root}public/social/research`, { recursive: true });
await writeFile(`${root}public/social/research/${SLUG}-og.svg`, svg);

const png = await sharp(Buffer.from(svg))
  .resize(1200, 630, { kernel: 'lanczos3' })
  .png()
  .toBuffer();
const target = `public/social/research/${SLUG}-og.png`;
await writeFile(`${root}${target}`, png);

const meta = await sharp(png).metadata();
console.log(`\n  ✓ ${target}  ${meta.width}×${meta.height}  ${(png.length / 1024).toFixed(0)} KB`);
console.log(`  ✓ public/social/research/${SLUG}-og.svg  (vector source)`);
console.log(`\nThe page must reference it at /social/research/${SLUG}-og.png`);
