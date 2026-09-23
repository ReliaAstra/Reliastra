#!/usr/bin/env bash
# Release artifacts gate — the release is not publishable until the files a
# user will download have been proven to exist, to be complete for every
# supported platform, and to match checksums.txt.
#
#   bash cli/test/artifacts_check.sh <version> <dist-dir>
#
# GoReleaser writes dist/ (see .goreleaser.yaml): one raw binary per
# platform for the installers, one archive per platform for humans, and
# checksums.txt covering both. The npm and PyPI wrappers resolve the raw
# binary names, so a rename here is a breaking change for every installed
# copy at the next upgrade — which is what this script is here to catch.
#
# Nothing here is trusted from the release; everything is recomputed.
set -euo pipefail

VERSION="${1:-}"
DIST="${2:-dist}"

[ -n "$VERSION" ] || { echo "usage: artifacts_check.sh <version> <dist-dir>"; exit 1; }
VERSION="${VERSION#v}"
[ -d "$DIST" ] || { echo "FAIL: $DIST is not a directory"; exit 1; }

shasum_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

case "$(uname -s)" in
  Linux) HOST_OS="linux" ;;
  Darwin) HOST_OS="darwin" ;;
  *) HOST_OS="" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) HOST_ARCH="amd64" ;;
  arm64 | aarch64) HOST_ARCH="arm64" ;;
  *) HOST_ARCH="" ;;
esac

CHECKSUMS="$DIST/checksums.txt"
[ -f "$CHECKSUMS" ] || { echo "FAIL: $CHECKSUMS is missing"; exit 1; }

# `sha256sum -c` — the same verification a user runs, not a reimplementation
# of it. Reports once, on success; failures are reported by the caller.
verify_against_checksums() { # <file-relative-to-dist>
  local name="$1"
  grep -qF "  $name" "$CHECKSUMS" || { echo "FAIL: $name is not listed in checksums.txt"; return 1; }
  (cd "$DIST" && grep -F "  $name" checksums.txt | sha256sum -c - >/dev/null 2>&1) ||
    { echo "FAIL: $name does not match its checksums.txt entry"; return 1; }
  printf "   %-40s %10s bytes  sha256 verified\n" "$name" "$(wc -c <"$DIST/$name" | tr -d ' ')"
  return 0
}

TARGETS="linux amd64
linux arm64
darwin amd64
darwin arm64
windows amd64
windows arm64"

echo "── release artifacts ($VERSION)"
MISSING=0
while read -r goos goarch; do
  [ -n "$goos" ] || continue
  exe=""
  [ "$goos" = "windows" ] && exe=".exe"
  archive_ext="tar.gz"
  [ "$goos" = "windows" ] && archive_ext="zip"

  binary="reliastra_${VERSION}_${goos}_${goarch}${exe}"
  archive="reliastra_${VERSION}_${goos}_${goarch}.${archive_ext}"

  if [ ! -f "$DIST/$binary" ]; then
    echo "FAIL: $binary is missing from $DIST"
    MISSING=1
    continue
  fi
  if [ ! -f "$DIST/$archive" ]; then
    echo "FAIL: $archive is missing from $DIST"
    MISSING=1
    continue
  fi
  verify_against_checksums "$binary" || MISSING=1
  verify_against_checksums "$archive" || MISSING=1
done <<<"$TARGETS"
[ "$MISSING" = "0" ] || { echo "FAIL: release artifacts incomplete"; exit 1; }

# The host binary has to run, and has to report the version it was released
# as. This is the check that ties the artifact to the tag.
if [ -n "$HOST_OS" ] && [ -n "$HOST_ARCH" ]; then
  HOST_BINARY="$DIST/reliastra_${VERSION}_${HOST_OS}_${HOST_ARCH}"
  if [ -x "$HOST_BINARY" ] || [ -f "$HOST_BINARY" ]; then
    chmod +x "$HOST_BINARY" 2>/dev/null || true
    GOT="$("$HOST_BINARY" --version | head -1 | tr -d '[:space:]')"
    [ "$GOT" = "$VERSION" ] || {
      echo "FAIL: $HOST_BINARY --version printed '$GOT', want '$VERSION'"
      exit 1
    }
    echo "ok: host binary ($HOST_OS/$HOST_ARCH) runs and reports $VERSION"
  else
    echo "skip: host binary for $HOST_OS/$HOST_ARCH not in $DIST"
  fi
else
  echo "skip: host binary check (unsupported host $(uname -s)/$(uname -m))"
fi

# A release must not ship a version the wrappers cannot name: the npm and
# PyPI installers build exactly these filenames from their own package
# version.
for goos in linux darwin windows; do
  for goarch in amd64 arm64; do
    exe=""
    [ "$goos" = "windows" ] && exe=".exe"
    name="reliastra_${VERSION}_${goos}_${goarch}${exe}"
    grep -qF "  $name" "$CHECKSUMS" || {
      echo "FAIL: checksums.txt is missing an entry the installers will ask for: $name"
      exit 1
    }
  done
done

echo "artifacts: all checks passed ($VERSION)"
