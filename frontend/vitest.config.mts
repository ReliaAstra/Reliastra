import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for browser-side logic that has no Playwright coverage.
 *
 * The e2e suite (`frontend/e2e`) drives real pages; this covers the pure
 * decision logic those pages depend on — session-failure classification in
 * particular, where a wrong answer silently destroys a valid session.
 *
 * Run with `npm run test`. Kept to `src/**\/__tests__/*.test.{ts,tsx}` so Playwright
 * specs under `e2e/` are never picked up by the wrong runner.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
