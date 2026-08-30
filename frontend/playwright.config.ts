import { defineConfig, devices } from '@playwright/test';

/**
 * Customer-journey verification for pricing + billing transparency.
 *
 * These specs drive the REAL stack: Next.js frontend on :3000, the FastAPI
 * backend behind it (via the /api/v1 proxy), and the local Paystack stand-in
 * (audit/mock_paystack.py) that records the exact amount + currency the
 * backend asks the provider to charge. Nothing is mocked inside the browser:
 * the flow under test is signup -> pricing -> checkout -> payment -> receipts,
 * the same one a customer takes.
 *
 * Run (from frontend/):
 *   PLAYWRIGHT_CHROMIUM=... (auto-set by the repo dev stack if present)
 *   npx playwright test
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const executable = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/results.json' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: executable,
      // Constrained-container launch set: no sandbox, software GPU, no
      // /dev/shm pressure. (Do NOT add --single-process/--no-zygote here —
      // this build crashes with them and runs fine without.)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      env: process.env.PW_CHROMIUM_LIB_PATH
        ? {
            ...process.env,
            LD_LIBRARY_PATH: `${process.env.PW_CHROMIUM_LIB_PATH}:${process.env.LD_LIBRARY_PATH ?? ''}`,
          }
        : undefined,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
