import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as customer from '../session-storage';
import * as partner from '../partner-session';

describe('customer and partner credential isolation', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage, location: { protocol: 'https:' } });
    vi.stubGlobal('document', { cookie: '' });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('does not fall back to partner credentials for customer requests', () => {
    partner.storePartnerTokens('partner-access', 'partner-refresh');
    expect(customer.getAccessToken()).toBeNull();
    expect(customer.getRefreshToken()).toBeNull();
    expect(document.cookie).toContain('partner_access_token=partner-access');
  });
  it('rotates and clears each namespace without touching the other', () => {
    customer.storeSessionTokens('customer-access', 'customer-refresh');
    partner.storePartnerTokens('partner-access', 'partner-refresh');
    customer.storeSessionTokens('customer-next', 'customer-refresh-next');
    expect(partner.getAccessToken()).toBe('partner-access');
    partner.clearPartnerTokens();
    expect(customer.getAccessToken()).toBe('customer-next');
    expect(customer.getRefreshToken()).toBe('customer-refresh-next');
    expect(document.cookie).toContain('partner_access_token=;');
    partner.storePartnerTokens('partner-next', 'partner-refresh-next');
    customer.clearCustomerTokens();
    expect(partner.getAccessToken()).toBe('partner-next');
  });
  it('keeps partner credentials during a transient refresh failure', async () => {
    partner.storePartnerTokens('access', 'refresh');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(partner.refreshSession()).rejects.toThrow('Unable to refresh');
    expect(partner.getRefreshToken()).toBe('refresh');
  });
  it('deduplicates refresh requests and stores the rotated pair', async () => {
    partner.storePartnerTokens('access', 'refresh');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'next-access', refresh_token: 'next-refresh' })));
    vi.stubGlobal('fetch', fetch);
    await Promise.all([partner.refreshSession(), partner.refreshSession()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(partner.getRefreshToken()).toBe('next-refresh');
    expect(customer.getRefreshToken()).toBeNull();
  });
});
