/** Real API/database/worker flows. No page.route, injected session, or provider stand-in.
 * E2E_ACCOUNTS_FILE points at locally provisioned, email-verified QA accounts.
 * Optional E2E_MAILBOX_FILE is a local SMTP capture used to verify actual delivery.
 * No production account or payment is required. */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const file = process.env.E2E_ACCOUNTS_FILE;
const accounts = file ? JSON.parse(readFileSync(file, 'utf8')) : null;
test.skip(!accounts, 'Requires real, verified QA accounts');
async function signIn(page: Page, role: 'partner' | 'customer' = 'customer', next?: string) {
  await page.goto(role === 'partner' ? '/partner/login' : `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Work email').fill(accounts[role].email);
  await page.getByLabel('Password', { exact: true }).fill(accounts[role].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(role === 'partner' ? /\/partner\/dashboard$/ : new RegExp(`${next ?? '/dashboard'}$`));
}
function audit(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url ?? ''}`); });
  page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('partner authentication: URL, refresh, history, deep link and logout', async ({ page }) => {
  const errors = audit(page);
  await signIn(page, 'partner');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Referrals', exact: true }).first().click();
  await expect(page).toHaveURL(/\/partner\/referrals$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/partner\/dashboard$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/partner\/referrals$/);
  await page.goto('/partner/settings');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
  await page.goto('/partner/dashboard');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await page.goto('/partner/dashboard');
  await expect(page).toHaveURL(/\/partner\/login\?next=/);
  expect(errors).toEqual([]);
});

test('customer billing and notifications use persisted state on desktop and mobile', async ({ page }) => {
  const errors = audit(page);
  await signIn(page, 'customer', '/settings/billing');
  await expect(page.getByTestId('billing-plan')).toBeVisible();
  await expect(page.getByText('No payments recorded', { exact: true })).toBeVisible();
  await expect(page.getByText(/CVC|Card details are held|No card on file/)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/billing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/billing-mobile.png', fullPage: true });
  await page.goto('/settings/notifications');
  const previousChannels = page.getByRole('article', { name: `email ${accounts.customer.email}`, exact: true });
  await expect(page.getByRole('button', { name: 'Add email', exact: true })).toBeVisible();
  while (await previousChannels.count()) {
    const count = await previousChannels.count();
    await previousChannels.first().getByRole('button', { name: 'Remove', exact: true }).click();
    await previousChannels.first().getByRole('button', { name: 'Confirm removal' }).click();
    await expect(previousChannels).toHaveCount(count - 1);
  }
  await page.getByRole('button', { name: 'Add email', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(accounts.customer.email);
  await page.getByRole('button', { name: 'Save channel' }).click();
  const channel = page.getByRole('article', { name: `email ${accounts.customer.email}`, exact: true }).last();
  await expect(channel.getByText('Verified', { exact: true })).toBeVisible();
  await channel.getByLabel('Incident resolved', { exact: true }).uncheck();
  await expect(channel.getByLabel('Incident resolved', { exact: true })).not.toBeChecked();
  await expect(channel.getByLabel('Enabled', { exact: true })).toBeEnabled();
  await page.reload();
  await expect(channel.getByLabel('Incident resolved', { exact: true })).not.toBeChecked();
  await channel.getByRole('button', { name: 'Send test', exact: true }).click();
  await expect(channel.getByRole('status')).toHaveText('Test notification sent');
  if (process.env.E2E_MAILBOX_FILE) {
    const mail = readFileSync(process.env.E2E_MAILBOX_FILE, 'utf8');
    expect(mail).toContain('Your RELIASTRA notification channel is ready.');
  }
  await channel.getByLabel('Enabled', { exact: true }).uncheck();
  await expect(channel.getByLabel('Enabled', { exact: true })).toBeEnabled();
  await page.reload();
  await expect(channel.getByText('Disabled', { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/notifications-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/notifications-desktop.png', fullPage: true });
  await channel.getByRole('button', { name: 'Remove', exact: true }).click();
  await channel.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(channel).toHaveCount(0);
  await page.reload();
  await expect(channel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('external email destination requires and completes real email verification', async ({ page }) => {
  test.skip(!process.env.E2E_MAILBOX_FILE, 'Requires local SMTP delivery capture');
  const errors = audit(page);
  await signIn(page, 'customer', '/settings/notifications');
  const destination = `audit-alerts-${Date.now()}@example.com`;
  await page.getByRole('button', { name: 'Add email', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(destination);
  await page.getByRole('button', { name: 'Save channel' }).click();
  const channel = page.getByRole('article', { name: `email ${destination}`, exact: true });
  await expect(channel.getByText('Verification required', { exact: true })).toBeVisible();
  await expect(channel.getByRole('button', { name: 'Send test', exact: true })).toBeDisabled();
  const messages = readFileSync(process.env.E2E_MAILBOX_FILE!, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const message = messages.reverse().find(m => m.to.includes(destination));
  const code = message.text.match(/\b\d{6}\b/)[0];
  await channel.getByLabel('Email verification code').fill(code);
  await channel.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(channel.getByText('Verified', { exact: true })).toBeVisible();
  await page.reload();
  await expect(channel.getByText('Verified', { exact: true })).toBeVisible();
  await channel.getByRole('button', { name: 'Send test', exact: true }).click();
  await expect(channel.getByRole('status')).toHaveText('Test notification sent');
  await channel.getByRole('button', { name: 'Remove', exact: true }).click();
  await channel.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(channel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('customer probe results and public monitoring are real and revalidate', async ({ page }) => {
  test.setTimeout(150000);
  const errors = audit(page);
  await signIn(page, 'customer', `/dependencies/${accounts.customer.dependency}`);
  await expect(page.getByRole('heading', { name: 'Latest check', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run check', exact: true })).toBeEnabled();
  const recent = () => page.evaluate(async (id) => {
    const r = await fetch(`/api/v1/checks/recent?dependency_id=${id}`);
    if (!r.ok) throw new Error(`Recent checks: ${r.status}`);
    return r.json();
  }, accounts.customer.dependency);
  const beforeId = (await recent())[0]?.id;
  await page.getByRole('button', { name: 'Run check', exact: true }).click();
  await expect.poll(async () => (await recent())[0]?.id, { timeout: 45000 }).not.toBe(beforeId);
  const first = (await recent())[0];
  expect(first.is_up).toBe(true);
  expect(first.status_code).toBe(200);
  expect(first.latency_ms).toBeGreaterThan(0);
  // No second click: Beat must produce another result on the persisted schedule.
  await expect.poll(async () => (await recent())[0]?.id, { timeout: 80000, intervals: [5000] }).not.toBe(first.id);
  const repeated = (await recent())[0];
  expect(Date.parse(repeated.executed_at)).toBeGreaterThan(Date.parse(first.executed_at));
  expect(repeated.status_code).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Latest check', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/customer-probe.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /npm Registry/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /npm Registry/ })).toContainText(/Operational|Check failed|No recent data/);
  await page.getByRole('link', { name: /npm Registry/ }).click();
  await expect(page).toHaveURL(/\/track\/npm-registry/);
  await page.screenshot({ path: 'test-results/public-observations.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('Slack connection and delivery when a real webhook is supplied', async ({ page }) => {
  test.skip(!process.env.E2E_SLACK_WEBHOOK, 'No Slack webhook configured; never simulate a connection');
  await signIn(page, 'customer', '/settings/notifications');
  await page.getByRole('button', { name: 'Connect Slack' }).click();
  await page.getByLabel('Destination label').fill('QA incident alerts');
  await page.getByLabel('Slack incoming webhook').fill(process.env.E2E_SLACK_WEBHOOK!);
  await page.getByRole('button', { name: 'Save channel' }).click();
  const channel = page.getByRole('article', { name: 'slack QA incident alerts' });
  await channel.getByRole('button', { name: 'Send test' }).click();
  await expect(channel.getByRole('status')).toHaveText('Test notification sent');
  await page.reload();
  await expect(channel.getByText('Connected', { exact: true })).toBeVisible();
  await channel.getByRole('button', { name: 'Disconnect' }).click();
  await channel.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(channel).toHaveCount(0);
});


test('organization isolation and partner membership remain enforced', async ({ page, request }) => {
  const login = async (role: 'customer' | 'other') => {
    const response = await request.post('/api/v1/auth/login', { data: { email: accounts[role].email, password: accounts[role].password } });
    expect(response.ok()).toBe(true);
    return (await response.json()).access_token;
  };
  const token = await login('customer');
  const other = await login('other');
  const ownHeaders = { Authorization: `Bearer ${token}`, 'X-Organization-ID': accounts.customer.org };
  const otherHeaders = { Authorization: `Bearer ${other}`, 'X-Organization-ID': accounts.other.org };
  const created = await request.post('/api/v1/notifications/configs', { headers: ownHeaders, data: { channel_type: 'email', config: { email: accounts.customer.email } } });
  expect(created.status()).toBe(201);
  const channel = await created.json();
  expect(channel.config).toBeUndefined();
  for (const method of ['get', 'patch', 'delete'] as const) {
    const response = await request[method](`/api/v1/notifications/configs/${channel.id}`, { headers: otherHeaders, ...(method === 'patch' ? { data: { is_active: false } } : {}) });
    expect(response.status()).toBe(404);
  }
  const forgedOrg = await request.get('/api/v1/notifications/configs', { headers: { ...otherHeaders, 'X-Organization-ID': accounts.customer.org } });
  expect([403, 404]).toContain(forgedOrg.status());
  const unauthorizedCheck = await request.get(`/api/v1/checks/state/${accounts.customer.dependency}`, { headers: otherHeaders });
  expect(unauthorizedCheck.status()).toBe(404);
  const own = await request.get(`/api/v1/notifications/configs/${channel.id}`, { headers: ownHeaders });
  expect((await own.json()).is_active).toBe(true);
  await request.delete(`/api/v1/notifications/configs/${channel.id}`, { headers: ownHeaders });
  await signIn(page, 'customer');
  await page.goto('/partner/dashboard');
  await expect(page).toHaveURL(/\/partner\/login/);
  await page.getByLabel('Work email').fill(accounts.customer.email);
  await page.getByLabel('Password', { exact: true }).fill(accounts.customer.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('No partner account. Register for the Partner Network to continue.')).toBeVisible();
  const membership = await request.get('/api/partners/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(membership.status()).toBe(404);
});


test('customer and partner sessions coexist without changing identity', async ({ page }) => {
  const errors = audit(page);
  await signIn(page, 'customer');
  await expect(page.getByRole('heading', { name: 'Dependency health', exact: true })).toBeVisible();
  await signIn(page, 'partner');
  const identities = await page.evaluate(async () => {
    const customer = await fetch('/api/auth/me').then(r => r.json());
    const partner = await fetch('/api/partners/session/me').then(r => r.json());
    return { customer: customer.email, partner: partner.email };
  });
  expect(identities).toEqual({ customer: accounts.customer.email, partner: accounts.partner.email });
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dependency health', exact: true })).toBeVisible();
  const customerEmail = await page.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(r => r.email));
  expect(customerEmail).toBe(accounts.customer.email);
  await page.goto('/billing');
  await expect(page).toHaveURL(/\/settings\/billing$/);
  await expect(page.getByTestId('billing-plan')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('stopped workers show stale observations rather than a live healthy signal', async ({ page }) => {
  test.skip(!process.env.E2E_PIPELINE_STOPPED, 'Operator-controlled recovery check; stop worker and Beat first');
  await signIn(page, 'customer', `/dependencies/${accounts.customer.dependency}`);
  await expect(page.getByText('No recent data', { exact: true }).first()).toBeVisible();
  const state = await page.evaluate(id => fetch(`/api/v1/checks/state/${id}`).then(r => r.json()), accounts.customer.dependency);
  expect(state.is_stale).toBe(true);
  expect(state.last_result).toBeTruthy();
  expect(Date.now() - Date.parse(state.last_result.executed_at)).toBeGreaterThan(180000);
  await page.screenshot({ path: 'test-results/stopped-worker.png', fullPage: true });
});


test('failed HTTP observation persists and recovers after endpoint correction', async ({ page }) => {
  test.setTimeout(120000);
  const errors = audit(page);
  await signIn(page, 'customer', `/dependencies/${accounts.customer.dependency}`);
  const path = `/api/v1/dependencies/${accounts.customer.dependency}`;
  await expect(page.getByRole('heading', { name: 'Latest check', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run check', exact: true })).toBeEnabled();
  const originalResponse = await page.request.get(path);
  expect(originalResponse.ok()).toBe(true);
  const original = await originalResponse.json();
  expect(original.endpoint_url).toBeTruthy();
  const read = () => page.request.get(`/api/v1/checks/recent?dependency_id=${accounts.customer.dependency}`).then(r => r.json()).then(r => r[0]);
  const run = async () => {
    const prior = (await read()).id;
    const response = await page.request.post('/api/v1/checks/run', { data: { dependency_id: accounts.customer.dependency } });
    expect(response.status()).toBe(202);
    await expect.poll(async () => (await read()).id, { timeout: 45000 }).not.toBe(prior);
    return read();
  };
  try {
    const update = await page.request.patch(path, { data: { endpoint_url: 'https://registry.npmjs.org/reliastra-qa-nonexistent-package-949362' } });
    expect(update.ok()).toBe(true);
    const failed = await run();
    expect(failed.status_code).toBe(404);
    expect(failed.is_up).toBe(false);
    await page.reload();
    await expect(page.getByText('Check failed', { exact: true }).first()).toBeVisible();
    const restore = await page.request.patch(path, { data: { endpoint_url: original.endpoint_url } });
    expect(restore.ok()).toBe(true);
    expect((await run()).status_code).toBe(200);
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: /^Operational$/ })).toBeVisible();
  } finally {
    expect((await page.request.patch(path, { data: { endpoint_url: original.endpoint_url } })).ok()).toBe(true);
  }
  expect(errors).toEqual([]);
});


test('expired partner access token refreshes without losing the deep link', async ({ page }) => {
  test.skip(!process.env.E2E_SHORT_ACCESS_TTL, 'Requires QA API started with ACCESS_TOKEN_EXPIRE_MINUTES=1');
  test.setTimeout(100000);
  await signIn(page, 'partner');
  const expiry = await page.evaluate(() => JSON.parse(atob(localStorage.getItem('partner_access_token')!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000);
  expect(expiry - Date.now()).toBeLessThan(65000);
  // Wait for the actual server-issued expiry; no edited or injected credentials.
  const refresh = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/refresh') && r.request().method() === 'POST', { timeout: 80000 });
  await page.waitForTimeout(Math.max(0, expiry - Date.now()) + 1200);
  await page.goto('/partner/settings');
  expect((await refresh).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/partner\/settings$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
});
