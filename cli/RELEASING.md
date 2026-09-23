# Releasing the CLI

There is one CLI: the Go program in `cli/cmd/reliastra`. A release is one
git tag, `vX.Y.Z`, and [release-cli.yml](../.github/workflows/release-cli.yml)
turns that tag into every way of installing the same binary:

```
                   git tag vX.Y.Z  (on main)
                          │
                          ▼
                     validate ── tag is semver; main.go / package.json /
                          │       pyproject.toml / __init__.py all == X.Y.Z
                          ▼
                       test ───── gofmt, vet, go test -race, 6-target
                          │       cross-compile, wrapper smoke test,
                          │       npm pack / python -m build / twine check
                          ▼
                     binaries ─── goreleaser: build, archive, checksums.txt,
                          │       GitHub Release; run a built binary and
                          │       assert --version == X.Y.Z; attest provenance
                 ┌────────┴────────┐
                 ▼                 ▼
               npm               pypi ──── each re-checks version == tag and
     (trusted publishing)  (trusted publishing)  that the release assets exist,
                 │                 │       publishes, then verifies the registry
                 └────────┬────────┘
                          ▼
                  same reliastra binary
```

| Stage | Produces | Consumed by |
| --- | --- | --- |
| `binaries` (goreleaser) | GitHub release: `reliastra_X.Y.Z_{os}_{arch}[.exe]` raw binaries, `reliastra_X.Y.Z_{os}_{arch}.tar.gz`/`.zip` archives, `checksums.txt`, SLSA provenance attestations | humans; the wrappers |
| `npm` | package [`reliastra`](https://www.npmjs.com/package/reliastra) `X.Y.Z` — thin installer that downloads the raw binary from that release | `npm install -g reliastra` |
| `pypi` | package [`reliastra`](https://pypi.org/project/reliastra/) `X.Y.Z` — same installer shape | `pipx install reliastra`, `pip install reliastra` |

`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest` needs
no stage at all: the module proxy serves the source at the tagged commit,
and `main.go` already carries the version (see §2), so `--version` is right
without ldflags.

Platform matrix: linux, darwin, windows × amd64, arm64 — six binaries. The
CLI is standard-library only with `CGO_ENABLED=0`, so nothing else is
needed to build them; the `test` stage cross-compiles all six before
anything is released.

## 1. One-time setup (per registry, once ever)

Both registries use **trusted publishing** (OpenID Connect): the workflow
proves its identity to the registry with a short-lived GitHub token, and no
registry credential is stored anywhere. Provenance is attached to each
publish. The pieces that have to agree, exactly and case-sensitively:

| | value |
| --- | --- |
| repository | `ReliaAstra/Reliastra` |
| workflow filename | `release-cli.yml` |
| GitHub environment (npm job) | `npm` |
| GitHub environment (pypi job) | `pypi` |

Renaming the workflow file or either environment means updating the
registry side too.

**GitHub** — Settings → Environments: create `npm` and `pypi`. Optionally add
required reviewers to each; that makes every publish a human-approved step
without touching the workflow. No secrets are needed in either environment.

**PyPI** — https://pypi.org/manage/account/publishing/ → "Add a new pending
publisher": project `reliastra`, owner `ReliaAstra`, repository
`Reliastra`, workflow `release-cli.yml`, environment `pypi`. A *pending*
publisher creates the project on first publish, so PyPI needs no manual
first upload and no token, ever.

**npm** — npm can configure a trusted publisher only on a package that
already exists, so the very first `reliastra` publish is a bootstrap:

1. Create a granular access token on npmjs.com (Packages and scopes:
   read/write, bypass 2FA for automation) with the shortest expiry offered.
2. Add it as the `NPM_TOKEN` secret **on the `npm` environment** (not the
   repository), so only that job can read it.
3. Cut the first release (§2). The npm job uses the token because OIDC has
   no package to bind to yet.
4. On npmjs.com → package `reliastra` → Settings → Publishing access: add
   trusted publisher GitHub Actions, `ReliaAstra/Reliastra`,
   `release-cli.yml`, environment `npm`; then select **"Require two-factor
   authentication and disallow tokens"**.
5. Delete the `NPM_TOKEN` secret and revoke the token on npmjs.com. From
   the second release on, the job authenticates with OIDC only; `npm
   publish` (npm ≥ 11.5.1, which Node 24 ships) does the exchange itself
   when `NODE_AUTH_TOKEN` is empty.

Before any of this, confirm the names are still free: `npm view reliastra`
and `pip index versions reliastra` must both report not found (they did on
2026-09-23). If either name is taken, stop — do not publish under a
different name without a decision on record.

## 2. Cut a release

The version lives in four files, kept identical by
`cli/scripts/version.sh`, and the tag must equal them. CI (`ci.yml`) fails
a PR where they disagree; the release workflow fails a tag they do not
match. Neither CI nor the workflow ever rewrites them.

From a clean checkout of `main`:

```bash
# a. Set the version everywhere (main.go, package.json, pyproject.toml, __init__.py)
cli/scripts/version.sh set 0.2.1

# b. Document the release in cli/CHANGELOG.md (top section, newest first)

# c. Everything the workflow's validate+test stages will check, locally
make cli-release-check VERSION=v0.2.1

# d. Commit and land it on main (PR, or push if you have rights)
git add -A && git commit -m "release: reliastra 0.2.1"
git push origin main            # or merge the PR, then: git pull

# e. Tag the commit that is now on main, and push the tag
git tag -a v0.2.1 -m "reliastra 0.2.1"
git push origin v0.2.1
```

Then watch https://github.com/ReliaAstra/Reliastra/actions/workflows/release-cli.yml.
Pre-releases work the same way with a suffix (`0.3.0-rc.1`, tag
`v0.3.0-rc.1`): GitHub marks the release as a pre-release, npm and PyPI
accept the version string, and the wrappers download it by exact version.

Rules the workflow enforces, so you do not have to remember them:

- the tag is `vMAJOR.MINOR.PATCH[-pre]`, and its commit is on `main`;
- all four version files equal the tag, or nothing is built;
- tests, cross-compiles and wrapper checks pass, or nothing is released;
- the built binary's `--version` equals the tag, or nothing is published;
- `checksums.txt` lists all six raw binaries and verifies, or nothing is
  published;
- npm and PyPI each confirm the release assets exist, publish, and then
  confirm the registry serves the new version — a failure names the
  channel that failed.

## 3. Dry-run locally (before tagging)

```bash
make cli-release-check VERSION=v0.2.1       # the validate + test stages

goreleaser check                              # config schema (also in CI)
goreleaser release --snapshot --clean --skip=publish
ls dist/                                      # six binaries, archives, checksums.txt
dist/reliastra_*_linux_amd64 --version        # "<next>-snapshot+<sha>": never a tag version

bash cli/test/wrappers_smoke_test.sh          # wrappers vs a fake release on loopback
```

To exercise the *real* wrappers against *real* binaries without a GitHub
release, serve a directory shaped like a release
(`v0.2.1/reliastra_0.2.1_<os>_<arch>` + `checksums.txt`) on loopback and
point them at it with `RELIASTRA_RELEASE_URL=http://127.0.0.1:<port>`
(plain http is accepted for loopback only) and a scratch
`RELIASTRA_CACHE`. `npm install -g --prefix <dir> <tgz from npm pack>` and
`pip install cli/python/dist/*.whl` into a venv give you the installed
shape users get.

## 4. Verify a release

After the workflow is green:

```bash
gh release view v0.2.1 -R ReliaAstra/Reliastra   # 6 raw binaries, 6 archives, checksums.txt
npm view reliastra version                        # 0.2.1
pip index versions reliastra                      # 0.2.1
GOFLAGS=-mod=mod go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@v0.2.1 && reliastra --version
gh attestation verify reliastra_0.2.1_linux_amd64 -R ReliaAstra/Reliastra
```

Then on a clean machine (or with `RELIASTRA_CACHE` pointed at an empty
directory), install through each channel and run `reliastra --version`,
`reliastra --help` and one real command — this exercises the download and
checksum path the wrappers exist for.

## 5. When something goes wrong

- **`validate` fails: versions disagree** — run
  `cli/scripts/version.sh set X.Y.Z`, commit, and tag *that* commit with a
  new version. Never move or re-push a tag.
- **`test` or `binaries` fails** — nothing was published; fix on `main`
  and cut the next patch version. If a GitHub release was half-created,
  delete the release (keep the tag; tags are immutable history).
- **`npm` fails** — the GitHub release and PyPI are unaffected. Fix the
  cause (usually trusted-publisher configuration or a taken version) and
  re-run *only* the failed job from the Actions UI; the job re-checks
  version and assets before publishing.
- **`pypi` fails** — same as npm: fix and re-run the job. PyPI never
  accepts a re-upload of an existing version; a bad upload means a new
  version.
- **Wrappers fail checksum in the wild** — the assets and `checksums.txt`
  disagree, or a proxy is mangling downloads. Do not edit assets on an
  existing release; cut a new version.
- **Bad release, need it gone** — npm: `npm deprecate reliastra@X.Y.Z
  "<reason>"`. PyPI: yank the release. GitHub: delete the release. Cached
  binaries on user machines are unaffected; the wrappers download only the
  version that matches their own.
