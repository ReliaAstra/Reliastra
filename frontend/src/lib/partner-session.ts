'use client';
import { setPartnerAccessTokenCookie } from './auth-cookie';

const ACCESS = 'partner_access_token';
const REFRESH = 'partner_refresh_token';
export function getAccessToken() { return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS); }
export function getRefreshToken() { return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH); }
export function storePartnerTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
  setPartnerAccessTokenCookie(access);
}
export function clearPartnerTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem('partner-store');
  setPartnerAccessTokenCookie(null);
}
let inflight: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;
export function refreshSession() {
  if (!inflight) inflight = (async () => {
    const token = getRefreshToken();
    if (!token) return null;
    const response = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }) });
    if (response.status === 401) { clearPartnerTokens(); return null; }
    if (!response.ok) throw new Error('Unable to refresh partner session');
    const data = await response.json();
    if (!data.access_token || !data.refresh_token) throw new Error('Invalid session response');
    storePartnerTokens(data.access_token, data.refresh_token);
    return { accessToken: data.access_token as string, refreshToken: data.refresh_token as string };
  })().finally(() => { inflight = null; });
  return inflight;
}
