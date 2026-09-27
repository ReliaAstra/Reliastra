import { describe, expect, it } from 'vitest';

import { buildAuthorizeUrl, newOAuthState } from '@/lib/github-oauth';

describe('GitHub authorize URL', () => {
  it('points at github.com with the public parameters only', () => {
    const url = buildAuthorizeUrl({
      client_id: 'Ov23testclientid',
      redirect_uri: 'https://reliastra.com/auth/github/callback',
      state: 'abc123',
    });
    expect(url.startsWith('https://github.com/login/oauth/authorize?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('client_id')).toBe('Ov23testclientid');
    expect(params.get('redirect_uri')).toBe('https://reliastra.com/auth/github/callback');
    expect(params.get('state')).toBe('abc123');
    expect(params.get('scope')).toContain('read:user');
    expect(params.get('scope')).toContain('user:email');
    // The secret never travels in a URL: URLs are logged, bodies are not.
    expect(url).not.toContain('secret');
  });

  it('mints unique states', () => {
    expect(newOAuthState()).not.toBe(newOAuthState());
  });
});
