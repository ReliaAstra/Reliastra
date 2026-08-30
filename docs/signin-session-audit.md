# Reliastra — Sign-in / Session Audit (customer · partner · admin)

**Branch:** `arena/01a0548e-reliastra` (base `77f51e6`)
**Date:** 2026-08-30
**Scope:** Customer sign-in → dashboard, Partner sign-in → partner dashboard, Admin sign-in → admin console. Session lifecycle, UX, and bugs. Audit first — no fixes applied.

---

## 1. Method

Static review of the three auth surfaces plus **dynamic verification**:

| Check | Result |
|---|---|
| `npx tsc --noEmit` (frontend) | ✅ clean |
| `npx eslint .` (frontend) | ❌ 1 error, 5 warnings (see **F-6**) |
| Backend auth unit tests (`test_auth_service`, `test_admin_auth`, `test_auth_token_family`, `test_admin_control_plane`) | ✅ 28 passed |
| Backend integration auth tests | ❌ 1 failure (`test_admin_authorization_server_side_enforcement`, see **F-7**) |
| Live end-to-end (Next dev server :3000 + audit stub of the `/v1/*` contract on :8000) | ✅ flows exercised via real HTTP through the Next proxy |

The audit stub (`backend/audit/stub_backend.py`) reproduces the backend's **exact wire contract** (error envelope `{error:{code,message,details}}`, `TokenResponse`, admin JWT family `aud=reliastra-admin` signed with `ADMIN_TOKEN_SECRET`) so the findings below reflect the real request/response shapes, not guesses.

---

## 2. Findings

| # | Severity | Surface | Summary |
|---|---|---|---|
| F-1 | **High** | Customer login | Error mapping reads a field that never exists (`data.detail`) — every failure degrades to "Email or password is incorrect", and the email-verification hard gate is invisible to customers. |
| F-2 | Medium | Customer signup | Same `data.detail` mistake — the "account already exists" branch is dead code. |
| F-3 | Medium | Customer → verify | Magic-link success screen sends verified customers to the **partner** sign-in (`/?page=login`), which auto-activates them as a partner. |
| F-4 | Medium | Partner | Post-login `/api/auth/me` failure leaves the user on a **blank screen** (authState=authenticated, user=null). |
| F-5 | Medium | Admin | Admin **refresh cookie** max-age is hard-capped at 1 hour while the backend refresh token lives 24 h — `adminRefreshMaxAgeSeconds()` exists but is never used. |
| F-6 | Low | Build/CI | `npm run lint` fails on a React-Compiler memoization error (`clients.tsx`). |
| F-7 | Medium | Backend tests | Admin auth test is not green: anonymous admin request returns 403 (console disabled) instead of 401. |

Verified-correct behaviors are summarised in §4.

---

## 3. Detailed findings

### F-1 — Customer login never shows real backend errors (High)

`frontend/src/app/login/page.tsx:49`

```ts
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  setError(ERRORS[data?.detail ?? ''] ?? 'Email or password is incorrect.');
  return;
}
```

The backend (and the proxied response, verified live) answers **every** auth failure as:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password", "details": [] } }
```

There is **no top-level `detail` field** (see `backend/app/core/exceptions.py::error_payload`). Therefore `data?.detail` is always `undefined`, and `ERRORS[undefined]` is always `undefined`, so:

1. `ERRORS['User account is disabled']` is **dead code** — a disabled account shows "Email or password is incorrect." instead of "This account has been deactivated. Contact support."
2. The **email-verification hard gate is invisible** on the customer surface. A new customer signs up (`/register` now issues `tokens: null`, `verification_required: true`) and is emailed a 6-digit code. If they come back to `/login` and enter correct credentials, the backend returns **403** `EMAIL_NOT_VERIFIED` ("Verify your email address to sign in. We've sent a 6-digit code…") — but the customer is shown **"Email or password is incorrect."** with no path to enter the code.

This is a live, reproducible funnel break: the customer believes their password is wrong, and the login page has no verify-email affordance. (The **partner** surface handles this correctly via `readApiError` + `isEmailNotVerified` + `VerifyOtpStep` — see `page-login.tsx:100-113` and `api-error.ts`.)

**Fix:** read the envelope — `const { error } = data; if (error?.code === 'FORBIDDEN' && error.details?.some(d => d.issue === 'EMAIL_NOT_VERIFIED')) { route to /verify-email } ; setError(error?.message …)` — mirroring `readApiError()` in `lib/api-error.ts`.

### F-2 — Customer signup duplicate-email branch is dead (Medium)

`frontend/src/app/signup/page.tsx:54-58`

```ts
const detail = data?.detail ?? '';
setError(
  /already/i.test(detail)
    ? 'An account with this email already exists. Sign in instead.'
    : detail || 'Registration failed. Try again in a moment.'
);
```

A 409 `CONFLICT` "Email is already registered" arrives as `{error:{message:…}}`, so `data.detail` is `undefined` and the `/already/i` test can never match. Users are shown the generic "Registration failed. Try again in a moment." instead of "already exists → sign in". Same root cause as F-1.

**Fix:** switch on `res.status === 409` or `data.error.message`, as the partner signup already does (`page-signup.tsx` uses `readApiError` + `status === 409`).

### F-3 — Verified customer routed to partner sign-in, then auto-activated as partner (Medium)

`frontend/src/app/verify-email/page.tsx:98`

```tsx
<Link href="/?page=login">Go to sign in</Link>
```

After a **customer** verifies via the emailed magic link, the success screen's "Go to sign in" points at `/?page=login`, which is the **partner** login (`app/page.tsx` maps `?page=login` → `PageLogin`). The partner login then calls `/api/partners/me` and, on 404, **auto-activates the customer as a partner** (`page-login.tsx` `completeSignIn`). A customer who follows the success CTA is silently funnelled into the partner network instead of their own console.

Note the same page's OTP-code path (`onVerified`) correctly persists tokens and links to `/dashboard`; only the magic-link branch has the wrong destination.

**Fix:** point the magic-link success CTA at `/login` (customer sign-in), and keep the OTP path on `/dashboard`.

### F-4 — Partner login: blank screen if `/api/auth/me` fails (Medium)

`frontend/src/components/partner/public/page-login.tsx:49-57` (and `frontend/src/app/page.tsx` render logic)

```ts
const meRes = await fetch('/api/auth/me', …);
if (meRes.ok) { store.setUser({…}); }
store.setAuthStatus('authenticated');   // set even when meRes failed
…
navigate('dashboard');
```

If `/api/auth/me` fails (transient 5xx, dropped request) but the subsequent `/api/partners/me` path still reaches `navigate('dashboard')`, the store ends in `authStatus === 'authenticated'` with `user === null`. In `app/page.tsx` the render path then hits:

```ts
if (authStatus === 'authenticated' && user) return <DashboardLayout />;
if (isDashboardRoute(currentPage, true)) return null;   // ← blank screen
```

The redirect effect only reacts to `'unauthenticated'`, so nothing recovers it. The user sees a permanently blank page with a valid session.

**Fix:** only set `'authenticated'` after `meRes.ok` (or `setUser` is non-null); otherwise treat it as unauthenticated and land on `login`. Belt-and-braces: in `app/page.tsx`, render a loading/redirect state instead of `null` when `authStatus === 'authenticated' && !user`.

### F-5 — Admin refresh cookie max-age capped at 1 h, token valid 24 h (Medium)

`frontend/src/lib/admin-backend-proxy.ts:461` and `frontend/src/lib/admin-session-gate.ts:35`

```ts
response.cookies.set(ADMIN_REFRESH_COOKIE, refreshToken, {
  ...attrs,
  maxAge: Math.max(expiresInSeconds, 60 * 60),   // 3600s = 1 hour
});
```

The admin refresh token is minted for `ADMIN_REFRESH_TOKEN_EXPIRE_DAYS` (default **1 day**, `backend/app/config.py:737`), but the cookie that carries it is set with a **1-hour** max-age. `adminRefreshMaxAgeSeconds()` (which reads `ADMIN_REFRESH_TOKEN_EXPIRE_DAYS`) is defined in `admin-session-cookie.ts:37` but **never called**.

Consequence (verified live): the login response sets `reliastra_admin_refresh … Max-Age=3600` while the JWT inside carries `exp` 86400 s out. After 1 hour the browser silently drops the refresh cookie, so the operator is forced to re-authenticate even though the server-side session is still valid for 24 h. Inconsistent TTLs also mean the "remember me for a day" intent never materialises.

**Fix:** use `adminRefreshMaxAgeSeconds()` for the refresh cookie in both setters (and make the access cookie use `adminAccessMaxAgeSeconds()` consistently).

### F-6 — Frontend lint fails (build/CI gate) (Low)

`frontend/src/components/dashboard/pages/clients.tsx:295` — `react-hooks/preserve-manual-memoization` error (React Compiler): the `useMemo` deps `[data?.clients, search, statusFilter]` don't match the inferred dependency `data.clients`. `npm run lint` exits non-zero. Not a sign-in bug, but it blocks the CI lint gate described in `README.md` (`make lint`). (5 additional `@next/next/no-location-assign-relative-destination` warnings in `landing/theme.ts` and `onboarding/EvidenceIntroStep.tsx`.)

### F-7 — Backend admin-auth test not green (Medium)

`backend/tests/integration/test_supabase_auth_architecture.py::test_admin_authorization_server_side_enforcement` (assertion at ~line 220) **fails deterministically**:

```
assert res.status_code == 401
E   assert 403 == 401
```

Root cause: the anonymous request is asserted **before** `make_admin_headers()` (which configures `ADMIN_USERNAME/PASSWORD/TOKEN_SECRET`) runs. Until then `settings.admin_console_enabled` is `False`, and `require_system_admin` (`backend/app/modules/admin/guards.py:31-32`) raises `ForbiddenException("Admin console is disabled")` → **403**, not the expected 401. The three "DENIED" assertions (anonymous / normal-user JWT / `is_system_admin=True` JWT) would all fail; the test stops at the first.

This is worth fixing regardless: it means the suite cannot currently be used to catch regressions in the admin session boundary, and it exposes a semantic question — a disabled console answers 403 (which the frontend admin client maps to "denied" and does **not** redirect) rather than 401 ("expired" → redirect to `/admin/login`). In the disabled case the Next proxy already fails closed and redirects, so the frontend is safe, but the status-code contract should be made explicit.

**Fix (test):** seed the admin credential (e.g. call `make_admin_headers` once, or set `ADMIN_*` on `settings`) at the start of the test. **Fix (product, optional):** decide and document whether "console disabled" is 401 or 403 and keep it consistent across `guards.py` and the `auth_router` handlers.

---

## 4. What is verified working (no change needed)

**Customer sign-in → dashboard**
- Login POSTs through `/api/v1/auth/login` → backend; on success stores the token pair (canonical + legacy keys) and mirrors the access token into the same-origin cookie (`session-storage.ts`, `auth-cookie.ts`), then routes to `/dashboard`.
- `/dashboard` bootstrap (`providers.tsx` → `lib/dashboard/api.ts::bootstrapSession`) is single-flight (`restorePromise`), refresh-token-gated, StrictMode-guarded (`bootstrapped` ref), and no longer renders demo data when unauthenticated (routes to `/login`).
- `next` param on `/login` is sanitised: rejects `/admin*`, `//` (protocol-relative) — verified by inspection.
- Session-expiry path clears only the customer-console keys (`clearCustomerTokens`) and routes to `/login?expired=1`.

**Partner sign-in → partner dashboard**
- Shared token store + single-flight refresh (`lib/auth-refresh.ts`) shared across customer/partner/admin — prevents the "parallel 401 replays the rotated token → family revoked" failure.
- Partner login **correctly** handles the email-verification gate (`isEmailNotVerified` → `VerifyOtpStep`).
- `/api/partners/*` catch-all proxy is namespace-scoped and encodes segments (`route.ts`).
- Logout revokes the refresh token server-side (best-effort) then clears tokens (`partnerApi.logout`).

**Admin sign-in → admin console**
- Dedicated operator credentials (`ADMIN_USERNAME/PASSWORD`), constant-time compare, rate-limited (10/15 min), audited — `backend/app/modules/admin/auth_router.py`.
- Admin JWT family is fully isolated (`aud=reliastra-admin`, `type=admin_access|admin_refresh`, `ADMIN_TOKEN_SECRET`) and rejected on every customer/partner surface; customer/partner/API-key tokens are rejected on admin (`guards.py`, `dependencies.py`). Verified live: `GET /api/v1/admin/overview` → 403 "Admin API is not available on this surface."
- Tokens live **only** in HttpOnly cookies (never localStorage); browser JS never sees them (`admin-api.ts`).
- CSRF marker (`x-admin-request: 1`) enforced on every admin route incl. login/logout (verified live: login without marker → 403).
- Server-side gate (`proxy.ts`): unauthenticated `/admin` → 307 `/admin/login`; valid cookies → 200; expired access + valid refresh → silent rotation. Verified live.
- Admin `next` sanitisation rejects `/admin/login` bounces and non-`/admin` destinations.

---

## 5. Recommended order of fixes

1. **F-1** (customer login error/verification routing) — highest customer impact.
2. **F-2** (customer signup duplicate-email message) — same one-line pattern.
3. **F-5** (admin refresh cookie TTL) — one-line change × 2 setters.
4. **F-3** (verify-email success CTA destination).
5. **F-4** (partner blank-screen resilience).
6. **F-7** (make admin auth test green) and **F-6** (lint error).

No code has been changed in this audit; findings are reported for triage before any fix is applied.
