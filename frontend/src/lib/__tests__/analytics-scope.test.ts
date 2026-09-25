import { describe, expect, it } from 'vitest';

import {
  isInternalSurfacePath,
  isNonProductionHostname,
  shouldTrackVisit,
} from '../analytics-scope';

/**
 * The scope rule behind the admin "Pageviews" counter.
 *
 * A miss here is silent in both directions: exclude one prefix too many and
 * real marketing traffic stops being counted, exclude too few and the team's
 * own dashboard reloads become "visitors". Both are pinned.
 */
describe('isInternalSurfacePath', () => {
  it('drops the control plane and every console surface', () => {
    for (const path of [
      '/admin',
      '/admin/growth',
      '/admin/audit?tab=x',
      '/dashboard',
      '/dependencies',
      '/incidents/inc_123',
      '/settings/billing',
      '/onboarding',
      '/agency',
      '/agency/clients/acme',
      '/portal/tok_123',
      '/partner/dashboard',
    ]) {
      expect(isInternalSurfacePath(path), path).toBe(true);
    }
  });

  it('keeps the public funnel counted', () => {
    for (const path of [
      '/',
      '/pricing',
      '/product',
      '/research',
      '/research/availability-record-audit',
      '/observatory',
      '/observatory/openai',
      '/about',
      '/partner',
      '/signup',
      '/login',
      '/checkout',
      '/contact',
      '/docs/quickstart',
    ]) {
      expect(isInternalSurfacePath(path), path).toBe(false);
    }
  });

  it('matches on segments, not on string prefixes', () => {
    // '/agency' is internal; '/agencies' is a separate, retired URL (410),
    // not a console surface, so it must not be swallowed by the '/agency' rule.
    expect(isInternalSurfacePath('/agency')).toBe(true);
    expect(isInternalSurfacePath('/agencies')).toBe(false);
    expect(isInternalSurfacePath('/agencyx')).toBe(false);
    expect(isInternalSurfacePath('/administrator')).toBe(false);
    expect(isInternalSurfacePath('/')).toBe(false);
    expect(isInternalSurfacePath('')).toBe(false);
    expect(isInternalSurfacePath(null)).toBe(false);
  });
});

describe('isNonProductionHostname', () => {
  it('treats dev, tunnel and preview hosts as non-visitors', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.0.4.19',
      '192.168.1.7',
      'mybox.local',
      'abc-3000.e2b.app',
      'try.cloudflare-1.trycloudflare.com',
      '',
    ]) {
      expect(isNonProductionHostname(host), host).toBe(true);
    }
  });

  it('still counts a host reached by a routable address or a real domain', () => {
    expect(isNonProductionHostname('reliastra.com')).toBe(false);
    expect(isNonProductionHostname('www.reliastra.com')).toBe(false);
    expect(isNonProductionHostname('8.8.8.8')).toBe(false);
  });
});

describe('shouldTrackVisit', () => {
  it('never reports from a preview deployment, whatever the route', () => {
    expect(shouldTrackVisit('/pricing', 'abc-3000.e2b.app')).toBe(false);
    expect(shouldTrackVisit('/admin', 'reliastra.com')).toBe(false);
    expect(shouldTrackVisit('/pricing', 'reliastra.com')).toBe(true);
  });
});
