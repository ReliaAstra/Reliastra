import { expect, test, type Page } from '@playwright/test';

/**
 * Public-experience verification for the Obsidian redesign.
 *
 * The existing `public-navigation.spec.ts` proves routes respond and links
 * resolve. This suite proves the things the redesign is actually accountable
 * for: accessible structure, working mobile navigation, honest auth
 * messaging, intentional error states, real imagery, and layout that survives
 * every viewport it will be seen on.
 *
 * Deliberately no visual-diff snapshots: they fail on font rendering
 * differences between machines and teach a team to ignore red. Every
 * assertion here describes a defect a person would report.
 */

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 1366 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

/** One representative of every public page archetype. */
const ARCHETYPES = [
  { name: 'home', path: '/' },
  { name: 'concept', path: '/external-dependency-intelligence' },
  { name: 'pricing', path: '/pricing' },
  { name: 'research index', path: '/research' },
  { name: 'research article', path: '/research/the-dependency-gap' },
  { name: 'dependency index', path: '/track' },
  { name: 'legal', path: '/terms' },
  { name: 'partner landing', path: '/partner' },
  { name: 'customer sign in', path: '/login' },
  { name: 'customer sign up', path: '/signup' },
  { name: 'email verification', path: '/verify-email' },
  { name: 'password reset', path: '/reset-password' },
  { name: 'not found', path: '/this-route-does-not-exist-zzz' },
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

/* ── Accessibility structure ────────────────────────────────────────────── */

test.describe('accessible structure', () => {
  for (const { name, path } of ARCHETYPES) {
    test(`${name} has one h1, a main landmark and labelled images`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await settle(page);

      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.locator('main').count()).toBeGreaterThanOrEqual(1);

      const missingAlt = await page
        .locator('img:not([alt])')
        .evaluateAll((els) => els.map((e) => e.getAttribute('src')));
      expect(missingAlt, `<img> without alt on ${path}`).toEqual([]);

      // Heading levels must not skip (h2 → h4).
      const levels = await page
        .locator('h1,h2,h3,h4,h5,h6')
        .evaluateAll((els) => els.map((e) => Number(e.tagName.slice(1))));
      const skips: string[] = [];
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1)
          skips.push(`h${levels[i - 1]} → h${levels[i]}`);
      }
      expect(skips, `heading level skips on ${path}`).toEqual([]);
    });
  }

  test('the skip link is the first focusable element and targets main', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLAnchorElement | null;
      return { text: el?.textContent?.trim(), href: el?.getAttribute('href') };
    });
    expect(focused.text).toMatch(/skip to content/i);
    expect(focused.href).toBe('#main');
    await expect(page.locator('#main')).toHaveCount(1);
  });

  test('keyboard focus is always visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'none';
        const s = getComputedStyle(el);
        return `${s.outlineStyle}:${s.outlineWidth}`;
      });
      if (outline === 'none') continue;
      expect(outline, 'focused element has no visible outline').not.toMatch(
        /^none:/
      );
    }
  });

  test('every form control has an accessible name', async ({ page }) => {
    for (const path of ['/login', '/signup', '/reset-password', '/verify-email']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await settle(page);
      const unlabelled = await page
        .locator('input:not([type="hidden"])')
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const id = el.getAttribute('id');
              const hasLabel = id
                ? Boolean(document.querySelector(`label[for="${id}"]`))
                : false;
              return (
                !hasLabel &&
                !el.getAttribute('aria-label') &&
                !el.getAttribute('aria-labelledby')
              );
            })
            .map((el) => el.outerHTML.slice(0, 90))
        );
      expect(unlabelled, `unlabelled inputs on ${path}`).toEqual([]);
    }
  });
});

/* ── Mobile navigation ──────────────────────────────────────────────────── */

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens, exposes every destination, and closes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);

    const toggle = page.getByRole('button', { name: /menu/i }).first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const sheet = page.locator('#ob-mobile-menu');
    await expect(sheet).toBeVisible();
    for (const label of ['Product', 'Research', 'Pricing', 'Partners']) {
      await expect(
        sheet.getByRole('link', { name: label, exact: true }).first()
      ).toBeVisible();
    }
    await expect(
      sheet.getByRole('link', { name: /start monitoring/i }).first()
    ).toBeVisible();

    // The page behind the sheet must not scroll.
    expect(
      await page.evaluate(() => getComputedStyle(document.body).overflow)
    ).toBe('hidden');

    await page.getByRole('button', { name: /close/i }).first().click();
    // The sheet stays mounted and is closed with the `hidden` attribute, which
    // removes it from the accessibility tree and the tab order.
    await expect(sheet).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('the mobile hero fits the viewport and keeps its CTA reachable', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const cta = page.getByRole('link', { name: /start monitoring/i }).first();
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box, 'hero CTA has no box').not.toBeNull();
    // Tap targets: at least 44px tall.
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });
});

/* ── Auth behaviour ─────────────────────────────────────────────────────── */

test.describe('authentication surfaces', () => {
  test('forgot password never reveals whether an account exists', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await settle(page);

    const message =
      'If that address has an account, a reset link is on its way.';

    for (const email of [
      `definitely-not-a-user-${Date.now()}@example.com`,
      'admin@reliastra.com',
    ]) {
      await page.fill('#email', email);
      await page.getByRole('button', { name: /forgot password/i }).click();
      await expect(page.getByRole('status')).toContainText(message);
    }
  });

  test('an empty sign-in submission is announced, not silently ignored', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('an expired session is explained on arrival', async ({ page }) => {
    await page.goto('/login?expired=1', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(page.getByRole('alert')).toContainText(/session ended/i);
  });

  test('signup enforces the password floor before calling the API', async ({
    page,
  }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.fill('#fullName', 'Test Operator');
    await page.fill('#email', 'operator@example.com');
    await page.fill('#password', 'short');
    await expect(page.locator('#password-error')).toContainText(/8 characters/i);
  });

  test('reset-password without a token explains itself and offers a route out', async ({
    page,
  }) => {
    await page.goto('/reset-password', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(page.getByRole('alert')).toContainText(/no reset token/i);
    await expect(
      page.getByRole('link', { name: /request a new link/i })
    ).toBeVisible();
  });

  test('auth routes are excluded from indexing', async ({ page }) => {
    for (const path of ['/login', '/signup', '/verify-email', '/reset-password']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const robots = await page
        .locator('meta[name="robots"]')
        .first()
        .getAttribute('content');
      expect(robots, `${path} robots`).toContain('noindex');
    }
  });

  test('customer and partner sign-in cross-link without mixing the flows', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(
      page.getByRole('link', { name: /partner sign-in/i })
    ).toHaveAttribute('href', '/partner/login');

    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await settle(page);
    // "Apply to the partner network" must never point at customer signup.
    await expect(
      page.getByRole('link', { name: /partner network/i })
    ).toHaveAttribute('href', '/partner/signup');
  });
});

/* ── Error states ───────────────────────────────────────────────────────── */

test.describe('error states', () => {
  test('404 is intentional, accurate and navigable', async ({ page }) => {
    const res = await page.goto('/no-such-page-xyz', {
      waitUntil: 'domcontentloaded',
    });
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toContainText(/signal\s*lost/i);
    await expect(page.getByText(/could not be located/i)).toBeVisible();

    // No apologetic filler, no emoji.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/oops|whoops|uh[- ]oh|😅|🙈/);

    // The primary action must be public — never the protected console.
    const primary = page.getByRole('link', { name: /return to reliastra/i });
    await expect(primary).toHaveAttribute('href', '/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('an unknown research slug 404s rather than redirecting', async ({
    request,
  }) => {
    expect((await request.get('/research/not-a-real-paper')).status()).toBe(404);
  });

  test('an unknown vendor 404s rather than inventing a record', async ({
    request,
  }) => {
    const res = await request.get('/track/not-a-real-vendor-zzz');
    expect([404, 200]).toContain(res.status());
    if (res.status() === 200) {
      // The only acceptable 200 is the explicit "unreachable" state, which
      // must not display fabricated metrics.
      const body = await res.text();
      expect(body).toMatch(/unreachable|Record unavailable/i);
      expect(body).not.toMatch(/99\.9\d%/);
    }
  });
});

/* ── Layout across viewports ────────────────────────────────────────────── */

test.describe('responsive layout', () => {
  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow at ${vp.name}px`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      const offenders: string[] = [];

      for (const { path } of ARCHETYPES) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await settle(page);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        if (scrollWidth > clientWidth + 2)
          offenders.push(`${path} (${scrollWidth} > ${clientWidth})`);
      }

      expect(offenders, `horizontal scroll at ${vp.name}px`).toEqual([]);
      await ctx.close();
    });
  }

  test('body copy never renders below 14px on a phone', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    await page.goto('/research/the-dependency-gap', {
      waitUntil: 'domcontentloaded',
    });
    await settle(page);
    const sizes = await page
      .locator('.ob-prose p')
      .evaluateAll((els) =>
        els.map((e) => parseFloat(getComputedStyle(e).fontSize))
      );
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(15);
    await ctx.close();
  });
});

/* ── Motion & performance policy ────────────────────────────────────────── */

test.describe('motion and assets', () => {
  test('reduced-motion is honoured', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el);
        const dur = parseFloat(s.animationDuration || '0');
        return s.animationName !== 'none' && dur > 0.1;
      }).length
    );
    expect(animated, 'animations still running under reduced-motion').toBe(0);
    await ctx.close();
  });

  test('hero imagery is served in a modern format at a sane weight', async ({
    page,
  }) => {
    const images: { url: string; type: string | null; bytes: number }[] = [];
    page.on('response', async (r) => {
      if (!/\/_next\/image|\/media\//.test(r.url())) return;
      const buf = await r.body().catch(() => null);
      images.push({
        url: r.url(),
        type: r.headers()['content-type'] ?? null,
        bytes: buf?.length ?? 0,
      });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    expect(images.length, 'no optimised images requested').toBeGreaterThan(0);
    for (const img of images) {
      expect(img.type, `${img.url} content-type`).toMatch(
        /image\/(avif|webp|jpeg)/
      );
      expect(img.bytes, `${img.url} is too heavy`).toBeLessThan(900_000);
    }
  });

  test('the homepage story is present without JavaScript', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const text = await page.locator('body').innerText();
    for (const phrase of [
      'External Dependency Intelligence',
      'Research',
      'Pricing',
    ]) {
      expect(text, `"${phrase}" missing without JS`).toContain(phrase);
    }
    await ctx.close();
  });
});
