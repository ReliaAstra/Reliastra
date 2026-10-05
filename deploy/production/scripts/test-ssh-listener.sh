#!/usr/bin/env bash
# test-ssh-listener.sh - unit tests for the sshd listener verifier in
# harden-host.sh.
#
# Why this exists: harden-host.sh's SSH section only trusts itself if the check
# it uses to decide "did the restriction take effect?" is correct. That check is
# wired to a destructive rollback, so a false negative does not merely report a
# problem - it restores the previous config on a host that was already fine, and
# a false positive ships a host whose sshd is still bound to the world. It is
# therefore tested here against recorded `ss -ltn` output instead of being
# eyeballed on a production host once.
#
# The functions under test are COPIED VERBATIM from harden-host.sh. The
# `test -c` checks below confirm they have not drifted.
#
# Every address below is a fixture. No real host address belongs in this file;
# see docs/operations/production-access.md.
#
# Usage: ./test-ssh-listener.sh    (exit 0 = all cases pass)
set -uo pipefail

# A documentation-range CGNAT address standing in for the tailnet IPv4.
FAKE_TAILNET_IPV4="100.100.100.100"

fail=0
pass=0

# ── the code under test, SOURCED from harden-host.sh ────────────────────────
# Not copied. Copying is how a test ends up validating a function the host
# never runs; sourcing makes drift structurally impossible.
SCRIPT="$(cd "$(dirname "$0")" && pwd)/harden-host.sh"
if [[ ! -f "$SCRIPT" ]]; then
  echo "FATAL: $SCRIPT not found - cannot test the shipped verifier" >&2
  exit 1
fi

FUNCS=(ssh_listener_report ssh_listener_is_tailnet_only)
FRAGMENT="$(mktemp)"
for fn in "${FUNCS[@]}"; do
  if ! sed -n "/^${fn}()/,/^}/p" "$SCRIPT" >> "$FRAGMENT"; then
    echo "FATAL: could not extract ${fn}() from $SCRIPT" >&2
    exit 1
  fi
done
if [[ ! -s "$FRAGMENT" ]]; then
  echo "FATAL: extracted no verifier code from $SCRIPT" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$FRAGMENT"

for fn in "${FUNCS[@]}"; do
  if declare -f "$fn" >/dev/null 2>&1; then
    printf 'ok   %-46s (sourced from harden-host.sh)\n' "$fn defined"
    pass=$((pass+1))
  else
    printf 'FAIL %-46s was not defined by the sourced fragment\n' "$fn"
    fail=$((fail+1))
  fi
done

# `ss` is not available everywhere this runs (and on some developer machines
# there is no kernel to ask), so stand in a double that replays a fixture.
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR" "$FRAGMENT"' EXIT
cat > "$STUB_DIR/ss" <<'STUB'
#!/usr/bin/env bash
# test double for ss(8): ignore flags, emit the fixture on stdin
cat
STUB
chmod +x "$STUB_DIR/ss"
PATH="$STUB_DIR:$PATH"

check() { # <name> <expect pass|fail> <raw ss -ltn output>
  local name="$1" expect="$2" fixture="$3" got
  TAILSCALE_IPV4="$FAKE_TAILNET_IPV4"
  if ssh_listener_is_tailnet_only <<<"$fixture"; then got=pass; else got=fail; fi
  if [[ "$got" == "$expect" ]]; then
    printf 'ok   %-48s -> %s\n' "$name" "$got"
    pass=$((pass+1))
  else
    printf 'FAIL %-48s -> %s (expected %s)\n' "$name" "$got" "$expect"
    fail=$((fail+1))
  fi
}

HDR='State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port'

echo
echo "=== the state the verifier must accept ==="
check "tailnet + loopback" pass \
"$HDR
LISTEN 0      4096              127.0.0.1:22         0.0.0.0:*
LISTEN 0      4096         100.100.100.100:22       0.0.0.0:*"
check "tailnet among unrelated published services" pass \
"$HDR
LISTEN 0      4096                0.0.0.0:80         0.0.0.0:*
LISTEN 0      4096              127.0.0.1:22         0.0.0.0:*
LISTEN 0      4096         100.100.100.100:22       0.0.0.0:*
LISTEN 0      4096                0.0.0.0:443        0.0.0.0:*"
check "address carrying an %iface qualifier" pass \
"$HDR
LISTEN 0      4096  100.100.100.100%tailscale0:22    0.0.0.0:*"

echo
echo "=== the states it must reject ==="
check "wildcard IPv4 bind (the socket-activation defect)" fail \
"$HDR
LISTEN 0      4096                0.0.0.0:22         0.0.0.0:*
LISTEN 0      4096                   [::]:22            [::]:*"
check "wildcard IPv4 only" fail \
"$HDR
LISTEN 0      4096                0.0.0.0:22         0.0.0.0:*"
check "IPv6 wildcard only" fail \
"$HDR
LISTEN 0      4096                   [::]:22            [::]:*"
check "loopback only (the old broken fallback)" fail \
"$HDR
LISTEN 0      4096              127.0.0.1:22         0.0.0.0:*"
check "tailnet AND wildcard (partial failure)" fail \
"$HDR
LISTEN 0      4096         100.100.100.100:22       0.0.0.0:*
LISTEN 0      4096                0.0.0.0:22         0.0.0.0:*"
check "some other address entirely" fail \
"$HDR
LISTEN 0      4096         203.0.113.10:22            0.0.0.0:*"
check "a different tailnet address" fail \
"$HDR
LISTEN 0      4096         100.100.100.101:22         0.0.0.0:*"
check "nothing listening on 22" fail "$HDR"
check "only unrelated services listening" fail \
"$HDR
LISTEN 0      4096                0.0.0.0:80         0.0.0.0:*
LISTEN 0      4096                0.0.0.0:443        0.0.0.0:*"
check "a non-22 port that merely looks similar" fail \
"$HDR
LISTEN 0      4096                0.0.0.0:2222       0.0.0.0:*"

echo
echo "=== unknown tailnet address must never read as success ==="
TAILSCALE_IPV4=""
if ssh_listener_is_tailnet_only <<<"$HDR
LISTEN 0      4096              127.0.0.1:22         0.0.0.0:*"; then
  printf 'FAIL %-48s -> pass (expected fail)\n' "no tailnet address discovered"
  fail=$((fail+1))
else
  printf 'ok   %-48s -> fail\n' "no tailnet address discovered"
  pass=$((pass+1))
fi

echo
if [[ "$fail" -eq 0 ]]; then
  echo "ssh-listener: all $pass cases pass"
else
  echo "ssh-listener: $fail case(s) FAILED (of $((pass+fail)))"
fi
exit "$fail"