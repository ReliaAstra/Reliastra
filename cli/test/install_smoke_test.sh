#!/usr/bin/env bash
# Install smoke test — install the CLI the way a user does, through npm and
# through pip, and then prove that what ends up on PATH is the Go CLI.
#
#   bash cli/test/install_smoke_test.sh [options]
#
# Options:
#   --version <v>       version the installed CLI must report (default: the
#                       version in cli/npm/package.json)
#   --dist <dir>        a GoReleaser dist/ directory: served over loopback and
#                       installed from, so the wrappers can be exercised
#                       against binaries that were just built
#   --release-url <url> release asset base URL to install from (default:
#                       the public GitHub release for this version)
#   --skip-release-url  install only from --dist; make no request to GitHub
#
# Each channel is checked through the whole path a user takes: install,
# binary discovery, --version, --help, a representative command, and a
# representative failure whose exit code the CLI defines. Both installers
# are pointed at the same cache, so this also re-checks the promise that
# npm and pip share one copy of the binary rather than keeping rival ones.
#
# Requires: node >= 18, python3 with `build` (or an existing wheel via
# --wheel), and bash. Go is optional: when it is present the downloaded
# binary is additionally opened with `go version -m`, which prints the
# module path it was built from — the direct proof that this is the Go CLI
# and not a reimplementation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VERSION=""
DIST=""
WHEEL=""
RELEASE_URL="https://github.com/ReliaAstra/Reliastra/releases/download"
SKIP_RELEASE_URL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2#v}"; shift 2 ;;
    --dist) DIST="$2"; shift 2 ;;
    --wheel) WHEEL="$2"; shift 2 ;;
    --release-url) RELEASE_URL="$2"; shift 2 ;;
    --skip-release-url) SKIP_RELEASE_URL=1; shift ;;
    -h | --help)
      sed -n '2,32p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

[ -n "$VERSION" ] || VERSION="$(node -p "require('$ROOT/cli/npm/package.json').version")"
command -v node >/dev/null 2>&1 || { echo "FAIL: node is required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 is required"; exit 1; }

WORK="$(mktemp -d)"
SERVER_PID=""
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "ok: $1"; }

echo "── build the installers ($VERSION)"

NPM_TARBALL="$WORK/reliastra-$VERSION.tgz"
(cd cli/npm && npm pack --pack-destination "$WORK" --silent >/dev/null) ||
  fail "npm pack (cli/npm)"
[ -f "$NPM_TARBALL" ] || fail "npm pack produced $NPM_TARBALL"
NPM_PREFIX="$WORK/npm-prefix"
mkdir -p "$NPM_PREFIX"
# Offline by construction: the package has no dependencies, so the only
# thing this installs is the shim we just packed.
npm install -g --prefix "$NPM_PREFIX" --no-audit --no-fund --silent "$NPM_TARBALL" >/dev/null 2>&1 ||
  fail "npm install -g $NPM_TARBALL"
[ -x "$NPM_PREFIX/bin/reliastra" ] || fail "npm did not put an executable at \$prefix/bin/reliastra"
ok "npm: global install puts reliastra on PATH"

if [ -z "$WHEEL" ]; then
  python3 -m build --outdir "$WORK/pydist" cli/python >/dev/null 2>&1 ||
    fail "python -m build (pip install build)"
  WHEEL="$(ls "$WORK"/pydist/*.whl | head -1)"
fi
[ -f "$WHEEL" ] || fail "no wheel at $WHEEL"
python3 -m venv "$WORK/venv" >/dev/null 2>&1 || fail "python3 -m venv"
"$WORK/venv/bin/pip" install --quiet --disable-pip-version-check "$WHEEL" >/dev/null 2>&1 ||
  fail "pip install $WHEEL"
[ -x "$WORK/venv/bin/reliastra" ] || fail "pip did not create the reliastra console script"
ok "pip: wheel install creates the reliastra console script"

NPM_BIN="$NPM_PREFIX/bin/reliastra"
PIP_BIN="$WORK/venv/bin/reliastra"

# Serve a dist/ directory the way GitHub Releases serves assets:
# <base>/v<version>/<asset>. The wrappers are pointed at it with
# RELIASTRA_RELEASE_URL, never at GitHub.
serve_dist() { # <dist-dir> -> echoes URL
  local dist="$1"
  mkdir -p "$WORK/serve/v$VERSION"
  cp "$dist"/reliastra_* "$dist/checksums.txt" "$WORK/serve/v$VERSION/" ||
    fail "copying $dist into the fake release"
  local port=$(( (RANDOM % 20000) + 30000 ))
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$WORK/serve" >/dev/null 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 50); do
    curl -sf -o /dev/null "http://127.0.0.1:$port/v$VERSION/checksums.txt" && break
    sleep 0.1
  done
  echo "http://127.0.0.1:$port"
}

# One channel, one release source, one fresh cache.
check_channel() { # <label> <binary> <release-url> <cache>
  local label="$1" bin="$2" url="$3" cache="$4"
  local out code

  out="$(env RELIASTRA_RELEASE_URL="$url" RELIASTRA_CACHE="$cache" "$bin" --version 2>"$WORK/stderr")" ||
    fail "$label: --version failed: $(cat "$WORK/stderr")"
  [ "$(printf '%s' "$out" | tr -d '[:space:]')" = "$VERSION" ] ||
    fail "$label: --version printed '$out', want $VERSION"

  out="$(env RELIASTRA_RELEASE_URL="$url" RELIASTRA_CACHE="$cache" "$bin" --help 2>&1)" ||
    fail "$label: --help failed"
  case "$out" in
    *"reliastra"*deps*) ;;
    *) fail "$label: --help did not look like the CLI's help: $(printf '%s' "$out" | head -3)" ;;
  esac

  # A representative command: it prints a URL, needs no credential and no
  # network, and its exact output is part of the CLI's contract.
  out="$(env RELIASTRA_RELEASE_URL="$url" RELIASTRA_CACHE="$cache" "$bin" open verify 8Kd2xQ7mB4pL 2>&1)" ||
    fail "$label: \`open verify\` failed: $out"
  [ "$(printf '%s' "$out" | tr -d '[:space:]')" = "https://reliastra.com/reports/8Kd2xQ7mB4pL" ] ||
    fail "$label: \`open verify\` printed '$out'"

  # A representative failure: exit 6, "the API could not be reached", which
  # is what a pipeline branches on. It must survive the wrapper untouched.
  code=0
  env RELIASTRA_RELEASE_URL="$url" RELIASTRA_CACHE="$cache" \
    "$bin" deps list --api-url http://127.0.0.1:9 >/dev/null 2>"$WORK/stderr" || code=$?
  [ "$code" = "6" ] || fail "$label: unreachable API exited $code, want 6"

  ok "$label: install → --version → --help → command → exit code"
}

echo "── install from the release"

if [ -n "$DIST" ]; then
  LOCAL_URL="$(serve_dist "$DIST")"
  check_channel "npm (local dist)" "$NPM_BIN" "$LOCAL_URL" "$WORK/cache-local"
  check_channel "pip (local dist)" "$PIP_BIN" "$LOCAL_URL" "$WORK/cache-local"
  COUNT="$(find "$WORK/cache-local" -name 'reliastra' -type f | wc -l | tr -d ' ')"
  [ "$COUNT" = "1" ] || fail "expected one shared cached binary, found $COUNT"
  ok "npm and pip share one cached binary"

  # The cache is what the wrappers actually execute. Open it: if Go is here,
  # `go version -m` names the module the binary was built from.
  CACHED="$(find "$WORK/cache-local" -name 'reliastra' -type f | head -1)"
  if command -v go >/dev/null 2>&1; then
    INFO="$(go version -m "$CACHED" 2>&1 || true)"
    case "$INFO" in
      *"github.com/ReliaAstra/Reliastra/cli/cmd/reliastra"*) ;;
      *) fail "the cached binary was not built from cli/cmd/reliastra: $INFO" ;;
    esac
    ok "the installed binary is the Go CLI ($(printf '%s' "$INFO" | sed -n 's/.*mod[[:space:]]*\([^[:space:]]*\).*/mod \1/p' | head -1))"
  else
    echo "skip: go version -m (no go on PATH)"
  fi
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
fi

if [ "$SKIP_RELEASE_URL" = "0" ]; then
  check_channel "npm ($RELEASE_URL)" "$NPM_BIN" "$RELEASE_URL" "$WORK/cache-public"
  check_channel "pip ($RELEASE_URL)" "$PIP_BIN" "$RELEASE_URL" "$WORK/cache-public"
  COUNT="$(find "$WORK/cache-public" -name 'reliastra' -type f | wc -l | tr -d ' ')"
  [ "$COUNT" = "1" ] || fail "expected one shared cached binary, found $COUNT"
  ok "npm and pip share one cached binary (public release)"
fi

echo "install smoke test: all checks passed ($VERSION)"
