import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyAuthFailure,
  describeAuthFailure,
  isSessionInvalid,
  logAuthWarning,
  logSessionEnd,
  redact,
} from '@/lib/session-expiry';

/**
 * The rule under test: an operator reading the browser console must be able to
 * tell "the server rejected the session" from "the backend was unreachable",
 * and neither message may contain a credential.
 */

describe('classifyAuthFailure', () => {
  it('treats 401 and 403 as a rejected session', () => {
    expect(classifyAuthFailure({ status: 401 }).kind).toBe('unauthorized');
    expect(classifyAuthFailure({ status: 403 }).kind).toBe('unauthorized');
  });

  it('treats 429 as a rate limit, not an expiry', () => {
    expect(classifyAuthFailure({ status: 429 }).kind).toBe('rate_limited');
  });

  it('treats 5xx as a server failure, not an expiry', () => {
    expect(classifyAuthFailure({ status: 500 }).kind).toBe('server_error');
    expect(classifyAuthFailure({ status: 503 }).kind).toBe('server_error');
  });

  it('recognises the proxy "backend unreachable" shape as distinct from 5xx', () => {
    const failure = classifyAuthFailure({
      status: 502,
      code: 'BACKEND_UNAVAILABLE',
      path: '/api/v1/users/me',
    });
    expect(failure.kind).toBe('proxy_unavailable');
    expect(failure.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('treats a thrown fetch as a network failure', () => {
    const failure = classifyAuthFailure({
      thrown: new TypeError('Failed to fetch'),
      path: '/api/v1/auth/refresh',
    });
    expect(failure.kind).toBe('network');
    expect(failure.status).toBeUndefined();
  });

  it('treats an unparseable body as malformed', () => {
    expect(classifyAuthFailure({ status: 200, malformed: true }).kind).toBe(
      'malformed'
    );
  });

  it('treats a missing token as no_session', () => {
    expect(classifyAuthFailure({ noSession: true }).kind).toBe('no_session');
  });

  it('drops query strings from the logged path', () => {
    const failure = classifyAuthFailure({
      status: 401,
      path: '/api/v1/dependencies?cursor=abc123',
    });
    expect(failure.path).toBe('/api/v1/dependencies');
  });
});

describe('isSessionInvalid', () => {
  it('is true only for a rejected session', () => {
    expect(isSessionInvalid({ kind: 'unauthorized', status: 401 })).toBe(true);
    expect(isSessionInvalid({ kind: 'no_session' })).toBe(true);
  });

  it('is false for every transient failure', () => {
    for (const kind of [
      'rate_limited',
      'server_error',
      'proxy_unavailable',
      'network',
      'malformed',
      'client_error',
    ] as const) {
      expect(isSessionInvalid({ kind })).toBe(false);
    }
  });

  it('does not treat a resource-level 403 as a dead session', () => {
    expect(
      isSessionInvalid({ kind: 'unauthorized', status: 403, code: 'FORBIDDEN' })
    ).toBe(true);
    expect(
      isSessionInvalid({ kind: 'unauthorized', status: 403, code: 'PLAN_LIMIT' })
    ).toBe(false);
  });
});

describe('session diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes the failing status in the diagnostic', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSessionEnd('refresh', {
      kind: 'unauthorized',
      status: 401,
      path: '/api/v1/auth/refresh',
      code: 'TOKEN_EXPIRED',
    });
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('status=401');
    expect(message).toContain('kind=unauthorized');
    expect(message).toContain('code=TOKEN_EXPIRED');
    expect(message).toContain('path=/api/v1/auth/refresh');
  });

  it('says so explicitly when the failure was transient, not an expiry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSessionEnd('request', { kind: 'rate_limited', status: 429 });
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('status=429');
    expect(message).toContain('transient failure, not an expiry');
  });

  it('never logs an access token, refresh token, cookie or auth header', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXBhcnQ';
    logSessionEnd(
      'refresh',
      { kind: 'unauthorized', status: 401, path: '/api/v1/auth/refresh' },
      `Authorization: Bearer ${jwt}; cookie: reliastra_refresh_token=${jwt}`
    );
    const message = String(warn.mock.calls[0][0]);
    expect(message).not.toContain(jwt);
    expect(message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(message).toContain('[redacted]');
    expect(message).toContain('status=401');
  });

  it('keeps the non-fatal warning path secret-free too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logAuthWarning('bootstrap', { kind: 'server_error', status: 503 });
    expect(String(warn.mock.calls[0][0])).toContain('status=503');
  });

  it('describes a failure without ever needing the token', () => {
    expect(
      describeAuthFailure({ kind: 'network', path: '/api/v1/users/me' })
    ).toBe('kind=network path=/api/v1/users/me');
  });
});

describe('redact', () => {
  it('strips bearer tokens, JWTs, cookies and authorization headers', () => {
    expect(redact('Bearer abc.def.ghi')).toBe('Bearer [redacted]');
    expect(redact('authorization: Basic dXNlcjpwdw==')).toBe(
      'authorization: [redacted]'
    );
    expect(redact('cookie: session=secret')).toBe('cookie: [redacted]');
    expect(
      redact('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln')
    ).toBe('[redacted-jwt]');
  });

  it('returns undefined for empty input and bounds long strings', () => {
    expect(redact(undefined)).toBeUndefined();
    expect(redact(null)).toBeUndefined();
    expect(redact('x'.repeat(500))?.length).toBe(300);
  });
});
