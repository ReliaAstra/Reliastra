import { vi } from 'vitest';

/**
 * Make the request-time rendering signal inert under test.
 *
 * `renderAtRequestTime()` wraps Next's `connection()`, which throws
 * "`connection` was called outside a request scope" when there is no request
 * store. That is the correct production behaviour - it is exactly the signal
 * that stops `next build` from prerendering a route whose data comes from the
 * measurement API - and it is meaningless here, where there is neither a build
 * nor a request. These suites call route handlers and render page components
 * directly (`seo.test.ts` calls `llms.txt`'s `GET`, `methodology.test.tsx`
 * renders the research hub, `landing-sections.test.tsx` renders the homepage
 * composition), so the signal has to do nothing.
 *
 * Mocked in one place rather than per file: any future suite that touches a
 * surface reading the catalog needs it, and without it the failure reads as a
 * Next internals error instead of saying what actually broke.
 */
vi.mock('@/lib/render-at-request-time', () => ({
  renderAtRequestTime: vi.fn(async () => {}),
}));
