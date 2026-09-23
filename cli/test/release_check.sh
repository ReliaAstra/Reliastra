#!/usr/bin/env bash
# Release gate — everything that must be true before a tag is allowed to
# become a release. One script, called by both .github/workflows/ci.yml (so
# release packaging cannot rot between tags) and the `verify` job of
# .github/workflows/release-cli.yml (so nothing is published unless all of
# it passes).
#
#   bash cli/test/release_check.sh              # check the tree as it stands
#   bash cli/test/release_check.sh v0.2.1       # check the tree against a tag
#   bash cli/test/release_check.sh --strict     # turns every "skip" into a failure
#
# What it checks, in order:
#
#   1. VERSION — one version, in all five places it has to appear: the tag,
#      the Go constant, npm package.json, pyproject.toml and __init__.py.
#      A mismatch here is exactly the drift this gate exists to prevent.
#   2. GO      — gofmt, go vet, go build, cross-compile the whole release
#      matrix (a file that only breaks on another OS must not ship),
#      `go test -race`.
#   3. RELEASE — `goreleaser check`, which validates .goreleaser.yaml
#      against the schema GoReleaser actually implements.
#   4. NPM     — the package has no dependencies and no install-time
#      scripts, and its bin points at the shim. A postinstall hook would
#      turn `npm install -g reliastra` into "execute code on the user's
#      machine", which the wrapper design deliberately avoids.
#   5. PYPI    — the distribution builds, passes `twine check`, declares no
#      runtime dependencies, and exposes the `reliastra` console script.
#   6. WRAPPERS — cli/test/wrappers_smoke_test.sh: both installers
#      download, verify, cache and exec against a fake release on loopback.
#
# Environment:
#   RELIASTRA_CHECK_SKIP_GO=1   skip the Go checks (no toolchain locally)
#   STRICT=1                    same as --strict
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

STRICT="${STRICT:-0}"
VERSION_ARG=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    -h | --help)
      sed -n '2,40p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) VERSION_ARG="$arg" ;;
  esac
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# `skip` is honest about a check that did not run. Nothing that gates a
# publish may skip in --strict mode, which is how CI calls this.
skip() {
  if [ "$STRICT" = "1" ]; then
    echo "FAIL: $1"
    exit 1
  fi
  echo "skip: $1"
}

fail() {
  echo "FAIL: $1"
  exit 1
}

ok() { echo "ok: $1"; }

require() {
  command -v "$1" >/dev/null 2>&1 || return 1
  return 0
}

version_in_npm() { node -p "require('$ROOT/cli/npm/package.json').version" 2>/dev/null; }
version_in_pyproject() { sed -n 's/^version = "\(.*\)"$/\1/p' "$ROOT/cli/python/pyproject.toml" | head -1; }
version_in_module() { sed -n 's/^__version__ = "\(.*\)"$/\1/p' "$ROOT/cli/python/src/reliastra/__init__.py" | head -1; }
version_in_go() { sed -n 's/^var version = "\(.*\)"$/\1/p' "$ROOT/cli/cmd/reliastra/main.go" | head -1; }

echo "── 1. version"

# The tag is the source of truth for a release version. With no argument,
# the tree's own version is checked for internal consistency instead, which
# is what a dry run and CI want.
if [ -n "$VERSION_ARG" ]; then
  VERSION="${VERSION_ARG#v}"
else
  VERSION="$(version_in_go)"
fi
[ -n "$VERSION" ] || fail "could not resolve a version (pass one, or fix cli/cmd/reliastra/main.go)"

case "$VERSION" in
  '' | *[!0-9A-Za-z.-]*) fail "version '$VERSION' is not a release version (want 0.2.1 or 0.2.1-rc.1)" ;;
esac
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  fail "version '$VERSION' is not semantic (want <major>.<minor>.<patch>[-prerelease])"
fi

GO_VERSION="$(version_in_go)"
NPM_VERSION="$(version_in_npm || true)"
PYPROJECT_VERSION="$(version_in_pyproject)"
MODULE_VERSION="$(version_in_module)"

echo "   tag/argument  ${VERSION_ARG:-<from tree>}"
echo "   cli/cmd/reliastra/main.go   $GO_VERSION"
echo "   cli/npm/package.json        ${NPM_VERSION:-<unreadable>}"
echo "   cli/python/pyproject.toml   $PYPROJECT_VERSION"
echo "   cli/python/…/__init__.py    $MODULE_VERSION"

[ "$GO_VERSION" = "$VERSION" ] || fail "cli/cmd/reliastra/main.go says $GO_VERSION, release says $VERSION"
[ "$PYPROJECT_VERSION" = "$VERSION" ] || fail "cli/python/pyproject.toml says $PYPROJECT_VERSION, release says $VERSION"
[ "$MODULE_VERSION" = "$VERSION" ] || fail "cli/python/src/reliastra/__init__.py says $MODULE_VERSION, release says $VERSION"
if [ -n "$NPM_VERSION" ]; then
  [ "$NPM_VERSION" = "$VERSION" ] || fail "cli/npm/package.json says $NPM_VERSION, release says $VERSION"
else
  skip "npm package version (node not available)"
fi
ok "one version across tag, Go, npm and PyPI ($VERSION)"

echo "── 2. Go CLI"

if [ "${RELIASTRA_CHECK_SKIP_GO:-0}" = "1" ]; then
  skip "Go checks (RELIASTRA_CHECK_SKIP_GO=1)"
elif ! require go; then
  skip "Go checks (no go on PATH)"
else
  UNFORMATTED="$(cd cli && gofmt -l .)"
  [ -z "$UNFORMATTED" ] || fail "gofmt would reformat: $UNFORMATTED"
  ok "gofmt"

  (cd cli && go vet ./...) || fail "go vet"
  ok "go vet"

  (cd cli && go build ./...) || fail "go build"
  ok "go build"

  # The whole release matrix, not a sample: prompt_echo_{unix,windows}.go is
  # build-tagged, so a Windows-only break compiles fine on Linux.
  while read -r goos goarch; do
    [ -n "$goos" ] || continue
    (cd cli && GOOS="$goos" GOARCH="$goarch" go build ./...) || fail "cross-compile $goos/$goarch"
    echo "   cross-compiled $goos/$goarch"
  done <<'MATRIX'
linux amd64
linux arm64
darwin amd64
darwin arm64
windows amd64
windows arm64
MATRIX
  ok "cross-compile matrix (linux/darwin/windows × amd64/arm64)"

  (cd cli && go test -race ./...) || fail "go test -race"
  ok "go test -race"
fi

echo "── 3. release configuration"

if require goreleaser; then
  goreleaser check || fail "goreleaser check"
  ok "goreleaser check"
else
  skip "goreleaser check (not installed; CI runs it)"
fi
[ -f "$ROOT/.goreleaser.yaml" ] || fail ".goreleaser.yaml is missing"
# The wrappers resolve these names; changing the release without them would
# break every installed copy at the next upgrade.
grep -q 'name_template: "{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}"' "$ROOT/.goreleaser.yaml" ||
  fail ".goreleaser.yaml no longer names binaries reliastra_<version>_<os>_<arch> — the npm/PyPI wrappers resolve that name"
grep -q 'name_template: "checksums.txt"' "$ROOT/.goreleaser.yaml" ||
  fail ".goreleaser.yaml no longer writes checksums.txt — the npm/PyPI wrappers verify against it"
ok "release asset naming matches the wrappers"

echo "── 4. npm package"

if ! require node; then
  skip "npm package checks (no node on PATH)"
else
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("cli/npm/package.json", "utf8"));
    const problems = [];
    for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) {
      if (pkg[key] && Object.keys(pkg[key]).length) problems.push(`${key} is not empty`);
    }
    // An install-time script is how a thin installer becomes code that runs
    // on a user machine at `npm install`. This package must not have one.
    for (const key of Object.keys(pkg.scripts || {})) {
      if (/^(pre|post)?(install|publish|prepare)/.test(key)) problems.push(`script ${key} runs at install/publish time`);
    }
    if (!pkg.bin || pkg.bin.reliastra !== "bin/reliastra.js") problems.push("bin.reliastra must be bin/reliastra.js");
    if (pkg.private) problems.push("package is marked private");
    const bin = "cli/npm/bin/reliastra.js";
    if (!fs.existsSync(bin)) problems.push(`${bin} is missing`);
    else {
      const head = fs.readFileSync(bin, "utf8").split("\n")[0];
      if (!head.startsWith("#!")) problems.push(`${bin} has no shebang`);
      const mode = fs.statSync(bin).mode & 0o111;
      if (!mode) problems.push(`${bin} is not executable`);
    }
    if (problems.length) {
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
  ' || fail "npm package checks"
  ok "npm package: no dependencies, no install scripts, bin wired"

  (cd cli/npm && npm pack --dry-run --json >/dev/null 2>&1) || fail "npm pack --dry-run"
  ok "npm pack --dry-run"
fi

echo "── 5. PyPI package"

if ! require python3; then
  skip "PyPI package checks (no python3 on PATH)"
else
  python3 -c "
import re, pathlib, sys
src = pathlib.Path('cli/python/src/reliastra/__init__.py').read_text()
# The wrapper must stay a wrapper: stdlib imports only, and no HTTP client
# beyond urllib (a dependency here would be a dependency for every user).
allowed = {'hashlib','os','pathlib','platform','stat','subprocess','sys','tempfile','urllib','__future__'}
imports = set(re.findall(r'^(?:from|import)\s+([a-zA-Z_][\w]*)', src, re.M))
extra = imports - allowed
if extra:
    print('  unexpected imports in the PyPI wrapper:', sorted(extra))
    sys.exit(1)
" || fail "PyPI wrapper imports"
  ok "PyPI wrapper: standard library only"

  if python3 -m build --help >/dev/null 2>&1; then
    rm -rf "$WORK/pydist"
    (cd cli/python && python3 -m build --outdir "$WORK/pydist" >/dev/null 2>&1) || fail "python -m build"
    ok "python -m build"

    python3 - "$WORK/pydist" "$VERSION" <<'PY' || fail "wheel metadata"
import pathlib, sys, zipfile
dist_dir, version = pathlib.Path(sys.argv[1]), sys.argv[2]
wheels = sorted(dist_dir.glob("*.whl"))
sdists = sorted(dist_dir.glob("*.tar.gz"))
if not wheels:
    print("  no wheel was built")
    sys.exit(1)
if not sdists:
    print("  no sdist was built")
    sys.exit(1)
wheel = wheels[0]
if not wheel.name.startswith(f"reliastra-{version}-"):
    print(f"  wheel {wheel.name} does not match version {version}")
    sys.exit(1)
if "py3-none-any" not in wheel.name:
    print(f"  wheel {wheel.name} is not pure Python; the CLI binary is downloaded, not built")
    sys.exit(1)
with zipfile.ZipFile(wheel) as z:
    names = z.namelist()
    metadata = z.read([n for n in names if n.endswith("METADATA")][0]).decode()
    for required in ("reliastra/__init__.py", "reliastra/__main__.py"):
        if required not in names:
            print(f"  {required} missing from the wheel")
            sys.exit(1)
    if "Requires-Dist" in metadata:
        print("  wheel declares a runtime dependency; the wrapper must not need one")
        sys.exit(1)
    entry_points = z.read(f"{wheel.name.split('-')[0]}-{version}.dist-info/entry_points.txt").decode()
    if "reliastra = reliastra:main" not in entry_points:
        print("  wheel does not expose the `reliastra` console script")
        sys.exit(1)
PY
    ok "wheel: pure Python, no dependencies, reliastra console script"

    if python3 -m twine --help >/dev/null 2>&1; then
      python3 -m twine check "$WORK/pydist/*" >/dev/null 2>&1 || fail "twine check"
      ok "twine check"
    else
      skip "twine check (twine not installed)"
    fi
  else
    skip "python -m build (pip install build to run this check)"
  fi
fi

echo "── 6. installer wrappers"

if require node && require python3; then
  bash cli/test/wrappers_smoke_test.sh || fail "wrappers smoke test"
  ok "wrappers smoke test"
else
  skip "wrappers smoke test (needs node and python3)"
fi

echo "release check: all checks passed ($VERSION)"
