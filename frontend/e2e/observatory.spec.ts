import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * PUBLIC INFRASTRUCTURE OBSERVATORY - rendered QA.
 *
 * The brief for this surface is unusually specific, so this suite asserts the
 * brief rather than the implementation:
 *
 *  1. The record renders at every viewport from 375 to 1920 with no horizontal
 *     overflow and no layout shift after load.
 *  2. It answers, in the browser, the questions a reader arrives with: what is
 *     observed, what state it is in, when it was last observed, from where,
 *     what happened historically, whether incidents occurred, whether evidence
 *     exists.
 *  3. The range and region switchers change the server-rendered series.
 *  4. Every internal link on both observatory pages resolves - including the
 *     whole global footer.
 *  5. Nothing is fabricated: a dependency with no observations must say so and
 *     must never print an availability figure.
 *  6. The evidence gate performs a real request and returns a real link.
 *  7. Accessibility: one h1, a main landmark, labelled figures, a keyboard
 *     operable chart, visible focus, state never conveyed by colour alone.
 *
 * The fixture backend (`scripts/qa-backend.mjs`) provides `auth0` (degraded,
 * with an incident and published evidence) and `newrelic` (registered, never
 * observed), which are the two ends of the state space.
 */

const RECORD = '/track/auth0';
const EMPTY_RECORD = '/track/newrelic';
const INDEX = '/track';

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 1366 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

/** Sandbox noise that is not a defect in this app. */
const IGNORED_CONSOLE = [
  /news\.google\.com/i,
  /ERR_CONNECTION_CLOSED/i,
  /analytics\/visit/i,
  /Failed to load resource: the server responded with a status of 404/i,
];

interface Captured {
  consoleErrors: string[];
  pageErrors: string[];
  failed: string[];
}

function instrument(page: Page): Captured {
  const cap: Captured = { consoleErrors: [], pageErrors: [], failed: [] };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
    cap.consoleErrors.push(text);
  });
  page.on('pageerror', (e) => cap.pageErrors.push(e.message));
  page.on('requestfailed', (r: Request) => {
    if (isExternal(r.url())) return;
    cap.failed.push(`${r.method()} ${r.url()} - ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (isExternal(r.url())) return;
    if (r.status() >= 500) cap.failed.push(`${r.status()} ${r.url()}`);
  });
  return cap;
}

function isExternal(url: string): boolean {
  const base = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
  try {
    return new URL(url).origin !== new URL(base).origin;
  } catch {
    return false;
  }
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}

/* ── 1 · Layout across viewports ────────────────────────────────────────── */

test.describe('layout', () => {
  for (const vp of VIEWPORTS) {
    test(`record has no horizontal overflow at ${vp.name}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      for (const route of [INDEX, RECORD]) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await settle(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${route} @${vp.name}`).toBeLessThanOrEqual(1);
      }
      await ctx.close();
    });
  }

  test('the record does not shift after the client hydrates', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'domcontentloaded' });
    const box = async () => page.locator('#telemetry').boundingBox();
    await page.waitForTimeout(400);
    const before = await box();
    await page.waitForTimeout(2600);
    const after = await box();
    expect(before).not.toBeNull();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(2);
  });
});

/* ── 2 · What the record must communicate ───────────────────────────────── */

test.describe('the record answers the questions a reader arrives with', () => {
  test('identity, state, last observation and observation origin', async ({ page }) => {
    const cap = instrument(page);
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    // What is observed
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Auth0');

    // Current state, as a word - never colour alone
    const state = page.locator('.obs-state').first();
    await expect(state).toBeVisible();
    expect((await state.innerText()).trim().length).toBeGreaterThan(3);
    await expect(state.locator('.ob-dot')).toHaveCount(1);

    // When it was last observed, to the second, in UTC
    const masthead = await page.locator('main > header').innerText();
    expect(masthead).toMatch(/\d{2}:\d{2}:\d{2}\sUTC/);
    expect(masthead).toMatch(/LAST OBSERVATION/i);

    // Where observations come from
    expect(masthead).toMatch(/us-east-1/);

    // Continuous observation is visible without an incident
    expect(masthead).toMatch(/observation cadence/i);
    await expect(page.locator('.obs-cadence')).toBeVisible();

    expect(cap.pageErrors, 'page errors').toEqual([]);
    expect(cap.consoleErrors, 'console errors').toEqual([]);
    expect(cap.failed, 'failed same-origin requests').toEqual([]);
  });

  test('every section of the record is present and in order', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    const ids = [
      'current-observation',
      'state',
      'telemetry',
      'network',
      'incidents',
      'evidence',
      'methodology',
      'distinction',
      'dependency',
      'related',
    ];
    const tops: number[] = [];
    for (const id of ids) {
      const el = page.locator(`#${id}`);
      await expect(el, `missing #${id}`).toHaveCount(1);
      const box = await el.boundingBox();
      tops.push(box?.y ?? 0);
    }
    expect(tops, 'sections must render in document order').toEqual([...tops].sort((a, b) => a - b));
  });

  test('current observation is per region with a latency, a code and a timestamp', async ({
    page,
  }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    const section = await page.locator('#current-observation').innerText();
    expect(section).toMatch(/us-east-1/);
    expect(section).toMatch(/N\. Virginia/);
    expect(section).toMatch(/\d{3}/); // status code
    expect(section).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test('telemetry renders a labelled chart with units and a summary', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    const chart = page.locator('#telemetry svg[role="img"]').first();
    await expect(chart).toBeVisible();
    const label = await chart.getAttribute('aria-label');
    expect(label).toMatch(/latency observed from/i);
    expect(label).toMatch(/buckets/i);

    const section = await page.locator('#telemetry').innerText();
    expect(section).toMatch(/\bms\b/);
    expect(section).toMatch(/95th percentile/i);
    expect(section).toMatch(/bucket resolution/i);
  });

  test('incidents and evidence are stated, and never leak a customer dependency name', async ({
    page,
  }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    const incidents = await page.locator('#incidents').innerText();
    expect(incidents).toMatch(/Token endpoint latency above threshold/);
    expect(incidents).toMatch(/UTC/);
    expect(incidents).toMatch(/Major|Minor|Critical/);

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/dependency_name/);
  });
});

/* ── 3 · Range and region switching ─────────────────────────────────────── */

test.describe('telemetry controls', () => {
  test('changing the range re-renders the series from the server', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    await expect(page.locator('#telemetry')).toContainText('Viewing 24 hours');
    await page.getByRole('navigation', { name: 'Telemetry range' }).getByText('7d').click();
    await page.waitForURL(/window=7d/);
    await settle(page);
    await expect(page.locator('#telemetry')).toContainText('Viewing 7 days');
    await expect(page.locator('#telemetry svg[role="img"]').first()).toBeVisible();
  });

  test('changing the region re-renders the series for that region', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    await page.getByRole('navigation', { name: 'Observation region' }).getByText('eu-west-1').click();
    await page.waitForURL(/region=eu-west-1/);
    await settle(page);
    await expect(page.locator('#telemetry')).toContainText('eu-west-1');
  });

  test('a range is a shareable URL that renders on its own', async ({ page }) => {
    const res = await page.goto(`${RECORD}?window=30d`, { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);
    await settle(page);
    await expect(page.locator('#telemetry')).toContainText('Viewing 30 days');
  });
});

/* ── 4 · Link integrity, including the whole footer ─────────────────────── */

test.describe('links', () => {
  test('every internal link on the observatory resolves', async ({ page }) => {
    const seen = new Map<string, string[]>();
    for (const route of [INDEX, RECORD]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const href of hrefs) {
        if (!href) continue;
        if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
        if (href.startsWith('#')) continue;
        if (!href.startsWith('/')) continue;
        if (!seen.has(href)) seen.set(href, []);
        seen.get(href)!.push(route);
      }
    }
    expect(seen.size).toBeGreaterThan(20);

    const broken: string[] = [];
    for (const [href, from] of seen) {
      const res = await page.request.get(href);
      if (res.status() >= 400) broken.push(`${href} -> ${res.status()} (from ${from.join(', ')})`);
    }
    expect(broken, 'broken links').toEqual([]);
  });

  test('no placeholder hrefs anywhere on the observatory', async ({ page }) => {
    for (const route of [INDEX, RECORD]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const bad = await page.locator('a[href]').evaluateAll((as) =>
        as
          .map((a) => a.getAttribute('href') ?? '')
          .filter(
            (h) =>
              h.trim() === '' ||
              h === '#' ||
              h === 'undefined' ||
              h === 'null' ||
              h.startsWith('javascript:')
          )
      );
      expect(bad, `placeholder links on ${route}`).toEqual([]);
    }
  });

  test('the index links each record and the record links back', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'networkidle' });
    await settle(page);
    await expect(page.locator(`a[href="${RECORD}"]`).first()).toBeVisible();

    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    await expect(page.locator(`a[href="${INDEX}"]`).first()).toBeVisible();
  });
});

/* ── 5 · Nothing is fabricated ──────────────────────────────────────────── */

test.describe('measurement integrity', () => {
  test('a dependency with no observations never shows an availability figure', async ({ page }) => {
    await page.goto(EMPTY_RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    const body = await page.locator('body').innerText();

    expect(body).toMatch(/No observations/i);
    expect(body).toMatch(/insufficient data/i);
    expect(body).toMatch(/no historical observations/i);
    // The API reports 100% for an empty window. It must not reach the page.
    expect(body).not.toMatch(/100\.00%/);
    expect(body).not.toMatch(/99\.9\d%/);
  });

  test('an unknown dependency renders a not-found record, noindexed', async ({ page }) => {
    // Next streams every dynamic route in this version, so `notFound()` cannot
    // rewrite the status line once the shell has flushed - the same is true of
    // /portal/[token] and /reports/[token]. What must hold regardless is that
    // the page states there is no record, invents nothing, and is not indexed.
    const res = await page.goto('/track/not-a-real-vendor-zzz', { waitUntil: 'networkidle' });
    expect([200, 404]).toContain(res?.status());
    await expect(page.locator('body')).toContainText(/does not publish a record/i);
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots).toMatch(/noindex/);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\d{2}\.\d{2}%/);
  });

  test('the record states that it is not the vendor status page', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    const text = await page.locator('#distinction').innerText();
    expect(text).toMatch(/official vendor status/i);
    expect(text).toMatch(/does not ingest|does not ingest, mirror/i);
  });

  test('methodology describes the real quorum rule', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    const text = await page.locator('#methodology').innerText();
    expect(text).toMatch(/two distinct regions/i);
    expect(text).toMatch(/60-second window/i);
    expect(text).toMatch(/never as 100%/i);
  });
});

/* ── 6 · Evidence gate ──────────────────────────────────────────────────── */

test.describe('evidence', () => {
  test('requesting an evidence record returns a real download link', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    const section = page.locator('#evidence');
    await section.getByRole('button', { name: /request the evidence record/i }).click();
    await section.getByLabel(/work email/i).fill('qa@reliastra.test');

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/evidence/gate')),
      section.getByRole('button', { name: /release the report/i }).click(),
    ]);
    expect(response.status()).toBe(200);

    await expect(section).toContainText(/evidence record released/i);
    const link = section.getByRole('link', { name: /open the evidence report/i });
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toMatch(/^\/api\/v1\/evidence\//);
  });
});

/* ── 7 · Accessibility ──────────────────────────────────────────────────── */

test.describe('accessibility', () => {
  for (const route of [INDEX, RECORD]) {
    test(`${route} has one h1, a main landmark and labelled figures`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);

      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);

      const unlabelled = await page
        .locator('svg[role="img"]')
        .evaluateAll((els) => els.filter((e) => !e.getAttribute('aria-label')).length);
      expect(unlabelled, 'every figure needs an accessible name').toBe(0);
    });
  }

  test('the chart is keyboard operable and shows a visible focus ring', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    const chart = page.locator('#telemetry svg[role="img"]').first();
    await chart.focus();
    await expect(chart).toBeFocused();

    const outline = await chart.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline === 'none').toBeFalsy();

    const before = await page.locator('#telemetry').innerText();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const after = await page.locator('#telemetry').innerText();
    expect(after, 'arrow keys must move the inspected bucket').not.toBe(before);
    expect(after).toMatch(/inspected bucket/i);
  });

  test('state is never carried by colour alone', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'networkidle' });
    await settle(page);
    const words = await page.locator('.obs-state').allInnerTexts();
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(w.trim().length).toBeGreaterThan(2);
  });
});

/* ── 8 · SEO surface ────────────────────────────────────────────────────── */

test.describe('seo', () => {
  test('the record carries a unique title, description, canonical and structured data', async ({
    page,
  }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);

    await expect(page).toHaveTitle(/Auth0/i);

    // Asserted against the served HTML rather than the live DOM: that is what
    // a crawler sees, and the dev server injects a second copy of the metadata
    // during hydration.
    const html = await (await page.request.get(RECORD)).text();
    const head = html.slice(0, html.indexOf('</head>'));

    const descriptions = head.match(/<meta name="description"[^>]*>/g) ?? [];
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]).toMatch(/Auth0/);
    expect(descriptions[0]).toMatch(/Independent/i);

    const canonical = head.match(/<link rel="canonical" href="([^"]+)"/);
    expect(canonical?.[1]).toMatch(/\/track\/auth0$/);

    expect(head).toMatch(/property="og:title"/);
    expect(head).toMatch(/name="twitter:card"/);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const joined = blocks.join(' ');
    expect(joined).toMatch(/BreadcrumbList/);
    expect(joined).toMatch(/Dataset/);
  });

  test('crawlable prose explains what is measured, from where and how', async ({ page }) => {
    await page.goto(RECORD, { waitUntil: 'networkidle' });
    await settle(page);
    const text = await page.locator('main').innerText();
    expect(text.length).toBeGreaterThan(3000);
    expect(text).toMatch(/continuous observation/i);
    expect(text).toMatch(/observation regions|observation region/i);
    expect(text).toMatch(/availability/i);
  });
});
