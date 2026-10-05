#!/usr/bin/env bash
# test-script-eol.sh - refuse CR bytes in any deployed shell script.
#
# Why this exists. /opt/reliastra/scripts is NOT synced by update.sh or by CI:
# a human copies the scripts from a working tree onto the host. `.gitattributes`
# pins deploy/production/scripts/*.sh to LF, but that only governs git's own
# checkout and normalisation - it does not stop an editor or a tool from writing
# CRLF into the working tree. When that happens the copy looks fine, the commit
# is clean, and the host breaks on the first `case`/`for` with
# "env: $'bash\r': No such file or directory" or a syntax error. That has now
# happened more than once (it took out preflight.sh and cleanup.sh before).
#
# So: check the bytes rather than trusting the toolchain, and check BOTH the
# working tree and the committed form, because they can differ.
#
# Usage: ./test-script-eol.sh   (exit 0 = clean)
set -uo pipefail

cd "$(dirname "$0")/../../.." || exit 1   # repo root

fail=0
checked=0

report() { # <kind> <path>
  printf 'FAIL %-9s %s contains CR bytes (CRLF line endings)\n' "$1" "$2"
  fail=$((fail+1))
}

# 1. Working tree - the copy an operator is about to make.
while IFS= read -r f; do
  checked=$((checked+1))
  if tr -cd '\r' < "$f" | grep -q .; then
    report "worktree" "$f"
  fi
done < <(find deploy/production/scripts -name '*.sh' -type f | sort)

# 2. Committed form - what the host would get from a clean checkout.
if git rev-parse --git-dir >/dev/null 2>&1; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    checked=$((checked+1))
    if git show ":$f" 2>/dev/null | tr -cd '\r' | grep -q .; then
      report "index" "$f"
    fi
  done < <(git ls-files 'deploy/production/scripts/*.sh')

  # 3. .gitattributes must keep pinning them, or this silently regresses.
  if ! git check-attr text -- deploy/production/scripts/harden-host.sh \
       | grep -q 'text: set'; then
    printf 'FAIL .gitattributes no longer pins deploy/production/scripts/*.sh to LF\n'
    fail=$((fail+1))
  fi
fi

if [[ "$fail" -eq 0 ]]; then
  echo "script-eol: $checked file(s) checked, all LF"
else
  echo "script-eol: $fail problem(s). Convert with: sed -i 's/\r$//' <file>"
fi
exit "$fail"