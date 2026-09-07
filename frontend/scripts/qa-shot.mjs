/**
 * Rendered-UI QA harness.
 *
 * Section 29 of the Phase 2 brief is explicit: judge the rendered result, not
 * the source. This drives a real Chromium over a list of routes at a list of
 * viewports, writes PNGs, and reports what it found in the DOM while it was
 * there (console errors, failed requests, horizontal overflow).
 *
 * Usage:
 *   node scripts/qa-shot.mjs <outDir> <route>[,<route>...] [--w 375,1440]
 *                            [--auth] [--full]
 *
 * The chromium binary is resolved from CHROME_PATH so CI can point at a
 * normal `playwright install` while this sandbox uses an npm-sourced build.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , outDir = '.qa', routeArg = '/'] = process.argv;
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:3000';
const routes = routeArg.split(',').filter(Boolean);
const widths = String(flag('w', '1440')).split(',').map(Number);
const fullPage = has('full');

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
         '--disable-software-rasterizer', '--in-process-gpu'],
});

const findings = [];

for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: width < 700 ? 900 : 1000 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });

  // A signed-in console session: the store reads the refresh token from
  // localStorage on boot, exactly as a real returning user does.
  if (has('auth')) {
    await context.addInitScript(() => {
      localStorage.setItem('reliastra_refresh_token', 'qa-refresh-token');
    });
  }

  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push(`REQFAIL ${r.url()}`));

  for (const route of routes) {
    errors.length = 0;
    const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?=&]/g, '_');
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45_000 });
    } catch {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }
    // Let entrance transitions settle so a screenshot is not a half-faded frame.
    await page.waitForTimeout(900);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 2) findings.push(`${route} @${width}: horizontal overflow ${overflow}px`);
    for (const e of errors.slice(0, 4)) findings.push(`${route} @${width}: ${e.slice(0, 160)}`);

    await page.screenshot({
      path: path.join(outDir, `${slug}-${width}.png`),
      fullPage,
    });
    process.stdout.write(`shot ${slug}-${width}.png\n`);
  }
  await context.close();
}

await browser.close();
console.log(findings.length ? `\nFINDINGS:\n${findings.join('\n')}` : '\nNo findings.');
