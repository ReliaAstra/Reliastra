import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Vector interpretation of the supplied silver wordmark reference, not an
// extraction of the original logo. Replace these paths when source art is available.
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
let offset = 0;
const wordmark = [...'RELIASTRA'].map((letter) => {
  const svg = `<g transform="translate(${offset} 0)">${glyphs[letter]}</g>`;
  offset += widths[letter] + 27;
  return svg;
}).join('');
const wordmarkWidth = offset - 27;

function artwork(square) {
  const width = square ? 1080 : 1200;
  const height = square ? 1080 : 630;
  const margin = square ? 80 : 84;
  const logoWidth = width - margin * 2;
  const logoY = square ? 292 : 174;
  const headlineY = square ? 537 : 345;
  const fontSize = square ? 48 : 46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>RELIASTRA — External Dependency Intelligence</title>
  <desc>Silver futuristic wordmark on black. Know when your dependencies fail. Prove what happened. reliastra.com</desc>
  <defs>
    <radialGradient id="ambient"><stop stop-color="#1b253c" stop-opacity=".65"/><stop offset="1" stop-color="#020305" stop-opacity="0"/></radialGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".5" stop-color="#e6e8ec"/><stop offset="1" stop-color="#b4bac4"/></linearGradient>
    <linearGradient id="rule"><stop stop-color="#202734"/><stop offset=".5" stop-color="#667084"/><stop offset="1" stop-color="#202734"/></linearGradient>
    <filter id="glow" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="#020305"/>
  <ellipse cx="${width / 2}" cy="${logoY + 35}" rx="${width * .62}" ry="${square ? 370 : 250}" fill="url(#ambient)"/>
  <g font-family="DejaVu Sans, sans-serif" text-anchor="middle">
    <text x="${width / 2}" y="${square ? 148 : 83}" font-size="${square ? 17 : 15}" letter-spacing="4.3" fill="#a8b0bf">EXTERNAL DEPENDENCY INTELLIGENCE</text>
    <g transform="translate(${margin} ${logoY}) scale(${logoWidth / wordmarkWidth})">
      <g fill="#a5b6dc" opacity=".24" filter="url(#glow)">${wordmark}</g>
      <g fill="url(#silver)">${wordmark}</g>
    </g>
    <text x="${width / 2}" y="${headlineY}" font-size="${fontSize}" letter-spacing="-1.7" fill="#f3f4f6">Know when your dependencies fail.</text>
    <text x="${width / 2}" y="${headlineY + (square ? 75 : 63)}" font-size="${fontSize}" letter-spacing="-1.7" fill="#f3f4f6">Prove what happened.</text>
    <text x="${width / 2}" y="${square ? 721 : 470}" font-size="${square ? 21 : 18}" letter-spacing=".3" fill="#9ba5b5">Independent monitoring. Timestamped SLA evidence.</text>
    <path d="M${margin} ${height - 107}H${width - margin}" stroke="url(#rule)"/>
    <text x="${width / 2}" y="${height - 58}" font-size="18" letter-spacing="2" fill="#c8cdd6">reliastra.com</text>
  </g>
</svg>`;
}

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}public/social`, { recursive: true });
for (const square of [false, true]) {
  const name = square ? 'reliastra-social-square' : 'reliastra-og';
  const svg = artwork(square);
  await writeFile(`${root}public/social/${name}.svg`, svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const target = square ? 'public/social/reliastra-social-square.png' : 'src/app/opengraph-image.png';
  await writeFile(`${root}${target}`, png);
  console.log(`${target}: ${(png.length / 1024).toFixed(0)} KB`);
}
