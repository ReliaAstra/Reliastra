import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Endpoints of the local dev stack (all same-host, sandbox-internal). */
export const PAYSTACK_MOCK = process.env.E2E_PAYSTACK_URL ?? 'http://127.0.0.1:9200';
export const MAIL_SINK = process.env.E2E_MAILHOG_URL ?? 'http://127.0.0.1:8025';

/** The published, contractual pricing — asserted, never read from the UI. */
export const CONTRACT = {
  productAmountDisplay: '$39.00 (USD)',
  productAmountMinor: 3900,
  productCurrency: 'USD',
  actualChargeDisplay: '₦60,000.00 (NGN)',
  paymentAmountMinor: 6_000_000, // kobo — set independently, NOT 3900 converted
  paymentCurrency: 'NGN',
  provider: 'Paystack',
  notice:
    "RELIASTRA's plans are priced in USD. Our current Paystack payment flow processes payments in NGN. We are working toward enabling USD payment options for our global customers.",
  annualProductDisplay: '$390.00 (USD)',
  annualChargeDisplay: '₦600,000.00 (NGN)',
  annualAmountMinor: 60_000_000,
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Decode the printable text parts of a captured SMTP message. The app sends
 * multipart/alternative with base64 parts; we only care about the human text.
 */
export function decodeMailRaw(raw: string): string {
  const out: string[] = [];
  const pattern =
    /Content-Transfer-Encoding: base64\s*\n\s*\n([A-Za-z0-9+/=\s]+?)(?=\r?\n\r?\n|--[\w-]+|--$)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw))) {
    try {
      const text = Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8');
      if (/reliastra/i.test(text)) out.push(text);
    } catch {
      /* not valid base64 — a body that needed no encoding */
    }
  }
  if (!out.length) {
    // Plaintext (7bit) fallback: everything after the headers.
    out.push(raw.split(/\r?\n\r?\n/).slice(1).join('\n\n'));
  }
  return out.join('\n\n');
}

/** Decode RFC 2047 encoded header words (=?utf-8?B|Q?...?=) to real text. */
export function decodeMimeWords(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_all, _charset: string, enc: string, payload: string) => {
      if (enc.toLowerCase() === 'b') {
        return Buffer.from(payload, 'base64').toString('utf8');
      }
      const q = payload.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g,
        (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(q, 'binary').toString('utf8');
    },
  );
}

/** The 6-digit signup code from the newest email to this address. */
export async function waitForOtp(request: APIRequestContext, email: string): Promise<string> {
  let last: unknown = null;
  for (let i = 0; i < 30; i++) {
    const res = await request.get(`${MAIL_SINK}/`);
    if (res.ok()) {
      const body = await res.json().catch(() => ({ messages: [] }));
      last = body;
      for (const msg of body.messages ?? []) {
        if (String(msg.to).toLowerCase() !== email.toLowerCase()) continue;
        // The subject leads with the code ("347668 is your Reliastra
        // verification code") — the most reliable source; the decoded body
        // is the fallback.
        const fromSubject = decodeMimeWords(String(msg.subject ?? '')).match(/\b(\d{6})\b/);
        if (fromSubject) return fromSubject[1];
        const fromBody = decodeMailRaw(msg.raw).match(/verification code is:?\s*(\d{6})|(?:^|\D)(\d{6})(?:\D|$)/);
        if (fromBody) return fromBody[1] ?? fromBody[2];
      }
    }
    await wait(1000);
  }
  throw new Error(`No OTP email for ${email} (${JSON.stringify(last).slice(0, 400)})`);
}

export async function apiGet<T>(request: APIRequestContext, url: string): Promise<T> {
  const res = await request.get(url);
  expect(res.ok(), `GET ${url} -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

/**
 * Register + verify a fresh customer through the app's own auth endpoints.
 * Returns the session token the verification issues, so API-level asserts can
 * run authenticated exactly like the browser app does (Bearer via the proxy).
 */
export async function createAccount(
  page: Page,
  email: string,
  password: string,
): Promise<{ accessToken: string; organizationId: string }> {
  const res = await page.request.post('/api/auth/signup', {
    data: { email, password, full_name: 'Ada Tester' },
  });
  expect(res.ok(), `signup -> ${res.status()}`).toBeTruthy();
  const otp = await waitForOtp(page.request, email);
  const verified = await page.request.post('/api/auth/verify-otp', {
    data: { email, code: otp },
  });
  expect(verified.ok(), `verify-otp -> ${verified.status()}`).toBeTruthy();
  const session = await verified.json();
  const accessToken: string | undefined = session?.tokens?.access_token;
  expect(accessToken, 'verify-otp did not return a session token').toBeTruthy();
  const organizationId: string | undefined = session?.organization?.id;
  expect(organizationId, 'verify-otp did not return the default organization').toBeTruthy();
  return { accessToken: accessToken!, organizationId: organizationId! };
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // Fill-hydration race: on a cold dev server the static form accepts input
  // before React hydrates, and hydration then re-renders the controlled
  // inputs with their store values — wiping a just-typed address. Fill, and
  // only proceed once the values have SURVIVED a settle tick.
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.waitForTimeout(400);
    const e = await page.inputValue('#email');
    const pw = await page.inputValue('#password');
    if (e === email && pw === password) break;
  }
  await expect(page.locator('#email')).toHaveValue(email, { timeout: 10_000 });
  // Submit, re-asserting navigation: on a cold dev build hydration may attach
  // the onSubmit handler after the first click, which does nothing. Retry is
  // safe (login is an idempotent credential check).
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
    try {
      await page.waitForURL(/\/(dashboard|home|projects|settings)/, { timeout: 15_000 });
      break;
    } catch {
      if (attempt === 2) throw new Error('sign-in did not navigate');
      await page.fill('#email', email);
      await page.fill('#password', password);
      await page.waitForTimeout(800);
    }
  }
  // Let the app settle before any hard navigation: the dashboard bootstrap
  // rotates the refresh token, and unloading the document mid-response would
  // leave the rotated value unpersisted — the next page load would then reuse
  // the spent token and the backend's reuse detection would revoke the
  // session family. A human who clicks fast enough can hit this too; the
  // journey must not trip over it, so wait for quiescence.
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () =>
      !!localStorage.getItem('reliastra_access_token') &&
      !!localStorage.getItem('reliastra_refresh_token'),
    undefined,
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * What the stand-in recorded of the `transaction/initialize` call RELIASTRA
 * actually made — the authoritative answer to "what did we ask to be charged",
 * as opposed to what the page displayed.
 */
export interface PaystackInitCapture {
  reference: string;
  amount: number | null;
  currency: string | null;
  email?: string | null;
  /** Must be absent/null: a plan code would override our published amount. */
  plan?: string | null;
  /** The rails the customer was allowed to pay through. */
  channels?: string[];
  metadata?: Record<string, unknown>;
  callback_url?: string | null;
  /** The outcome the next verify will report. */
  outcome?: 'success' | 'failed' | 'pending';
}

/** Latest captured upstream initialize request for this reference. */
export async function lastPaystackInit(request: APIRequestContext): Promise<PaystackInitCapture | null> {
  const all = await request.get(`${PAYSTACK_MOCK}/capture/all`);
  if (!all.ok()) return null;
  const rows = (await all.json()) as unknown[];
  return rows.length ? (rows[rows.length - 1] as PaystackInitCapture) : null;
}

/**
 * Decide the fate of one payment at the provider, out of band.
 *
 * The hosted page and the popup both end up here, because "the bank declined
 * it" is not something a test can arrange by clicking a real bank. Setting the
 * outcome — rather than stubbing Paystack inside the app — keeps the customer's
 * path identical to production's: RELIASTRA still verifies server-side and is
 * still the only thing that decides whether the plan activates.
 */
export async function setPaystackOutcome(
  request: APIRequestContext,
  reference: string,
  outcome: 'success' | 'failed' | 'pending',
): Promise<void> {
  const res = await request.post(`${PAYSTACK_MOCK}/outcome/${reference}/${outcome}`);
  expect(res.ok(), `set outcome ${outcome} for ${reference} -> ${res.status()}`).toBeTruthy();
}

/** All captured initialize calls, oldest first. */
export async function allPaystackInits(
  request: APIRequestContext,
): Promise<PaystackInitCapture[]> {
  const res = await request.get(`${PAYSTACK_MOCK}/capture/all`);
  if (!res.ok()) return [];
  return (await res.json()) as PaystackInitCapture[];
}

export async function resetPaystackMock(request: APIRequestContext): Promise<void> {
  await request.post(`${PAYSTACK_MOCK}/reset`).catch(() => {});
}

/** Case-insensitive containment that tolerates CSS-uppercased labels and
 * missing inline spacing between adjacent inline runs of innerText. */
export function expectTextContains(text: string, ...needles: string[]) {
  // Strip ALL whitespace: innerText glues adjacent inline runs together
  // ("…(NGN)per month") and CSS uppercases labels — we assert content, not
  // typography.
  const hay = text.toLowerCase().replace(/\s+/g, '');
  for (const needle of needles) {
    expect(hay).toContain(needle.toLowerCase().replace(/\s+/g, ''));
  }
}

/** Normalized whitespace text of a locator (assertion-friendly). */
export async function flatText(loc: { innerText: (opts?: object) => Promise<string> }): Promise<string> {
  return (await loc.innerText()).replace(/\s+/g, ' ').trim();
}
