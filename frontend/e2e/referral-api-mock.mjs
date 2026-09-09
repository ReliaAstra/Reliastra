#!/usr/bin/env node
/**
 * Local stand-in for the partner-referral API used by Playwright.
 *
 * Endpoints the `/r/{code}` resolver and the signup flow actually call:
 *   GET  /v1/public/referral/:code
 *   POST /v1/auth/register
 *   POST /v1/auth/verify-otp
 *   POST /v1/partners/apply
 *   GET  /v1/partners/me
 *   GET  /v1/partners/dashboard
 *   GET  /v1/partners/referrals
 *
 * Everything else returns a harmless 200 so marketing pages don't 502.
 */
import http from 'node:http';

const PORT = Number(process.env.REFERRAL_MOCK_PORT || 18000);
const VALID = new Set(
  (process.env.REFERRAL_MOCK_VALID || 'ADES-SC9C')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
);

const clicks = new Map();
const registrations = [];
const referrals = [];
let partner = {
  partner_id: '11111111-1111-1111-1111-111111111111',
  referral_code: 'ADES-SC9C',
  referral_link: 'https://reliastra.com/r/ADES-SC9C',
  commission_rate: 30,
  status: 'active',
  created_at: new Date().toISOString(),
};

function send(res, status, body, extra = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'Authorization, Content-Type, X-Organization-ID, Reliastra-Organization, X-Request-ID, Idempotency-Key',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    ...extra,
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  const publicMatch = path.match(/^\/v1\/public\/referral\/([^/]+)\/?$/);
  if (req.method === 'GET' && publicMatch) {
    const code = decodeURIComponent(publicMatch[1]).trim().toUpperCase();
    if (!VALID.has(code)) {
      send(res, 200, { valid: false, referral_code: null, destination: '/' });
      return;
    }
    clicks.set(code, (clicks.get(code) || 0) + 1);
    const to = url.searchParams.get('to');
    const destination =
      to && to.startsWith('/') && !to.startsWith('//') && !to.includes('://')
        ? to
        : '/';
    send(res, 200, { valid: true, referral_code: code, destination });
    return;
  }

  if (req.method === 'GET' && path === '/__mock__/state') {
    send(res, 200, {
      clicks: Object.fromEntries(clicks),
      registrations,
      referrals,
      partner,
    });
    return;
  }

  if (req.method === 'POST' && path === '/__mock__/reset') {
    clicks.clear();
    registrations.length = 0;
    referrals.length = 0;
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && path === '/v1/auth/register') {
    const body = await readBody(req);
    const id = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const record = {
      email: body.email,
      full_name: body.full_name,
      ref_code: body.ref_code || null,
      user_id: id,
      org_id: orgId,
    };
    registrations.push(record);
    if (body.ref_code && VALID.has(String(body.ref_code).toUpperCase())) {
      referrals.push({
        referral_id: crypto.randomUUID(),
        status: 'signed_up',
        plan: 'free',
        masked_email: (body.email || 'x@y.z').replace(/^(.).*(@.*)$/, '$1***$2'),
        organization_name: `${body.full_name}'s Organization`,
        created_at: new Date().toISOString(),
        subscribed_at: null,
        ref_code: String(body.ref_code).toUpperCase(),
        referred_user_id: id,
        referred_org_id: orgId,
      });
    }
    send(res, 201, {
      user: { id, email: body.email, full_name: body.full_name, is_active: true, is_email_verified: false },
      organization: {
        id: orgId,
        name: `${body.full_name}'s Organization`,
        slug: `org-${id.slice(0, 8)}`,
        plan: 'free',
      },
      tokens: null,
      verification_required: true,
    });
    return;
  }

  if (req.method === 'POST' && path === '/v1/auth/verify-otp') {
    const body = await readBody(req);
    const prior = [...registrations].reverse().find((r) => r.email === body.email);
    send(res, 200, {
      message: 'Email verified. Welcome to Reliastra.',
      is_email_verified: true,
      user: {
        id: prior?.user_id || crypto.randomUUID(),
        email: body.email,
        full_name: prior?.full_name || 'Ada Tester',
        is_active: true,
        is_email_verified: true,
      },
      organization: prior
        ? {
            id: prior.org_id,
            name: `${prior.full_name}'s Organization`,
            slug: `org-${prior.user_id.slice(0, 8)}`,
            plan: 'free',
          }
        : null,
      tokens: {
        access_token: 'e2e-access',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
        expires_in: 900,
      },
    });
    return;
  }

  if (req.method === 'POST' && path === '/v1/partners/apply') {
    send(res, 201, partner);
    return;
  }

  if (req.method === 'GET' && path === '/v1/partners/me') {
    send(res, 200, partner);
    return;
  }

  if (req.method === 'GET' && path === '/v1/partners/dashboard') {
    send(res, 200, {
      referral_link: partner.referral_link,
      clicks: clicks.get(partner.referral_code) || 0,
      signups: referrals.length,
      active_paid_customers: 0,
      monthly_commission_minor: 0,
      pending_commission_minor: 0,
      payable_balance_minor: 0,
      in_transit_minor: 0,
      total_earned_minor: 0,
      total_paid_minor: 0,
      minimum_payout_minor: 5000,
      currency: 'USD',
    });
    return;
  }

  if (req.method === 'GET' && path === '/v1/partners/referrals') {
    send(res, 200, {
      items: referrals,
      page: 1,
      page_size: 20,
      total: referrals.length,
    });
    return;
  }

  if (req.method === 'GET' && (path === '/health' || path === '/health/live')) {
    send(res, 200, { status: 'ok' });
    return;
  }

  send(res, 200, { ok: true, mock: true, path });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`referral-api-mock listening on ${PORT}\n`);
});
