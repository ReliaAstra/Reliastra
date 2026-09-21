# Releasing the CLI

One tag publishes every distribution channel. Push `v0.2.1` and
[release-cli.yml](../.github/workflows/release-cli.yml) runs three stages,
each dependent on the last:

| Stage | Produces | Consumed by |
| --- | --- | --- |
| `binaries` (goreleaser) | GitHub release with binaries (linux/darwin/windows × amd64/arm64), tar.gz/zip archives, raw binaries, `checksums.txt` | humans; the wrappers |
| `npm` | package [`reliastra`](https://www.npmjs.com/package/reliastra) — thin installer that downloads the raw binary from that release | `npm i -g reliastra` |
| `pypi` | package [`reliastra`](https://pypi.org/project/reliastra/) — same installer shape | `pipx install reliastra`, `pip install reliastra` |

`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest` picks
the same tag up automatically through the module proxy; nothing extra to do.

The npm/PyPI packages are launchers, not ports: their first run downloads
the release's raw binary and verifies its SHA-256 against that release's
`checksums.txt` before executing anything. Their committed versions are
placeholders — the workflow rewrites them from the tag, so a wrapper's
version always equals the binary version it downloads.

## 1. One-time setup (per package registry)

Both registries use **trusted publishing** (OIDC) — no API tokens in
GitHub secrets, and provenance is attached to each publish.

**npm** — on npmjs.com → package `reliastra` → Settings → Publishing:
link the trusted publisher `ReliaAstra/Reliastra`, workflow file
`release-cli.yml`. The workflow needs `id-token: write` (it has it) and
npm ≥ 11.5 (Node 24 — the workflow pins it). Before the package exists,
`npm publish` needs a human: run it once from `cli/npm` after the first
GitHub release, or add a `NPM_TOKEN` secret (automation type) as a
fallback — the publish step uses it automatically when present.

**PyPI** — on pypi.org → project `reliastra` → Publishing → add a pending
trusted publisher: `ReliaAstra/Reliastra`, workflow `release-cli.yml`,
environment `pypi` (the job declares that environment). Fallback: a
`PYPI_API_TOKEN` secret works without any other change. A pending
publisher is enough for the very first release; no manual first publish
needed.

Note the workflow filename matters: trusted publishers are keyed to
`release-cli.yml`. If the file is renamed, update both registries.

## 2. Cut a release

From a clean checkout of `main`:

```bash
# a. Bump the CLI's own version (reliastra --version reports it)
sed -i 's/var version = "0.2.0"/var version = "0.2.1"/' cli/cmd/reliastra/main.go

# b. Keep the wrappers' placeholder versions in sync (the workflow
#    overwrites these from the tag, but keep the tree honest)
sed -i 's/"version": "0.2.0"/"version": "0.2.1"/' cli/npm/package.json
sed -i 's/^version = "0.2.0"/version = "0.2.1"/' cli/python/pyproject.toml
sed -i 's/^__version__ = "0.2.0"/__version__ = "0.2.1"/' cli/python/src/reliastra/__init__.py

# c. Document the release in cli/CHANGELOG.md (top section, newest first)

# d. Commit, tag, push
git add -A && git commit -m "release: reliastra 0.2.1"
git tag v0.2.1 && git push origin main v0.2.1
```

The workflow then: builds 6 binaries, attaches archives + raw binaries +
`checksums.txt` to the GitHub release, publishes npm, publishes PyPI.

## 3. Dry-run locally (before tagging)

```bash
# Config schema (catches .goreleaser.yaml rot; also runs in CI)
goreleaser check

# Full build + packaging, no publish — inspect dist/ by hand
goreleaser release --snapshot --clean --skip=publish

# Wrapper behavior end-to-end (fake release on loopback; no network)
bash cli/test/wrappers_smoke_test.sh

# Packaging checks for both wrappers
(cd cli/npm && npm pack --dry-run)
(cd cli/python && python -m build && twine check dist/*)
```

`goreleaser release --snapshot` needs Go ≥ 1.23 and builds all six
platform targets; CGO is off, so no platform SDKs are required.

## 4. Verify a release

After the workflow finishes:

```bash
reliastra --version                    # matches the tag
npm view reliastra version             # matches the tag
pip index versions reliastra           # matches the tag
```

Then on a clean machine (or cleared `RELIASTRA_CACHE`), install through
each channel and run one command — this exercises the real download and
checksum path the wrappers exist for.

## 5. When something goes wrong

- **Wrappers fail checksum** — the release assets and `checksums.txt`
  disagree, or a proxy mangles the download. Check the release page;
  do not re-tag over a broken release, cut a new version.
- **npm publish rejected (version exists)** — the tag was re-pushed over
  a published version. Never re-push tags; cut `0.2.2`.
- **PyPI publish rejected** — trusted publisher misconfigured, or the
  version was already uploaded (PyPI never allows re-upload; new version).
- **Bad release, need it gone** — npm: `npm dist-tag` / deprecate, publish
  fixed version. PyPI: yank the file. GitHub: delete the release but keep
  the tag immutable. Users with a cached good binary are unaffected; the
  wrappers only download a version matching themselves.
