#!/usr/bin/env node
/**
 * Browser-free HTTP contract tests for `/r/{code}`.
 * Complements Playwright (`partner-referral.spec.ts`) when a Chromium
 * binary is not available in the environment.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const MOCK = process.env.REFERRAL_MOCK_URL ?? 'http://127.0.0.1:18000';
const VALID = 'ADES-SC9C';

let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function fetchRaw(path, opts = {}) {
  return fetch(`${BASE}${path}`, { redirect: 'manual', ...opts });
}

async function cookieMap(res) {
  const getSetCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : String(res.headers.get('set-cookie') ?? '').split(/,(?=\s*ra_ref)/);
  const out = {};
  for (const line of getSetCookie) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return { out, raw: getSetCookie.join('\n') };
}

async function main() {
  console.log(`partner-referral HTTP tests against ${BASE}`);

  // 1. Valid code → 302, cookies, not 404.
  {
    const res = await fetchRaw(`/r/${VALID}`);
    ok('valid code is 302', res.status === 302, `status=${res.status}`);
    ok('valid code is not 404', res.status !== 404);
    const loc = res.headers.get('location') ?? '';
    ok('valid code leaves /r/', !loc.includes('/r/'), loc);
    const { out, raw } = await cookieMap(res);
    ok('sets ra_ref', out.ra_ref === VALID, JSON.stringify(out));
    ok('sets ra_ref_pub', out.ra_ref_pub === VALID);
    ok('HttpOnly on attribution cookie', /ra_ref=ADES-SC9C;.*HttpOnly/is.test(raw));
    ok('SameSite=Lax', /SameSite=Lax/i.test(raw));
    ok('Path=/', /Path=\//i.test(raw));
    const body = await res.text();
    ok('body is not Signal lost', !/Signal\s+lost/i.test(body));
  }

  // 2. Follow valid code → landing with ?ref=
  {
    const res = await fetch(`${BASE}/r/${VALID}`, { redirect: 'follow' });
    ok('followed valid code is not 404', res.status !== 404 && res.status < 400, `status=${res.status}`);
    const html = await res.text();
    ok('followed valid code is not Signal lost', !/Signal\s+lost/i.test(html));
    ok('landing HTML is RELIASTRA', /RELIASTRA/i.test(html));
  }

  // 3. Valid → signup via ?to=/signup
  {
    const res = await fetchRaw(`/r/${VALID}?to=/signup`);
    ok('to=/signup is 302', res.status === 302);
    const loc = res.headers.get('location') ?? '';
    ok('to=/signup lands on /signup', /\/signup/.test(loc), loc);
    ok('to=/signup keeps ref=', /ref=ADES-SC9C/.test(loc), loc);
  }

  // 4. Invalid well-formed code → unavailable, no cookie
  {
    const res = await fetchRaw('/r/NOPE-0000');
    ok('invalid code is 302', res.status === 302, `status=${res.status}`);
    const loc = res.headers.get('location') ?? '';
    ok('invalid code → referral-unavailable', /referral-unavailable/.test(loc), loc);
    const { raw } = await cookieMap(res);
    ok('invalid code does not set ra_ref', !/ra_ref=NOPE-0000/.test(raw));
  }

  // 5. Malformed code → unavailable, not Signal lost
  {
    const res = await fetch(`${BASE}/r/not.a.code`, { redirect: 'follow' });
    ok('malformed is not 404', res.status !== 404, `status=${res.status}`);
    const html = await res.text();
    ok('malformed is not Signal lost', !/Signal\s+lost/i.test(html));
    ok('malformed shows branded unavailable', /not active/i.test(html));
  }

  // 6. /r with no code
  {
    const res = await fetchRaw('/r');
    ok('/r is redirect', res.status === 302 || res.status === 308, `status=${res.status}`);
    const loc = res.headers.get('location') ?? '';
    ok('/r → unavailable', /referral-unavailable/.test(loc), loc);
  }

  // 7. unavailable page itself
  {
    const res = await fetch(`${BASE}/referral-unavailable`);
    ok('unavailable page is 200', res.status === 200, `status=${res.status}`);
    const html = await res.text();
    ok('unavailable is not Signal lost', !/Signal\s+lost/i.test(html));
    ok('unavailable has home CTA', /Return to RELIASTRA/i.test(html));
  }

  // 8. Click counting (mock)
  try {
    await fetch(`${MOCK}/__mock__/reset`, { method: 'POST' });
    await fetchRaw(`/r/${VALID}`);
    await fetchRaw(`/r/${VALID}`);
    const state = await (await fetch(`${MOCK}/__mock__/state`)).json();
    ok('click count increments', (state.clicks?.[VALID] ?? 0) >= 2, JSON.stringify(state.clicks));
  } catch (err) {
    ok('click count increments', false, String(err));
  }

  // 9. Register proxy injects ref_code from cookie
  {
    const email = `http-ref-${Date.now()}@example.com`;
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `ra_ref=${VALID}; ra_ref_pub=${VALID}`,
      },
      body: JSON.stringify({
        email,
        password: 'SecurePass1!',
        full_name: 'Ada Referred',
      }),
    });
    ok('register accepted or proxied', res.status === 201 || res.status === 200 || res.status === 502, `status=${res.status}`);
    try {
      const state = await (await fetch(`${MOCK}/__mock__/state`)).json();
      const row = (state.registrations || []).find((r) => r.email === email);
      ok('register attributed ref_code', row?.ref_code === VALID, JSON.stringify(row));
      ok(
        'partner referral row created',
        (state.referrals || []).some((r) => r.ref_code === VALID && r.referred_org_id === row?.org_id)
      );
    } catch (err) {
      ok('register attributed ref_code', false, String(err));
    }
  }

  // 10. Generic 404 still exists for unknown pages (regression: we didn't disable 404)
  {
    const res = await fetch(`${BASE}/this-path-does-not-exist-xyz`);
    ok('unknown path still 404s', res.status === 404, `status=${res.status}`);
    const html = await res.text();
    ok('unknown path still uses Signal lost', /Signal\s+lost/i.test(html));
  }

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
