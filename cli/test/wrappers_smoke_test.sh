#!/usr/bin/env bash
# Wrappers smoke test — exercises the npm and PyPI installer shims against
# a fake release served over local HTTP, without any network access or a
# real GitHub release:
#
#   1. both wrappers download the binary and verify its checksum
#   2. the cache is shared between the two wrappers (one binary, not two)
#   3. a second run reuses the cache with the server already down, and
#      exit codes pass through untouched
#   4. RELIASTRA_BIN bypasses download and cache entirely
#   5. a tampered checksums.txt refuses to execute anything
#
# Run from anywhere: cli/test/wrappers_smoke_test.sh
# Used locally and by the `cli` job in .github/workflows/ci.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_SHIM="$ROOT/cli/npm/bin/reliastra.js"
PY_SRC="$ROOT/cli/python/src"

WORK="$(mktemp -d)"
trap 'kill "${SERVER_PID:-}" 2>/dev/null || true; rm -rf "$WORK"' EXIT

# Release asset naming: reliastra_{version}_{goos}_{goarch}(.exe), matching
# the raw-binaries archive in .goreleaser.yaml. The test host must be one
# of the platforms a release actually ships (linux/darwin × amd64/arm64);
# anything else skips rather than fails.
VERSION="0.2.0"
case "$(uname -s)" in
  Linux) GOOS="linux" ;;
  Darwin) GOOS="darwin" ;;
  *) echo "skip: unsupported host $(uname -s) (this test needs linux or darwin)"; exit 0 ;;
esac
case "$(uname -m)" in
  x86_64) GOARCH="amd64" ;;
  arm64 | aarch64) GOARCH="arm64" ;;
  *) echo "skip: unsupported host arch $(uname -m)"; exit 0 ;;
esac
ASSET="reliastra_${VERSION}_${GOOS}_${GOARCH}"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# The fake binary is a shell script that echoes its arguments, so both
# wrappers can prove argument and exit-code passthrough. FAKE_EXIT lets a
# caller set the binary's exit status. checksums.txt carries the real
# hash; the tampered copy below is fixed up afterwards.
write_fake_release() { # <dir>
  mkdir -p "$1/v$VERSION"
  cat > "$1/v$VERSION/$ASSET" <<'FAKE'
#!/bin/sh
echo "reliastra-fake $*"
exit "${FAKE_EXIT:-0}"
FAKE
  chmod 0755 "$1/v$VERSION/$ASSET"
  printf '%s  %s\n' "$(sha256_file "$1/v$VERSION/$ASSET")" "$ASSET" \
    > "$1/v$VERSION/checksums.txt"
}

GOOD="$WORK/good"
TAMPERED="$WORK/tampered"
write_fake_release "$GOOD"
# A tampered release: same asset, checksums.txt claims a different hash.
write_fake_release "$TAMPERED"
printf '%s  %s\n' \
  "0000000000000000000000000000000000000000000000000000000000000000" "$ASSET" \
  > "$TAMPERED/v$VERSION/checksums.txt"

# Serve the fake releases. Loopback only; the wrappers are pointed at it
# with RELIASTRA_RELEASE_URL, never at GitHub.
PORT=$(( (RANDOM % 20000) + 30000 ))
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK" >/dev/null 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/good/v$VERSION/checksums.txt" && break
  sleep 0.1
done

GOOD_URL="http://127.0.0.1:$PORT/good"
TAMPERED_URL="http://127.0.0.1:$PORT/tampered"

NODE() { node "$NODE_SHIM" "$@"; }
PY() { PYTHONPATH="$PY_SRC" python3 -m reliastra "$@"; }

expect_output() { # <expected-substring> <label> <cmd...>
  local want="$1" label="$2"; shift 2
  local got
  got="$("$@" 2>"$WORK/stderr")"
  case "$got" in
    *"$want"*) ;;
    *) echo "FAIL: $label — expected output containing \"$want\", got: $got"; exit 1 ;;
  esac
  echo "ok: $label"
}

# 1. First run: download, verify, execute, pass arguments through.
expect_output "reliastra-fake probe --json" "npm shim: download + verify + exec" \
  env RELIASTRA_RELEASE_URL="$GOOD_URL" RELIASTRA_CACHE="$WORK/cache" \
  node "$NODE_SHIM" probe --json
expect_output "reliastra-fake probe --json" "pip shim: download + verify + exec" \
  env RELIASTRA_RELEASE_URL="$GOOD_URL" RELIASTRA_CACHE="$WORK/cache" \
  PYTHONPATH="$PY_SRC" python3 -m reliastra probe --json

# 2. The binary cache is shared: the second wrapper found what the first
#    downloaded. Assert one shared copy exists, not two.
COUNT="$(find "$WORK/cache" -name 'reliastra' -type f | wc -l)"
[ "$COUNT" -eq 1 ] || { echo "FAIL: expected 1 cached binary, found $COUNT"; exit 1; }
echo "ok: npm and pip shims share one binary cache"

# 3. Tampered checksums.txt: nothing is written to the cache and nothing
#    is executed. The error must say why (checksum mismatch), not bury it.
#    (Runs while the release server is still up.)
expect_tamper_failure() { # <label> <cmd...>
  local label="$1"; shift
  if "$@" >"$WORK/stdout" 2>"$WORK/stderr"; then
    echo "FAIL: $label — expected non-zero exit, got success"; exit 1
  fi
  grep -qi "checksum mismatch" "$WORK/stderr" || {
    echo "FAIL: $label — expected a checksum-mismatch error, got: $(cat "$WORK/stderr")"; exit 1
  }
  echo "ok: $label"
}
expect_tamper_failure "npm shim: tampered checksum refused" \
  env RELIASTRA_RELEASE_URL="$TAMPERED_URL" RELIASTRA_CACHE="$WORK/tamper-npm" node "$NODE_SHIM" evidence get
expect_tamper_failure "pip shim: tampered checksum refused" \
  env RELIASTRA_RELEASE_URL="$TAMPERED_URL" RELIASTRA_CACHE="$WORK/tamper-pip" PYTHONPATH="$PY_SRC" python3 -m reliastra evidence get
[ ! -e "$WORK/tamper-npm/v$VERSION/reliastra" ] || {
  echo "FAIL: tampered download left a binary in the cache"; exit 1; }
[ ! -e "$WORK/tamper-pip/v$VERSION/reliastra" ] || {
  echo "FAIL: tampered download left a binary in the cache"; exit 1; }

# 4. RELIASTRA_BIN bypasses download and cache entirely — a user with a
#    go-installed or manually fetched binary can point the wrapper at it.
FAKE_BIN="$GOOD/v$VERSION/$ASSET"
expect_output "reliastra-fake deps list" "npm shim: RELIASTRA_BIN override" \
  env RELIASTRA_BIN="$FAKE_BIN" RELIASTRA_CACHE="$WORK/unused" node "$NODE_SHIM" deps list
expect_output "reliastra-fake deps list" "pip shim: RELIASTRA_BIN override" \
  env RELIASTRA_BIN="$FAKE_BIN" RELIASTRA_CACHE="$WORK/unused" PYTHONPATH="$PY_SRC" python3 -m reliastra deps list

# 5. Cache reuse: with the release server gone, the cached copy still
#    works, and the CLI's exit codes pass through untouched (7 must be 7).
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
expect_output "reliastra-fake whoami" "npm shim: cache reuse (server down)" \
  env RELIASTRA_CACHE="$WORK/cache" node "$NODE_SHIM" whoami
expect_output "reliastra-fake whoami" "pip shim: cache reuse (server down)" \
  env RELIASTRA_CACHE="$WORK/cache" PYTHONPATH="$PY_SRC" python3 -m reliastra whoami

NPM_RC=0; PY_RC=0
env RELIASTRA_CACHE="$WORK/cache" FAKE_EXIT=7 node "$NODE_SHIM" verify --expect-hash x >/dev/null 2>&1 || NPM_RC=$?
env RELIASTRA_CACHE="$WORK/cache" FAKE_EXIT=7 PYTHONPATH="$PY_SRC" python3 -m reliastra verify --expect-hash x >/dev/null 2>&1 || PY_RC=$?
[ "$NPM_RC" -eq 7 ] && [ "$PY_RC" -eq 7 ] || {
  echo "FAIL: exit codes not passed through (npm=$NPM_RC pip=$PY_RC, want 7)"; exit 1;
}
echo "ok: exit codes pass through"

echo "wrappers: all checks passed"
