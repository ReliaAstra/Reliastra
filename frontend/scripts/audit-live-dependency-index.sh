#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Live audit of the public dependency index: SEO indexability + LLM indexability.
#
# Companion to docs/public-dependency-index-seo-llm-audit.md. Every check is a
# plain GET, spaced 400ms apart. Nothing is written, posted or authenticated.
#
#   bash scripts/audit-live-dependency-index.sh
#   bash scripts/audit-live-dependency-index.sh --base https://reliastra.com
#   bash scripts/audit-live-dependency-index.sh --api https://api.reliastra.com
#   bash scripts/audit-live-dependency-index.sh --load        # opt-in burst test (C3)
#
# Exit code: 0 = no critical failures, 1 = at least one CRIT, 2 = could not run.
# Dependencies: bash, curl. Optional: xmllint (nicer sitemap parsing), python3
# (robots.txt first-match check). Both are probed and skipped if absent.
# ---------------------------------------------------------------------------

BASE="https://reliastra.com"
API="https://api.reliastra.com"
LOAD=0
DELAY=0.4
MAX_RECORDS=5
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

CRIT=0; HIGH=0; MED=0; PASS=0
C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
[ -t 1 ] || { C_RED=""; C_YEL=""; C_GRN=""; C_DIM=""; C_OFF=""; }

while [ $# -gt 0 ]; do
  case "$1" in
    --base)     BASE="${2%/}"; shift 2 ;;
    --api)      API="${2%/}"; shift 2 ;;
    --load)     LOAD=1; shift ;;
    --max)      MAX_RECORDS="$2"; shift 2 ;;
    -h|--help)  sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

crit() { printf '%s[CRIT]%s %s\n' "$C_RED" "$C_OFF" "$1"; CRIT=$((CRIT+1)); }
high() { printf '%s[HIGH]%s %s\n' "$C_YEL" "$C_OFF" "$1"; HIGH=$((HIGH+1)); }
med()  { printf '%s[MED ]%s %s\n' "$C_YEL" "$C_OFF" "$1"; MED=$((MED+1)); }
ok()   { printf '%s[ ok ]%s %s\n' "$C_GRN" "$C_OFF" "$1"; PASS=$((PASS+1)); }
note() { printf '%s[ .. ]%s %s\n' "$C_DIM" "$C_OFF" "$1"; }
sect() { printf '\n%s== %s ==%s\n' "$C_DIM" "$1" "$C_OFF"; }
pace() { sleep "$DELAY"; }

# fetch <url> <outfile> -> writes headers to <outfile>.hdr, body to <outfile>
fetch() {
  curl -sS -m 30 -L --compressed -A "reliastra-index-audit/1.0 (+https://reliastra.com)" \
    -D "$1.hdr" -o "$1" "$2" 2>"$1.err"
  echo "$?"
}
hdr() { grep -i "^$1:" "$2" 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r'; }
# Absolute URLs found in sitemap.xml/HTML are re-pointed at --base so a staging or
# preview host can be audited without touching production. An origin mismatch is
# itself reported (H4: a non-production host advertising production URLs).
to_base() {
  case "$1" in
    "$BASE"/*) printf '%s' "$1" ;;
    http*://*) printf '%s%s' "$BASE" "$(printf '%s' "$1" | sed -E 's#^https?://[^/]+##')" ;;
    /*)        printf '%s%s' "$BASE" "$1" ;;
    *)         printf '%s/%s' "$BASE" "$1" ;;
  esac
}
origin_of() { printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*#\1#'; }
status_of() { head -1 "$1.hdr" 2>/dev/null | awk '{print $2}'; }
body() { sed -e 's/<script[^>]*>[^<]*<\/script>//g' "$1" 2>/dev/null; }

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }

echo "Public dependency index — live audit"
echo "  site: $BASE"
echo "  api : $API"
echo "  time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
[ "$LOAD" = 1 ] && echo "  mode: includes opt-in burst test (consumes real rate-limit budget)"

# ── 0 · reachability ───────────────────────────────────────────────────────
sect "0 · reachability"
code=$(fetch "$TMP/home" "$BASE/")
if [ "$code" != 0 ] || [ "$(status_of "$TMP/home")" != 200 ]; then
  crit "GET $BASE/ failed (curl=$code http=$(status_of "$TMP/home")) — nothing below can be trusted."
  sed -n '1,5p' "$TMP/home.err" 2>/dev/null
  echo; echo "CRIT=$CRIT HIGH=$HIGH MED=$MED PASS=$PASS"; exit 1
fi
ok "GET / → 200"

# ── 1 · robots.txt (C6) ────────────────────────────────────────────────────
sect "1 · robots.txt — crawler + LLM-agent policy"
fetch "$TMP/robots" "$BASE/robots.txt" >/dev/null; pace
if [ "$(status_of "$TMP/robots")" != 200 ]; then
  crit "GET /robots.txt → $(status_of "$TMP/robots") (expected 200)"
else
  ok "GET /robots.txt → 200"
  grep -qi "^Sitemap:" "$TMP/robots" && ok "robots.txt declares a Sitemap:" \
    || crit "robots.txt has no Sitemap: line — crawlers cannot discover sitemap.xml"
  grep -qiE "^Disallow: /observatory" "$TMP/robots" \
    && crit "robots.txt DISALLOWS /observatory — the public dependency index is not crawlable" \
    || ok "/observatory is not disallowed"

  # Rule order: Next.js emits Allow lines before Disallow lines. RFC 9309
  # (Google/Bing) resolves by most-specific match; Python's robotparser on
  # <=3.12 and its ports resolve by FIRST match in file order, so a leading
  # "Allow: /" silently defeats every Disallow below it.
  allow_ln=$(grep -in "^Allow:" "$TMP/robots" | head -1 | cut -d: -f1)
  dis_ln=$(grep -in "^Disallow:" "$TMP/robots" | head -1 | cut -d: -f1)
  if [ -n "$allow_ln" ] && [ -n "$dis_ln" ] && [ "$allow_ln" -lt "$dis_ln" ]; then
    crit "C6: 'Allow:' (line $allow_ln) precedes 'Disallow:' (line $dis_ln). First-match
       robots interpreters (python urllib.robotparser <=3.12 and ports used by many
       LLM/agent crawlers) will treat /admin, /api, /dashboard, /reports/{token} as ALLOWED."
  elif [ -n "$dis_ln" ]; then
    ok "Disallow rules precede any blanket Allow (safe under both interpretations)"
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$BASE/robots.txt" <<'PY'
import sys, urllib.request, urllib.robotparser
url = sys.argv[1]
try:
    raw = urllib.request.urlopen(url, timeout=20).read().decode('utf-8', 'replace')
except Exception as e:
    print(f"       (robotparser check skipped: {e})"); sys.exit(0)
p = urllib.robotparser.RobotFileParser(); p.parse(raw.splitlines())
print(f"       python {sys.version.split()[0]} robotparser view:")
leak = []
for path in ['/observatory', '/observatory/openai', '/admin', '/admin/login',
             '/api/v1/vendors', '/dashboard', '/reports/some-token', '/checkout', '/login']:
    allowed = p.can_fetch('*', path)
    want_public = path.startswith('/observatory')
    flag = 'OK ' if allowed == want_public else 'LEAK'
    if allowed != want_public: leak.append(path)
    print(f"         [{flag}] can_fetch({path}) = {allowed}")
if leak:
    print(f"       => {len(leak)} path(s) mis-resolved by this interpreter: {', '.join(leak)}")
PY
  else
    note "python3 not found — first-match robots interpretation not measured"
  fi
fi

# ── 2 · sitemap.xml (C4, C5, M1, M2) ───────────────────────────────────────
sect "2 · sitemap.xml — discovery of the dependency records"
fetch "$TMP/sitemap" "$BASE/sitemap.xml" >/dev/null; pace
sm_status=$(status_of "$TMP/sitemap")
if [ "$sm_status" != 200 ]; then
  crit "GET /sitemap.xml → $sm_status (expected 200)"
else
  ok "GET /sitemap.xml → 200"
  grep -oE '<loc>[^<]+</loc>' "$TMP/sitemap" | sed -e 's/<[^>]*>//g' > "$TMP/locs"
  total=$(wc -l < "$TMP/locs" | tr -d ' ')
  obs=$(grep -cE '/observatory/[^/]+/?$' "$TMP/locs" || true)
  inc=$(grep -cE '/observatory/.+/incidents/' "$TMP/locs" || true)
  hub=$(grep -cE '/observatory/?$' "$TMP/locs" || true)
  echo "       urls=$total  hub(/observatory)=$hub  records=$obs  incident-pages=$inc"

  [ "$hub" -ge 1 ] && ok "/observatory hub is in the sitemap" \
                   || crit "C4: /observatory hub missing from sitemap.xml"
  if [ "$obs" -eq 0 ]; then
    crit "C4: sitemap.xml contains ZERO /observatory/{vendor} record URLs.
       Either the catalog read failed (sitemap.ts catch → static-only) or the catalog is empty.
       Cross-check: curl -s '$API/v1/vendors?limit=100' | head -c 400"
  else
    ok "$obs dependency-record URL(s) advertised"
  fi
  [ "$total" -ge 100 ] && note "M1: $total urls — check the 100-vendor / 24-vendor-incident caps are not truncating"

  dupes=$(sort "$TMP/locs" | uniq -d)
  if [ -n "$dupes" ]; then
    n=$(printf '%s\n' "$dupes" | grep -c . || true)
    crit "C5: $n duplicated <loc> value(s) in sitemap.xml:"
    printf '%s\n' "$dupes" | head -12 | sed 's/^/         /'
  else
    ok "no duplicate <loc> values"
  fi

  now_urls=$(grep -c "<lastmod>$(date -u +%Y-%m-%d)" "$TMP/sitemap" || true)
  if [ "$now_urls" -gt 20 ]; then
    med "M2: $now_urls entries carry today's date as <lastmod> (stamped per request) — Google
       treats an always-'now' lastmod as untrustworthy and may ignore it site-wide."
  else
    ok "lastmod is not blanket-stamped with today's date ($now_urls entries)"
  fi
fi

# ── 3 · llms.txt family (M3) ───────────────────────────────────────────────
sect "3 · llms.txt / llms-full.txt — LLM indexability"
for f in llms.txt llms-full.txt; do
  fetch "$TMP/$f" "$BASE/$f" >/dev/null; pace
  st=$(status_of "$TMP/$f"); ct=$(hdr "content-type" "$TMP/$f.hdr")
  if [ "$st" != 200 ]; then
    crit "GET /$f → $st (expected 200)"
    continue
  fi
  case "$ct" in
    text/plain*) ok "/$f → 200, $ct" ;;
    *) high "/$f → 200 but Content-Type is '$ct' (expected text/plain; models and
       fetchers key off this, and a duplicate header from next.config.ts can produce odd values)" ;;
  esac
  # The discovery files hard-code the canonical origin, so match on the path,
  # not on --base (a preview host would otherwise produce a false failure).
  grep -qE "https://[^[:space:]]*/observatory" "$TMP/$f" \
    && ok "/$f references the dependency index" \
    || high "/$f does not reference /observatory at all"
  grep -qE "https://reliastra\.com/observatory" "$TMP/$f" \
    || med "/$f references the index on a non-canonical origin (expected https://reliastra.com/...)"
  n=$(grep -cE "https://[^[:space:]]*/observatory/[a-z0-9._~-]+" "$TMP/$f" || true)
  [ "$n" -gt 0 ] && ok "/$f enumerates $n concrete record URL(s)" \
                 || med "M3: /$f gives only the /observatory hub or a {vendor} pattern — a model
       must fetch sitemap.xml or the API to resolve a concrete dependency record."
  grep -qi "sitemap" "$TMP/$f" && ok "/$f points at sitemap.xml" \
                               || note "/$f does not mention sitemap.xml"
  ct_count=$(grep -ic "^content-type:" "$TMP/$f.hdr" || true)
  [ "$ct_count" -gt 1 ] && med "M5: /$f response carries $ct_count Content-Type headers (route + next.config.ts)"
done

# ── 4 · the hub page /observatory (C1, C2, H2) ─────────────────────────────
sect "4 · /observatory — the hub"
t0=$(date +%s%N 2>/dev/null || echo 0)
fetch "$TMP/hub" "$BASE/observatory" >/dev/null
t1=$(date +%s%N 2>/dev/null || echo 0)
ttfb=$(( (t1 - t0) / 1000000 ))
hub_st=$(status_of "$TMP/hub")
if [ "$hub_st" != 200 ]; then
  crit "GET /observatory → $hub_st"
else
  ok "GET /observatory → 200 (${ttfb}ms)"
  # C1 was "the hub re-walks its whole upstream fan-out on every crawler hit".
  # The fix is deliberately NOT an edge cache on the HTML: the hub renders per
  # request (renderAtRequestTime, src/lib/render-at-request-time.ts), because
  # prerendering it at build time would bake a catalog-failure state into the
  # deployment artifact and serve it to every visitor. This response therefore
  # carries no-cache and that is correct - asserting an edge cache here would
  # flag the fix as a defect. What C1 means now is that repeated hits must be
  # absorbed by the Data Cache on the reads (lib/track-api.ts carries
  # next.revalidate) instead of being re-issued upstream.
  cc=$(hdr "cache-control" "$TMP/hub.hdr")
  note "C1: /observatory Cache-Control: ${cc:-<none>} - HTML rendered per request by design; caching lives on the reads"
  warm_max=0; warm_codes=""
  for i in 1 2 3; do
    pace
    w0=$(date +%s%N 2>/dev/null || echo 0)
    fetch "$TMP/hub$i" "$BASE/observatory" >/dev/null
    w1=$(date +%s%N 2>/dev/null || echo 0)
    w=$(( (w1 - w0) / 1000000 ))
    warm_codes="$warm_codes $(status_of "$TMP/hub$i")/${w}ms"
    if [ "$w" -gt "$warm_max" ]; then warm_max=$w; fi
  done
  echo "       repeat hits:$warm_codes"
  echo "$warm_codes" | grep -qE " (429|5[0-9][0-9])/" \
    && crit "C1: a repeat hit of /observatory returned 429/5xx - the hub is re-issuing its upstream
       fan-out per request instead of serving it from the Data Cache."
  if [ "$warm_max" -gt 4000 ]; then
    med "C1: a repeat hit took ${warm_max}ms - a cached-read render should be well inside that"
  else
    ok "C1: repeat hub hits served from cached reads (worst ${warm_max}ms)"
  fi
  robots=$(body "$TMP/hub" | grep -oiE '<meta name="robots" content="[^"]*"' | head -1)
  case "$robots" in
    *noindex*) crit "C2: /observatory serves noindex: $robots" ;;
    "") high "/observatory emits no <meta name=robots> — inherits the layout default (index,follow)" ;;
    *) ok "/observatory robots: $robots" ;;
  esac
  canon=$(body "$TMP/hub" | grep -oiE '<link rel="canonical" href="[^"]*"' | head -1)
  [ -n "$canon" ] && ok "canonical present: $canon" || high "/observatory has no canonical link"
  h1=$(body "$TMP/hub" | grep -oiE '<h1[ >]' | wc -l | tr -d ' ')
  [ "$h1" = 1 ] && ok "exactly one <h1>" || high "/observatory has $h1 <h1> elements (expected 1)"
  # The hub no longer renders a failure state at 200 - it throws, so an
  # unreadable catalog is a 5xx. It renders per request, so there is no stored
  # render behind that 5xx; the record pages under it are the ones that keep
  # serving their last good render through a failed revalidation.
  # Matching the boundary copy here catches the regression in either direction:
  # a 200 that shows it, or a 5xx that reached this branch at all.
  grep -q "Measurement network unreachable\|The dependency index could not be read\|Catalog unavailable" "$TMP/hub" \
    && crit "C3/C4: the hub is showing its catalog-failure boundary - the catalog read is failing
       on the live site. That should be a 5xx from the error boundary; if this is a 200,
       the throw was caught again."
  grep -q "No public dependency records yet" "$TMP/hub" \
    && high "The live catalog is EMPTY ('No public dependency records yet'): no records exist to
       index, so the sitemap and every record URL are moot until vendors are seeded/probed."
  rows=$(body "$TMP/hub" | grep -oE 'href="[^"]*/observatory/[^"?/]+"' | sort -u | wc -l | tr -d ' ')
  echo "       crawlable record links in hub HTML: $rows"
  [ "$rows" -gt 0 ] && ok "hub links to $rows record URL(s) — crawlable without the sitemap" \
                    || high "hub HTML contains no links to /observatory/{vendor} — records are
       discoverable only via sitemap.xml"
  for t in CollectionPage BreadcrumbList; do
    grep -q "\"@type\":\"$t\"\|\"@type\": \"$t\"" "$TMP/hub" && ok "JSON-LD $t present" \
      || med "JSON-LD $t missing from the hub"
  done
fi

# ── 5 · dependency records (C2, C7, H1) ───────────────────────────────────
sect "5 · dependency records"
: > "$TMP/records"
if [ -s "$TMP/locs" ]; then
  grep -E '/observatory/[^/]+/?$' "$TMP/locs" | grep -vE '/observatory/?$' | head -"$MAX_RECORDS" > "$TMP/records"
fi
if [ ! -s "$TMP/records" ]; then
  # Fall back to whatever the hub links to.
  [ -f "$TMP/hub" ] && body "$TMP/hub" | grep -oE 'href="[^"]*/observatory/[^"?/]+"' \
    | sed -e 's/^href="//' -e 's/"$//' | sort -u | head -"$MAX_RECORDS" > "$TMP/records"
fi
if [ ! -s "$TMP/records" ]; then
  high "No record URLs to test (sitemap has none and the hub links none) — see C4."
else
  while read -r u; do
    [ -z "$u" ] && continue
    url=$(to_base "$u")
    [ "$(origin_of "$u")" != "$(origin_of "$BASE/x")" ] && [ "${u#http}" != "$u" ] \
      && note "H4: $u is advertised on $(origin_of "$u") while this host is $BASE"
    fetch "$TMP/rec" "$url" >/dev/null; pace
    st=$(status_of "$TMP/rec"); rmeta=$(body "$TMP/rec" | grep -oiE '<meta name="robots" content="[^"]*"' | head -1)
    printf '       %s → %s %s\n' "$url" "${st:-UNREACHABLE}" "$rmeta"
    if [ -z "$st" ]; then
      crit "Record URL could not be fetched at all (DNS/TLS/timeout): $url"
      continue
    elif [ "$st" = 404 ]; then
      crit "A sitemap-advertised record URL returns 404 (C4/C7-class): $url"
    elif [ "$st" != 200 ]; then
      crit "Record URL returned $st: $url"
    else
      unavail=0
      grep -q "Observation unavailable\|This record could not be rendered\|could not be read from the measurement network" "$TMP/rec" && unavail=1
      case "$rmeta" in
        *noindex*)
          crit "C2: a live, sitemap-listed record serves noindex — Google will drop it.
       Cause is almost always an upstream failure (429/5xx/timeout) being treated as
       'record does not exist'. Check $API/v1/vendors/<name> right now.
       unavailable-body-with-200: $([ $unavail = 1 ] && echo yes || echo no)" ;;
        *)
          if [ "$unavail" = 1 ]; then
            crit "C2: record renders its 'unavailable' state with HTTP 200 (soft-404): $url"
          else
            ok "record indexable: $url"
          fi ;;
      esac
      grep -q '"@type":"Dataset"\|"@type": "Dataset"' "$TMP/rec" && ok "JSON-LD Dataset present" \
        || med "no Dataset JSON-LD on $url"
      rcc=$(hdr "cache-control" "$TMP/rec.hdr")
      case "$rcc" in *no-store*|*no-cache*|"") note "C1: record is dynamic ('$rcc')";; *) ok "record cached: $rcc";; esac
    fi
  done < "$TMP/records"
fi

# bogus record must be a hard 404, never a 200
fetch "$TMP/bogus" "$BASE/observatory/not-a-real-vendor-zzz-audit" >/dev/null; pace
bst=$(status_of "$TMP/bogus")
if [ "$bst" = 404 ]; then
  ok "unknown vendor → 404 (no soft-404)"
elif [ "$bst" = 200 ]; then
  crit "C2: unknown vendor returned 200. Body says: $(body "$TMP/bogus" | grep -oiE 'unreachable|unavailable|could not be rendered|does not publish a record' | head -1)
       A 200 here is indistinguishable from the upstream-failure path — the e2e suite
       currently tolerates both (e2e/public-redesign.spec.ts:314-322)."
else
  high "unknown vendor → $bst (expected 404)"
fi

# ── 6 · incident records (C7) ─────────────────────────────────────────────
sect "6 · public incident records"
if [ -s "$TMP/locs" ]; then
  grep -E '/observatory/.+/incidents/' "$TMP/locs" | head -3 > "$TMP/inc"
else
  : > "$TMP/inc"
fi
if [ -s "$TMP/inc" ]; then
  while read -r u; do
    url=$(to_base "$u")
    fetch "$TMP/inc1" "$url" >/dev/null; pace
    ist=$(status_of "$TMP/inc1")
    printf '       %s → %s\n' "$url" "${ist:-UNREACHABLE}"
    if [ -z "$ist" ]; then crit "Incident record unreachable (DNS/TLS/timeout): $url"
    elif [ "$ist" = 404 ]; then crit "C7: a sitemap-advertised incident record 404s: $url"
    elif [ "$ist" != 200 ]; then crit "Incident record returned $ist: $url"; fi
  done < "$TMP/inc"
else
  note "no incident URLs in the sitemap. Verify the channel is merely empty rather than broken:"
  note "  curl -s '$API/v1/vendors/openai/incidents'          # backend returns [] by design"
  note "  curl -s '$API/v1/vendors/openai/incidents/public'   # rolling 90-day window (C7)"
fi

# ── 7 · upstream API contract (H2, H3, L2) ────────────────────────────────
sect "7 · public measurement API (contract checks)"
fetch "$TMP/cat" "$API/v1/vendors?limit=100" >/dev/null; pace
cst=$(status_of "$TMP/cat")
if [ "$cst" = 200 ]; then
  ok "GET $API/v1/vendors?limit=100 → 200"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$TMP/cat" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception as e: print(f"       (parse skipped: {e})"); sys.exit(0)
items = d.get('items', [])
print(f"       items={len(items)} has_more={d.get('has_more')} next_cursor={bool(d.get('next_cursor'))}")
if d.get('has_more'):
    print("       M1: catalog has more pages than the sitemap ever follows (sitemap.ts:53 has no cursor loop)")
if items:
    with_state = sum(1 for i in items if i.get('recent_status') not in (None, '', 'unknown'))
    print(f"       H2: {with_state}/{len(items)} list items already carry recent_status/latency_ms —")
    print("           the hub's 24 per-vendor detail calls re-fetch data this response contains.")
    stale = [i['vendor_name'] for i in items if not i.get('last_check_at')]
    if stale: print(f"       L1/data: never observed: {', '.join(stale[:8])}")
PY
  fi
else
  high "GET $API/v1/vendors → $cst (the hub cannot render without it)"
fi
fetch "$TMP/inci" "$API/v1/vendors/openai/incidents" >/dev/null; pace
[ "$(status_of "$TMP/inci")" = 200 ] && grep -q '"incidents":\[\]' "$TMP/inci" \
  && note "H3 confirmed: /v1/vendors/{name}/incidents returns an empty list by design — every
       call the record pages make to it is wasted rate-limit budget."

# ── 8 · headers (M5) ──────────────────────────────────────────────────────
sect "8 · response header hygiene"
xfo=$(grep -ic "^x-frame-options:" "$TMP/hub.hdr" 2>/dev/null || echo 0)
[ "$xfo" -gt 1 ] && med "M5: $xfo X-Frame-Options headers on one response (next.config.ts ALLOWALL + Caddy SAMEORIGIN)"
grep -qi "^x-robots-tag:.*noindex" "$TMP/hub.hdr" && crit "X-Robots-Tag noindex on /observatory"
csp=$(hdr "content-security-policy" "$TMP/hub.hdr")
[ -n "$csp" ] && echo "       CSP: ${csp:0:110}..."

# ── 9 · opt-in burst test (C3) ────────────────────────────────────────────
if [ "$LOAD" = 1 ]; then
  sect "9 · burst test (opt-in) — shared 300/min public-vendor budget"
  target=$(head -1 "$TMP/records" 2>/dev/null)
  if [ -n "$target" ]; then target=$(to_base "$target"); else target="$BASE/observatory"; fi
  echo "       40 sequential GETs of $target"
  codes=""
  for i in $(seq 1 40); do
    c=$(curl -sS -m 20 -o "$TMP/burst" -w '%{http_code}' -A "reliastra-index-audit/1.0" "$target")
    codes="$codes $c"
    if grep -qi 'name="robots" content="[^"]*noindex' "$TMP/burst" 2>/dev/null; then
      crit "C3→C2: request $i served noindex under load — the record is being deindexed by rate limiting."
      break
    fi
    if grep -q "Observation unavailable\|Measurement network unreachable" "$TMP/burst" 2>/dev/null; then
      crit "C3: request $i rendered the upstream-failure state under load."
      break
    fi
  done
  echo "       statuses:$codes"
  echo "$codes" | grep -q " 429 \| 5[0-9][0-9] " \
    && crit "C3: burst produced 429/5xx — the public index rate-limits itself under modest crawler load."
  fetch "$TMP/api429" "$API/v1/vendors/openai" >/dev/null
  note "api status after burst: $(status_of "$TMP/api429") (429 = shared bucket exhausted)"
else
  sect "9 · burst test — skipped (pass --load to run it)"
fi

# ── summary ───────────────────────────────────────────────────────────────
sect "summary"
printf 'CRIT=%s  HIGH=%s  MED=%s  PASS=%s\n' "$CRIT" "$HIGH" "$MED" "$PASS"
[ "$CRIT" -gt 0 ] && { echo "Critical failures present — see docs/public-dependency-index-seo-llm-audit.md"; exit 1; }
echo "No critical failures detected on this pass."
exit 0
