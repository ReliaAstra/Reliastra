#!/usr/bin/env bash
# version.sh — the one place the CLI's version is read, checked and set.
#
# The release version lives in exactly one authoritative place: the git tag
# (vX.Y.Z). Four files carry a copy of it so that builds which never see a
# tag still report the right thing:
#
#   cli/cmd/reliastra/main.go              `reliastra --version` (go install)
#   cli/npm/package.json                   npm package version
#   cli/python/pyproject.toml              PyPI package version
#   cli/python/src/reliastra/__init__.py   fallback when run from a checkout
#
# A release where those disagree with the tag is a release where
# `go install …@vX.Y.Z` reports one version and the npm/PyPI wrappers
# download another. So the release workflow refuses to build unless they
# all equal the tag, and CI refuses to merge unless they all equal each
# other. This script is what both of them run.
#
# Usage:
#   cli/scripts/version.sh get                 print the version in main.go
#   cli/scripts/version.sh check               all four files agree
#   cli/scripts/version.sh check v1.2.3        all four files equal 1.2.3
#   cli/scripts/version.sh set 1.2.3           rewrite all four files
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAIN_GO="$ROOT/cli/cmd/reliastra/main.go"
PACKAGE_JSON="$ROOT/cli/npm/package.json"
PYPROJECT="$ROOT/cli/python/pyproject.toml"
PY_INIT="$ROOT/cli/python/src/reliastra/__init__.py"

# Strict semver: MAJOR.MINOR.PATCH with an optional pre-release. No build
# metadata: npm and PyPI both reject `+` suffixes.
SEMVER='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'

die() { echo "version.sh: $*" >&2; exit 1; }

strip_v() { printf '%s' "${1#v}"; }

read_go()      { sed -n 's/^var version = "\(.*\)"$/\1/p' "$MAIN_GO"; }
read_npm()     { sed -n 's/^  "version": "\(.*\)",$/\1/p' "$PACKAGE_JSON"; }
read_pyproj()  { sed -n 's/^version = "\(.*\)"$/\1/p' "$PYPROJECT"; }
read_pyinit()  { sed -n 's/^__version__ = "\(.*\)"$/\1/p' "$PY_INIT"; }

report() {
  printf '  %-40s %s\n' "cli/cmd/reliastra/main.go" "$(read_go)"
  printf '  %-40s %s\n' "cli/npm/package.json" "$(read_npm)"
  printf '  %-40s %s\n' "cli/python/pyproject.toml" "$(read_pyproj)"
  printf '  %-40s %s\n' "cli/python/src/reliastra/__init__.py" "$(read_pyinit)"
}

cmd_get() { read_go; }

cmd_check() {
  local want="${1:-}"
  local go npm pyproj pyinit
  go="$(read_go)"; npm="$(read_npm)"; pyproj="$(read_pyproj)"; pyinit="$(read_pyinit)"
  for v in "$go" "$npm" "$pyproj" "$pyinit"; do
    [ -n "$v" ] || { report; die "could not read a version from one of the files above"; }
    [[ "$v" =~ $SEMVER ]] || { report; die "'$v' is not a semver version"; }
  done
  if [ "$go" != "$npm" ] || [ "$go" != "$pyproj" ] || [ "$go" != "$pyinit" ]; then
    report
    die "versions disagree; run: cli/scripts/version.sh set <version>"
  fi
  if [ -n "$want" ]; then
    want="$(strip_v "$want")"
    [[ "$want" =~ $SEMVER ]] || die "'$1' is not a semver tag (want vMAJOR.MINOR.PATCH)"
    if [ "$go" != "$want" ]; then
      report
      die "tree is at $go but the tag says $want; run: cli/scripts/version.sh set $want && commit, then tag that commit"
    fi
  fi
  echo "version.sh: ok — $go"
}

cmd_set() {
  local v
  v="$(strip_v "${1:-}")"
  [ -n "$v" ] || die "usage: version.sh set <version>"
  [[ "$v" =~ $SEMVER ]] || die "'$v' is not a semver version"
  # sed -i differs between GNU and BSD; write through a temp file instead.
  rewrite() { # <file> <sed-expr>
    local tmp; tmp="$(mktemp)"
    sed "$2" "$1" > "$tmp" && cat "$tmp" > "$1" && rm -f "$tmp"
  }
  rewrite "$MAIN_GO"      "s/^var version = \".*\"$/var version = \"$v\"/"
  rewrite "$PACKAGE_JSON" "s/^  \"version\": \".*\",$/  \"version\": \"$v\",/"
  rewrite "$PYPROJECT"    "s/^version = \".*\"$/version = \"$v\"/"
  rewrite "$PY_INIT"      "s/^__version__ = \".*\"$/__version__ = \"$v\"/"
  cmd_check "$v"
}

case "${1:-}" in
  get)   cmd_get ;;
  check) cmd_check "${2:-}" ;;
  set)   cmd_set "${2:-}" ;;
  *)     sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
