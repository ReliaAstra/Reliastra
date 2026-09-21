# Public documentation namespace served by the API instead of the frontend

**Date:** 2026-09-21
**Severity:** High — every public documentation URL on the production domain was unreachable
**Status:** Root cause identified and guarded in-repo. **Production is still broken until the
host proxy config is reconciled** (see "What still has to happen").

## Symptom

`https://reliastra.com/docs/monitoring` — and every other documentation URL — returned the
API's generic error envelope instead of a page:

```json
{"error":{"code":"RESOURCE_NOT_FOUND","message":"Not Found","details":[],
          "request_id":"c73d2c74438c4a58b79027e986703370"}}
```

Confirmed live during this investigation, each returning that same envelope:

| URL | Result |
| --- | --- |
| `/docs` | `RESOURCE_NOT_FOUND` |
| `/docs/quickstart` | `RESOURCE_NOT_FOUND` |
| `/docs/concepts` | `RESOURCE_NOT_FOUND` |
| `/docs/monitoring` | `RESOURCE_NOT_FOUND` |
| `/docs/api` | `RESOURCE_NOT_FOUND` |
| `/docs/security` | `RESOURCE_NOT_FOUND` |

`sitemap.xml` advertises 13 documentation URLs (`/docs` plus the 12 guides in
`frontend/src/lib/docs/corpus.ts`). The six above were probed individually and all failed; the
remaining seven (`configuration`, `incidents`, `evidence`, `verification`, `cli`, `webhooks`,
`methodology`) were not individually probed but share the same URL prefix, so they fail by the
same mechanism. All 13 should be assumed down.

Healthy at the same time, so this was not a general outage: `/pricing`, `/observatory`,
`/robots.txt`, `/sitemap.xml` and `/openapi.json` all served correctly.

## Root cause

The error body is produced by the **Python backend**, not Next.js —
`backend/app/platform/web/errors.py` maps HTTP 404 to the code `RESOURCE_NOT_FOUND`. Next.js
would have rendered its own 404 page. So the request never reached the frontend: the edge proxy
was sending `/docs*` to FastAPI on port 8000.

FastAPI is configured with `docs_url="/api-docs"` and `redoc_url="/api-redoc"`
(`backend/app/bootstrap/app_factory.py`) precisely so the apex `/docs` namespace stays free for
the product documentation. It therefore serves **no `/docs` route at all**, and every request
under it falls through to the 404 handler. That is the exact shape observed.

The repository's `deploy/production/Caddyfile` was already correct — it proxies only `/v1/*`,
`/health*`, `/metrics*`, `/openapi.json*`, `/api-docs*` and `/api-redoc*` to the backend, and
carried a comment saying `/docs/*` must not be proxied. Two things made that insufficient:

1. **The claim was by omission.** Nothing routed `/docs` to Next.js; it merely wasn't routed
   anywhere else. Any stale rule claiming the prefix wins silently.
2. **The proxy config never ships.** `deploy/production/scripts/update.sh` resets the build tree
   to the deployed ref but states explicitly that "/opt config (.env.production, compose.yml,
   Caddyfile) is never touched". The proxy bind-mounts `/opt/reliastra/Caddyfile`, so the
   host copy — which still proxies `/docs*` to the API — has been running regardless of what the
   repository said. The repo and production had diverged, and no deploy could notice.

## Why nothing caught it

- **The smoke test probed one path.** `deploy/production/scripts/smoke-test.sh` checked
  `http://127.0.0.1:80` (the root) and the backend's `/openapi.json`. A vanished `/docs`
  namespace ships green, because `/` still renders.
- **CI never ran the frontend suite.** `frontend` had 24 test files and 330 tests behind
  `npm test` (`vitest run`), but no workflow invoked it — the `validate` job ran only ESLint and
  `tsc`. Those pass on a route table that nothing serves.
- **The tests assert declarations, not reachability.** The existing route and sitemap tests check
  that every guide *has* a path in `DOCS_ROUTES` and appears in the sitemap. All of that was
  true while the pages were unreachable. The defect lived in the gap between "declared" and
  "served", which nothing tested.

## Changes

**`deploy/production/Caddyfile`** — an explicit `handle /docs*` block proxying to
`reliastra-api:3000`, so the documentation namespace is claimed by an executable rule instead of
a comment.

**`deploy/production/scripts/smoke-test.sh`** — new step 3b requests `/docs` and
`/docs/quickstart` *through the proxy* and asserts three things: status 200, no
`RESOURCE_NOT_FOUND` in the body, and an actual `<html` document. The body checks matter because
a 200 from the wrong upstream would pass a status-only assertion.

**`deploy/production/scripts/update.sh`** — new step 1b diffs the live
`/opt/reliastra/Caddyfile` against the repository copy and refuses to deploy when they differ,
with `--allow-config-drift` as the escape hatch. Drift in the edge routing table can no longer
persist silently across releases.

**`.github/workflows/ci.yml`** — the `validate` job now runs `npm test`, so the 339 frontend
tests execute on every push.

**`frontend/src/lib/__tests__/docs-namespace-routing.test.ts`** — new, 9 tests. Parses the
`handle` blocks out of the real Caddyfile and asserts that `/docs` and every corpus guide reach
the Next.js upstream, that no published site route reaches the API upstream at all (the general
class of bug, not just this instance), that FastAPI's own console prefixes read from
`app_factory.py` cannot collide with the documentation namespace, that the API still receives the
paths it is meant to serve, and that the smoke test's docs coverage survives deletion.

## Verification performed

- `npx vitest run` in `frontend`: **26 files, 373 tests, all passing** (baseline
  before these changes: 24 files, 330 tests, all passing).
- The routing guard was checked against a deliberately broken config —
  `handle /docs*` → `reliastra-api:8000` with the explicit web claim removed. It
  failed 5 of 9 tests, naming `/docs*` and listing all 12 misrouted guides. The
  config was then restored and re-run green.
- `npm run lint`: 0 errors (4 pre-existing warnings, all in untouched files).
- `npx tsc --noEmit --skipLibCheck`: clean.
- `bash -n` on both modified shell scripts: clean. The smoke test's body-parsing
  logic was exercised in isolation against four fixtures — healthy HTML page
  (pass), the production 404 envelope (fail), a 200 carrying the API error body
  (fail), and a 200 with no HTML (fail).
- `.github/workflows/ci.yml` re-parsed as YAML; the `Test (frontend)` step is
  present.
- **`npm run build` succeeded and the built standalone server was started and
  requested over HTTP.** All twelve `/docs/<slug>.md` URLs returned 200 with
  `Content-Type: text/markdown`, the `Link … rel="canonical"` and
  `X-Robots-Tag: noindex` headers; `/docs/monitoring` still returns HTML;
  `/docs/nope.md` returns 404; `/llms-full.txt` serves 150,936 bytes containing
  the full corpus; `robots.txt` carries `/docs-md/`. The first build exposed a
  heading-level inversion in the renderer — at a nested level the guide title
  rendered at the same depth as its own sections — which is now fixed and
  asserted for levels 1–4.

**Not verified here:** `caddy validate` could not be run — no Caddy, Go or Docker
binary is available in this environment and only the npm registry is reachable,
so the edited Caddyfile was checked for brace balance and structure, not parsed
by Caddy itself. Run `caddy validate --config /opt/reliastra/Caddyfile` on the
host before reloading. The remaining seven documentation URLs were not probed
individually against production for the reason given above.

## Related defects found while investigating

Fixing the routing exposed three further problems with how the documentation
reaches a reader, all fixed in the same change.

**`/llms-full.txt` did not contain the documentation.** It published a
"Documentation map" of thirteen `- Label: URL` lines. `lib/docs/types.ts`
claimed the corpus "feeds … `llms-full.txt`", which was false — the route
imported `DOCS_NAV` (labels and hrefs), not `DOCS`. The endpoint rendered, was
well-formed, and simply omitted the thing it advertised. It now inlines all
twelve guides in full via `lib/docs/markdown.ts`, taking the file from a link
map to ~151 KB of actual product documentation.

**No plain-text form of a guide existed.** `/docs/<slug>.md` now serves one
guide as Markdown — `text/markdown`, `Link: rel="canonical"` to the HTML page,
`X-Robots-Tag: noindex` so the second URL cannot split the signals the guide is
earning. The handler lives at `/docs-md/<slug>` and is rewritten, because the App
Router will not hold a `route.ts` and a `page.tsx` in the same dynamic segment.
`/docs-md/` is disallowed in `robots.txt` so only the public `.md` URL is
crawlable.

**`Security` was the thinnest guide at 231 words.** Expanded to 751 with two new
sections — *In transit* and *Retention* — each statement read out of the code
rather than recalled: Fernet field encryption for dependency headers
(`app/platform/security/field_encryption.py`), prefix + SHA-256 storage for API
keys with scopes and expiry (`app/modules/api_keys/models.py`), bcrypt for
passwords, refresh-token rotation that revokes the family on reuse
(`app/modules/auth/service.py`), and the 365-day evidence window
(`app/modules/evidence/constants.py`). The retention section documents the drift
`app/config.py` records: the value was hard-coded at 90 while the docs said 365.

`Verification` (179 words) and `Incidents` (257) remain thin. They were not
expanded here because doing them properly means the same reading-out-of-the-code
pass, and a plausible number written from memory is worse than a short section.

## What still has to happen

The in-repo fix does not reach production by itself, because the proxy mounts the host's
`/opt/reliastra/Caddyfile`. To restore the documentation site:

```bash
# 1. On the host, compare and reconcile
diff -u /home/reliastra/reliastra/deploy/production/Caddyfile /opt/reliastra/Caddyfile
cp /home/reliastra/reliastra/deploy/production/Caddyfile /opt/reliastra/Caddyfile

# 2. Validate, then reload the proxy
docker exec reliastra-proxy caddy validate --config /etc/caddy/Caddyfile
docker compose -f /opt/reliastra/compose.yml up -d --force-recreate proxy

# 3. Confirm
curl -s https://reliastra.com/docs/monitoring | head -c 200   # expect HTML, not JSON
```

The new smoke test step will confirm this on the next deploy; until it is run manually, the
production `/docs` namespace remains down.

### One change could not be pushed

The GitHub App used by this session has no `workflows` permission, so GitHub
rejected the push that touched `.github/workflows/ci.yml`. The change is
preserved as `docs/diagnostics/2026-09-21-ci-frontend-tests.patch`; apply it with:

```bash
git apply docs/diagnostics/2026-09-21-ci-frontend-tests.patch
rm docs/diagnostics/2026-09-21-ci-frontend-tests.patch
```

It adds one step to the `validate` job, after the TypeScript check:

```yaml
      - name: Test (frontend)
        working-directory: frontend
        run: npm test
```

Until it lands, the 373 frontend tests — including both guards added here — do
not run in CI. That is the single most important follow-up in this change: the
routing guard only protects the site if something executes it.
