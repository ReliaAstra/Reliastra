/**
 * Element-level QA capture: screenshot named regions of a route at real
 * viewport scale, which is the only way to judge type, density and alignment
 * (a full-page PNG of a long record scales the type into illegibility).
 *
 * Usage: node scripts/qa-crop.mjs <outDir> <route> <selector[,selector]> [--w 1440]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , outDir = '.qa', route = '/', selArg = 'body'] = process.argv;
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:3000';
const width = Number(flag('w', 1440));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
         '--disable-software-rasterizer', '--in-process-gpu'],
});
const ctx = await browser.newContext({
  viewport: { width, height: width < 700 ? 900 : 1000 },
  deviceScaleFactor: 1, colorScheme: 'dark',
});
// A signed-in console session, same contract as qa-shot --auth.
if (argv.includes('--auth')) {
  await ctx.addInitScript(() => {
    localStorage.setItem('reliastra_refresh_token', 'qa-refresh-token');
  });
}
const page = await ctx.newPage();
await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

for (const sel of selArg.split(',')) {
  const el = page.locator(sel).first();
  const name = sel.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
  try {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await el.screenshot({ path: path.join(outDir, `${name}-${width}.png`) });
    console.log(`ok ${sel}`);
  } catch (e) {
    console.log(`FAIL ${sel}: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
