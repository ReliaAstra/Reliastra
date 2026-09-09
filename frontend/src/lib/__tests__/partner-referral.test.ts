import { describe, expect, it } from 'vitest';
import {
  REFERRAL_COOKIE,
  REFERRAL_PUBLIC_COOKIE,
  applyReferralToRegisterPayload,
  getReferralCodeFromSearch,
  isWellFormedReferralCode,
  normalizeReferralCode,
  readReferralCodeFromCookieHeader,
  safeReferralDestination,
} from '@/lib/partner-referral';

describe('normalizeReferralCode', () => {
  it('accepts the production partner format', () => {
    expect(normalizeReferralCode('ADES-SC9C')).toBe('ADES-SC9C');
    expect(normalizeReferralCode('ades-sc9c')).toBe('ADES-SC9C');
    expect(normalizeReferralCode('  ALEX-7X2K  ')).toBe('ALEX-7X2K');
  });

  it('rejects malformed or dangerous values', () => {
    expect(normalizeReferralCode(null)).toBeNull();
    expect(normalizeReferralCode('')).toBeNull();
    expect(normalizeReferralCode('ab')).toBeNull();
    expect(normalizeReferralCode('../etc/passwd')).toBeNull();
    expect(normalizeReferralCode('ADES--SC9C')).toBeNull();
    expect(normalizeReferralCode('javascript:alert(1)')).toBeNull();
    expect(normalizeReferralCode('ADES SC9C')).toBeNull();
    expect(isWellFormedReferralCode('!!!!')).toBe(false);
  });
});

describe('safeReferralDestination', () => {
  it('allows relative in-site paths only', () => {
    expect(safeReferralDestination('/signup')).toBe('/signup');
    expect(safeReferralDestination('/pricing')).toBe('/pricing');
    expect(safeReferralDestination(null)).toBe('/');
    expect(safeReferralDestination('https://evil.example')).toBe('/');
    expect(safeReferralDestination('//evil.example')).toBe('/');
    expect(safeReferralDestination('/\\evil')).toBe('/');
    expect(safeReferralDestination('signup')).toBe('/');
  });
});

describe('cookie + register payload', () => {
  it('prefers the HttpOnly attribution cookie', () => {
    const header = `${REFERRAL_COOKIE}=ADES-SC9C; ${REFERRAL_PUBLIC_COOKIE}=OTHER-0000`;
    expect(readReferralCodeFromCookieHeader(header)).toBe('ADES-SC9C');
  });

  it('falls back to the public display cookie', () => {
    const header = `${REFERRAL_PUBLIC_COOKIE}=ADES-SC9C`;
    expect(readReferralCodeFromCookieHeader(header)).toBe('ADES-SC9C');
  });

  it('injects ref_code when the client omitted it', () => {
    const body = { email: 'a@b.com', password: 'secretsecret', full_name: 'Ada' };
    const next = applyReferralToRegisterPayload(
      body,
      `${REFERRAL_COOKIE}=ADES-SC9C`
    ) as { ref_code: string; email: string };
    expect(next.ref_code).toBe('ADES-SC9C');
    expect(next.email).toBe('a@b.com');
  });

  it('does not overwrite a well-formed client-supplied ref_code', () => {
    const body = { ref_code: 'ALEX-7X2K' };
    const next = applyReferralToRegisterPayload(
      body,
      `${REFERRAL_COOKIE}=ADES-SC9C`
    ) as { ref_code: string };
    expect(next.ref_code).toBe('ALEX-7X2K');
  });

  it('normalizes a lowercase client-supplied code', () => {
    const next = applyReferralToRegisterPayload(
      { ref_code: 'ades-sc9c' },
      null
    ) as { ref_code: string };
    expect(next.ref_code).toBe('ADES-SC9C');
  });

  it('reads ?ref= from a landing URL', () => {
    expect(getReferralCodeFromSearch('?ref=ADES-SC9C&utm_source=x')).toBe(
      'ADES-SC9C'
    );
    expect(getReferralCodeFromSearch('')).toBeNull();
  });
});
