import { describe, expect, it } from 'vitest';
import {
  alertNotificationBody,
  alertNotificationTag,
  alertNotificationTitle,
  nextAlertCursor,
  notificationSupport,
  readAlertCursor,
} from '@/lib/support-alerts';
import type { SupportAlertItem, SupportAlertsResponse } from '@/types/admin';

function item(overrides: Partial<SupportAlertItem> = {}): SupportAlertItem {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    ticket_number: 'FB-1234ABCD',
    subject: 'Monitor shows Responding, vendor reports an outage',
    requester_email: 'ada@example.com',
    requester_name: 'Ada Lovelace',
    category: 'monitoring',
    priority: 'normal',
    source: 'console_email',
    created_at: '2026-09-21T10:00:00Z',
    admin_url: 'http://localhost:3000/admin/support/11111111-1111-1111-1111-111111111111',
    ...overrides,
  };
}

function response(overrides: Partial<SupportAlertsResponse> = {}): SupportAlertsResponse {
  return {
    server_time: '2026-09-21T10:05:00Z',
    since: '2026-09-21T09:55:00Z',
    new_count: 1,
    awaiting_reply_count: 3,
    highest_priority: 'normal',
    latest: [item()],
    ...overrides,
  };
}

describe('support alert cursor', () => {
  it('advances to the server clock so the same email is never announced twice', () => {
    expect(nextAlertCursor('2026-09-21T09:55:00Z', response())).toBe('2026-09-21T10:05:00Z');
  });

  it('never moves the cursor backwards, even if the server echoes an older value', () => {
    expect(
      nextAlertCursor('2026-09-21T10:30:00Z', response({ server_time: '2026-09-21T10:00:00Z' }))
    ).toBeNull();
  });

  it('ignores an unparseable timestamp rather than parking the cursor on bad data', () => {
    expect(nextAlertCursor(null, response({ server_time: 'not-a-date', since: '' }))).toBeNull();
  });

  it('has no stored cursor outside the browser (SSR and tests)', () => {
    // The module is imported by a client component that Next also renders on
    // the server; touching localStorage there would throw.
    expect(readAlertCursor()).toBeNull();
  });
});

describe('support alert notification copy', () => {
  it('leads with the ticket when a single email arrives', () => {
    expect(alertNotificationTitle(response())).toBe('FB-1234ABCD - new support email');
  });

  it('counts the arrivals when several land together', () => {
    const batch = response({
      new_count: 3,
      latest: [item(), item({ id: 'b', ticket_number: 'FB-2' }), item({ id: 'c', ticket_number: 'FB-3' })],
    });
    expect(alertNotificationTitle(batch)).toBe('3 new support emails');
    expect(alertNotificationBody(batch)).toContain('(+2 more)');
  });

  it('names the requester and falls back to the address when there is no name', () => {
    expect(alertNotificationBody(response())).toBe(
      'Ada Lovelace: Monitor shows Responding, vendor reports an outage'
    );
    expect(
      alertNotificationBody(
        response({ latest: [item({ requester_name: null, subject: 'Payout missing' })] })
      )
    ).toBe('ada@example.com: Payout missing');
  });

  it('still says something useful when the payload carries no rows', () => {
    expect(alertNotificationBody(response({ latest: [] }))).toBe(
      'Open the support inbox to read it.'
    );
  });

  it('tags each notification per ticket so one ticket never stacks twice', () => {
    expect(alertNotificationTag(item())).toBe(
      'reliastra-support-11111111-1111-1111-1111-111111111111'
    );
  });
});

describe('notification support', () => {
  it('reports unsupported rather than throwing when there is no browser Notification API', () => {
    expect(notificationSupport()).toBe('unsupported');
  });
});
