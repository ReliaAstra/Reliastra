import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';

process.env.ADMIN_TOKEN_SECRET =
  'test-secret-that-is-long-enough-for-the-gate-123456';

function b64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function mintAccess(): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      aud: 'reliastra-admin',
      type: 'admin_access',
      username: 'tester',
      sub: 'tester-id',
      jti: 'test-jti',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
  );
  const sig = createHmac('sha256', process.env.ADMIN_TOKEN_SECRET as string)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payload}.${sig}`;
}

function call(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const req = new NextRequest('http://localhost/api/email-render', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-request': '1',
      cookie: `reliastra_admin_access=${mintAccess()}`,
      ...headers,
    } as Record<string, string>,
    body: JSON.stringify(body),
  });
  return POST(req) as unknown as Promise<Response>;
}

const INTERNAL_VARS = {
  organisation_name: 'Meridian Fintech',
  severity: 'critical',
  component: 'worker',
  environment: 'production',
  alert_kind: 'queue_backlog',
  alert_title: 'Backlog growing',
  detected_at: '2026-03-11T04:12:07Z',
  detail: 'Depth 9000.',
  facts: 'depth: 9000',
};

describe('POST /api/email-render', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env.ADMIN_TOKEN_SECRET =
      'test-secret-that-is-long-enough-for-the-gate-123456';
  });

  it('rejects requests without the admin marker', async () => {
    const req = new NextRequest('http://localhost/api/email-render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `reliastra_admin_access=${mintAccess()}`,
      },
      body: JSON.stringify({ class_id: 'internal_ops', variables: INTERNAL_VARS }),
    });
    const res = (await POST(req)) as unknown as Response;
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated sessions', async () => {
    const req = new NextRequest('http://localhost/api/email-render', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-request': '1' },
      body: JSON.stringify({ class_id: 'internal_ops', variables: INTERNAL_VARS }),
    });
    const res = (await POST(req)) as unknown as Response;
    expect(res.status).toBe(401);
  });

  it('renders a class with live values', async () => {
    const res = await call({ class_id: 'internal_ops', variables: INTERNAL_VARS });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { subject: string; html: string; text: string };
    expect(payload.subject).toBe('[critical] worker — Backlog growing');
    expect(payload.html).toContain('RELIASTRA');
    expect(payload.html).not.toContain('{{');
    expect(payload.text).toContain('Backlog growing');
  });

  it('names missing required fields', async () => {
    const res = await call({ class_id: 'internal_ops', variables: { severity: 'critical' } });
    expect(res.status).toBe(422);
    const payload = (await res.json()) as { fields: string[] };
    expect(payload.fields).toContain('component');
    expect(payload.fields).toContain('facts');
  });

  it('rejects unknown classes', async () => {
    const res = await call({ class_id: 'nope', variables: {} });
    expect(res.status).toBe(404);
  });

  it('rejects unparseable field values with the field name', async () => {
    const res = await call({
      class_id: 'internal_ops',
      variables: { ...INTERNAL_VARS, detected_at: 'eventually' },
    });
    expect(res.status).toBe(422);
    const payload = (await res.json()) as { fields: string[] };
    expect(payload.fields).toEqual(['detected_at']);
  });
});
