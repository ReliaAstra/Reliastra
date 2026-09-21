import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The email avatar still uses the supplied silver wordmark interpretation.
// The social square uses the public site's actual identity: a restrained
// typographic lockup, an obsidian field, hairline instrumentation, and one
// amber signal. The composition is deliberately asymmetrical so it reads like
// an infrastructure system rather than a centred marketing poster.
//
// The site-wide share image (src/app/opengraph-image.png, 1584x396) is NOT
// generated here anymore. Its source of truth is design/linkedin-banner/
// (banner.svg + generate.cjs, THEME=light). To update it, run
// `THEME=light node design/linkedin-banner/generate.cjs` and copy
// banner-1584x396.png over src/app/opengraph-image.png and banner.svg over
// public/social/reliastra-og.svg.
const glyphs = {
  R: '<path d="M0 0H76Q100 0 100 22Q100 44 76 44H63L100 70H76L29 32H74Q85 32 85 22Q85 12 74 12H12Z"/>',
  E: '<path d="M0 0H100V13H0ZM0 28H100V41H0ZM0 57H100V70H0Z"/>',
  L: '<path d="M0 0H15V57H85V70H14Q0 70 0 56Z"/>',
  I: '<path d="M0 0H15V70H0Z"/>',
  A: '<path d="M0 70L47 3Q50 -2 54 3L101 70H84L51 23L17 70Z"/>',
  S: '<path d="M100 0H23Q0 0 0 21Q0 42 23 42H77Q87 42 87 50Q87 57 77 57H3V70H77Q101 70 101 49Q101 29 78 29H24Q14 29 14 21Q14 13 24 13H100Z"/>',
  T: '<path d="M0 0H100V13H57V70H43V13H0Z"/>',
};
const widths = { R: 100, E: 100, L: 85, I: 15, A: 101, S: 101, T: 100 };
const wordmarkHeight = 70;
let offset = 0;
const wordmark = [...'RELIASTRA'].map((letter) => {
  const svg = `<g transform="translate(${offset} 0)">${glyphs[letter]}</g>`;
  offset += widths[letter] + 27;
  return svg;
}).join('');
const wordmarkWidth = offset - 27;

function avatarSvg(size) {
  const canvas = 512;
  const safeRadius = 224;
  const logoWidth = (2 * safeRadius) / Math.sqrt(1 + (wordmarkHeight / wordmarkWidth) ** 2);
  const scale = logoWidth / wordmarkWidth;
  const logoHeight = wordmarkHeight * scale;
  const x = (canvas - logoWidth) / 2;
  const y = (canvas - logoHeight) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${canvas} ${canvas}">
  <title>RELIASTRA</title>
  <defs>
    <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".5" stop-color="#e6e8ec"/><stop offset="1" stop-color="#b4bac4"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="#2563EB"/>
  <g transform="translate(${x} ${y}) scale(${scale})"><g fill="url(#silver)">${wordmark}</g></g>
</svg>`;
}

const C = {
  void: '#08090A',
  field: '#0D1012',
  raised: '#111518',
  text: '#F2F2EE',
  text2: '#C6CCCA',
  text3: '#8A9497',
  text4: '#596467',
  line: '#293236',
  lineSoft: '#1A2225',
  signal: '#D9A441',
  healthy: '#72B68A',
};
const FONT = 'DejaVu Sans, Arial, Helvetica, sans-serif';
const MONO = 'DejaVu Sans Mono, Consolas, monospace';

function brandLockup(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <text x="0" y="0" font-family="${FONT}" font-size="16" font-weight="700" letter-spacing="3.4" fill="${C.text}">RELIASTRA</text>
    <rect x="131" y="-11" width="8" height="8" fill="${C.signal}"/>
  </g>`;
}

function gridField({ x, y, width, height }) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#grid)" opacity=".72"/>`;
}

function dependencyPanel({ x, y, width, height, compact = false }) {
  const pad = compact ? 22 : 24;
  const headH = compact ? 44 : 48;
  const innerX = x + pad;
  const innerRight = x + width - pad;
  const graphY = y + headH + (compact ? 46 : 56);
  const rootW = width * (compact ? 0.34 : 0.36);
  const childX = x + width * (compact ? 0.55 : 0.56);
  const childW = width - (childX - x) - pad;
  const boxH = compact ? 46 : 50;
  const rootY = graphY;
  const rootMid = rootY + boxH / 2;
  const childY1 = graphY - (compact ? 10 : 8);
  const childY2 = graphY + (compact ? 66 : 70);
  const childMid1 = childY1 + boxH / 2;
  const childMid2 = childY2 + boxH / 2;
  const chartRuleY = y + height - (compact ? 88 : 108);
  const chartTop = chartRuleY + 38;
  const chartBottom = y + height - (compact ? 42 : 50);
  const chartWidth = innerRight - innerX;
  const titleSize = compact ? 10 : 11;
  const bodySize = compact ? 10 : 11;

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${C.field}" stroke="${C.line}"/>
    <line x1="${x}" y1="${y + headH}" x2="${x + width}" y2="${y + headH}" stroke="${C.line}"/>
    <text x="${innerX}" y="${y + (compact ? 28 : 30)}" font-family="${MONO}" font-size="${titleSize}" letter-spacing="1.6" fill="${C.text3}">DEPENDENCY SURFACE</text>
    <text x="${innerRight}" y="${y + (compact ? 28 : 30)}" text-anchor="end" font-family="${MONO}" font-size="${titleSize}" letter-spacing="1.2" fill="${C.signal}">LIVE / 001</text>

    <text x="${innerX}" y="${graphY - 18}" font-family="${MONO}" font-size="${compact ? 9 : 10}" letter-spacing="1.2" fill="${C.text4}">YOUR SYSTEM</text>
    <rect x="${innerX}" y="${rootY}" width="${rootW}" height="${boxH}" fill="${C.raised}" stroke="${C.text4}"/>
    <circle cx="${innerX + 15}" cy="${rootMid}" r="4" fill="${C.signal}"/>
    <text x="${innerX + 27}" y="${rootMid + 4}" font-family="${FONT}" font-size="${bodySize}" font-weight="600" fill="${C.text}">PRODUCT</text>

    <path d="M${innerX + rootW} ${rootMid}H${childX - 26}M${childX - 26} ${childMid1}V${childMid2}M${childX - 26} ${childMid1}H${childX}M${childX - 26} ${childMid2}H${childX}" fill="none" stroke="${C.line}"/>
    <path d="M${childX - 5} ${childMid1 - 3}l5 3-5 3M${childX - 5} ${childMid2 - 3}l5 3-5 3" fill="none" stroke="${C.text4}"/>

    <rect x="${childX}" y="${childY1}" width="${childW}" height="${boxH}" fill="${C.raised}" stroke="${C.line}"/>
    <circle cx="${childX + 14}" cy="${childMid1}" r="3" fill="${C.healthy}"/>
    <text x="${childX + 25}" y="${childMid1 - 2}" font-family="${MONO}" font-size="${bodySize}" fill="${C.text}">payments.api</text>
    <text x="${childX + 25}" y="${childMid1 + 13}" font-family="${MONO}" font-size="${compact ? 8 : 9}" letter-spacing=".8" fill="${C.text4}">RESPONDING</text>

    <rect x="${childX}" y="${childY2}" width="${childW}" height="${boxH}" fill="${C.raised}" stroke="${C.line}"/>
    <circle cx="${childX + 14}" cy="${childMid2}" r="3" fill="${C.signal}"/>
    <text x="${childX + 25}" y="${childMid2 - 2}" font-family="${MONO}" font-size="${bodySize}" fill="${C.text}">identity.api</text>
    <text x="${childX + 25}" y="${childMid2 + 13}" font-family="${MONO}" font-size="${compact ? 8 : 9}" letter-spacing=".8" fill="${C.signal}">OBSERVING</text>

    <line x1="${innerX}" y1="${chartRuleY}" x2="${innerRight}" y2="${chartRuleY}" stroke="${C.line}"/>
    <text x="${innerX}" y="${chartRuleY + 20}" font-family="${MONO}" font-size="${compact ? 8 : 9}" letter-spacing="1" fill="${C.text4}">OBSERVATION WINDOW</text>
    <text x="${innerRight}" y="${chartRuleY + 20}" text-anchor="end" font-family="${MONO}" font-size="${compact ? 9 : 10}" fill="${C.text2}">00:08:14</text>
    <path d="M${innerX} ${chartBottom - 6}L${innerX + chartWidth * .11} ${chartBottom - 5}L${innerX + chartWidth * .2} ${chartBottom - 10}L${innerX + chartWidth * .31} ${chartBottom - 8}L${innerX + chartWidth * .42} ${chartBottom - 13}L${innerX + chartWidth * .52} ${chartBottom - 9}L${innerX + chartWidth * .62} ${chartBottom - 17}L${innerX + chartWidth * .73} ${chartBottom - 13}L${innerX + chartWidth * .84} ${chartBottom - 22}L${innerRight} ${chartBottom - 21}" fill="none" stroke="${C.text2}" stroke-width="1.5"/>
    <line x1="${innerX + chartWidth * .73}" y1="${chartTop}" x2="${innerX + chartWidth * .73}" y2="${chartBottom}" stroke="${C.signal}" stroke-dasharray="2 4"/>
    <circle cx="${innerX + chartWidth * .73}" cy="${chartBottom - 13}" r="3" fill="${C.signal}"/>
  </g>`;
}

function artwork(square) {
  const width = square ? 1080 : 1200;
  const height = square ? 1080 : 630;
  const margin = square ? 64 : 64;
  const bottom = height - (square ? 62 : 42);
  const titleSize = square ? 64 : 58;
  const eyebrowY = square ? 161 : 157;
  const headlineY = square ? 225 : 222;
  const lineStep = square ? 64 : 61;
  const subY = square ? 410 : 425;
  const panel = square
    ? { x: 64, y: 548, width: 952, height: 314 }
    : { x: 738, y: 142, width: 398, height: 368 };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>RELIASTRA — Infrastructure you can prove</title>
  <desc>RELIASTRA independently observes the external services software depends on, correlates failures, and produces verifiable evidence.</desc>
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#273034" stroke-width="1" opacity=".34"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="${C.void}"/>
  ${gridField({ x: square ? 42 : 708, y: 42, width: square ? 996 : 444, height: height - 84 })}
  <text x="${width - margin}" y="${height - 45}" text-anchor="end" font-family="${MONO}" font-size="${square ? 128 : 150}" letter-spacing="-10" fill="#0F1518" opacity=".95">01</text>
  <line x1="${margin}" y1="42" x2="${width - margin}" y2="42" stroke="${C.lineSoft}"/>
  <line x1="${margin}" y1="${bottom}" x2="${width - margin}" y2="${bottom}" stroke="${C.lineSoft}"/>
  ${brandLockup(margin, square ? 78 : 74)}
  <text x="${width - margin}" y="${square ? 78 : 74}" text-anchor="end" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">OBSERVATION SYSTEM / 01—03</text>

  <g>
    <path d="M${margin - 16} ${eyebrowY - 12}h8M${margin - 16} ${eyebrowY + 20}h8M${margin - 16} ${eyebrowY + 52}h8M${margin - 16} ${eyebrowY + 84}h8" stroke="${C.line}"/>
    <text x="${margin}" y="${eyebrowY}" font-family="${MONO}" font-size="11" letter-spacing="2.1" fill="${C.signal}">EXTERNAL DEPENDENCY INTELLIGENCE</text>
    <text x="${margin}" y="${headlineY}" font-family="${FONT}" font-size="${titleSize}" font-weight="600" letter-spacing="-2.8" fill="${C.text}">INFRASTRUCTURE</text>
    <text x="${margin}" y="${headlineY + lineStep}" font-family="${FONT}" font-size="${titleSize}" font-weight="600" letter-spacing="-2.8" fill="${C.text}">YOU CAN</text>
    <text x="${margin}" y="${headlineY + lineStep * 2}" font-family="${FONT}" font-size="${titleSize}" font-weight="600" letter-spacing="-2.8" fill="${C.text}">PROVE.</text>
    <text x="${margin}" y="${subY}" font-family="${FONT}" font-size="${square ? 17 : 16}" letter-spacing="-.25" fill="${C.text2}">Independent observation for the services your</text>
    <text x="${margin}" y="${subY + (square ? 26 : 24)}" font-family="${FONT}" font-size="${square ? 17 : 16}" letter-spacing="-.25" fill="${C.text2}">software depends on.</text>
  </g>

${!square ? `  <line x1="684" y1="118" x2="684" y2="${bottom}" stroke="${C.lineSoft}"/>\n` : ''}  ${dependencyPanel({ ...panel, compact: square })}

  ${square ? `<g>
    <line x1="${margin}" y1="${square ? 485 : 0}" x2="${width - margin}" y2="${square ? 485 : 0}" stroke="${C.lineSoft}"/>
    <text x="${margin}" y="932" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">OBSERVE</text>
    <text x="${margin + 155}" y="932" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">ATTRIBUTE</text>
    <text x="${margin + 335}" y="932" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">EVIDENCE</text>
    <rect x="${margin + 92}" y="923" width="6" height="6" fill="${C.signal}"/>
    <rect x="${margin + 287}" y="923" width="6" height="6" fill="${C.signal}"/>
    <text x="${margin}" y="1012" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${C.text3}">reliastra.com</text>
  </g>` : `<g>
    <line x1="${margin}" y1="493" x2="616" y2="493" stroke="${C.line}"/>
    <text x="${margin}" y="532" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">OBSERVE</text>
    <text x="${margin + 145}" y="532" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">ATTRIBUTE</text>
    <text x="${margin + 322}" y="532" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${C.text4}">EVIDENCE</text>
    <rect x="${margin + 82}" y="523" width="6" height="6" fill="${C.signal}"/>
    <rect x="${margin + 259}" y="523" width="6" height="6" fill="${C.signal}"/>
    <text x="${margin}" y="588" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${C.text3}">reliastra.com</text>
  </g>`}
</svg>`;
}

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}public/social`, { recursive: true });
const only = process.argv.slice(2);
const wanted = (name) => only.length === 0 || only.includes(name);

if (wanted('reliastra-social-square')) {
  const svg = artwork(true);
  await writeFile(`${root}public/social/reliastra-social-square.svg`, svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(`${root}public/social/reliastra-social-square.png`, png);
  console.log(`public/social/reliastra-social-square.png: ${(png.length / 1024).toFixed(0)} KB`);
}

if (wanted('reliastra-email-avatar')) {
  await writeFile(`${root}public/social/reliastra-email-avatar.svg`, avatarSvg(512));
  const png = await sharp(Buffer.from(avatarSvg(2048))).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer();
  await writeFile(`${root}public/social/reliastra-email-avatar.png`, png);
  console.log(`public/social/reliastra-email-avatar.png: ${(png.length / 1024).toFixed(0)} KB`);
}
