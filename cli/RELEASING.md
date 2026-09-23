# Releasing the CLI

One tag publishes every distribution channel. There is one implementation of
the CLI (Go, in `cli/`), one release version, and one pipeline
(`.github/workflows/release-cli.yml`).

```text
                    cli/  ── Go, standard library only
                      │
            GoReleaser: 6 binaries + archives + checksums.txt
                      │
        ┌─────────────┼──────────────────────────────┐
        v             v                              v
  GitHub Release   npm package `reliastra`      PyPI package `reliastra`
   (canonical       (thin installer: downloads   (thin installer: same
    artifacts)       the binary on first run)     binary, same checksums)
        │             │            │
        └─────────────┴────────────┴────► all three run the same binary
                      │
        cli/vX.Y.Z tag ──► module proxy ──► go install …@latest
```

The npm and PyPI packages are launchers, not ports: no CLI logic is
implemented in JavaScript or Python. Their first run downloads the platform
binary from the GitHub release of their own version, verifies its SHA-256
against that release's `checksums.txt`, caches it, and execs it.

## 0. Version rules

A release version is a semantic version, `v`-prefixed as a tag and bare
everywhere else. It must be identical in five places, and the pipeline's
first job fails if it is not:

| Where | Form | Written by |
| --- | --- | --- |
| git tag | `v0.2.1` | you (`git tag`) |
| `cli/cmd/reliastra/main.go` | `var version = "0.2.1"` | `make cli-release-prep` |
| `cli/npm/package.json` | `"version": "0.2.1"` | `make cli-release-prep` |
| `cli/python/pyproject.toml` | `version = "0.2.1"` | `make cli-release-prep` |
| `cli/python/src/reliastra/__init__.py` | `__version__ = "0.2.1"` | `make cli-release-prep` |

The tag is the source of truth for a release: the workflow stamps it into
the binaries with `-ldflags -X main.version=…` (`.goreleaser.yaml`) and
rewrites the npm and PyPI package versions from it before publishing, so a
published package can only ever download the binary of its own version.
`reliastra --version` reads that stamped value, falling back to the module
version the Go toolchain embedded — which is what makes a `go install`ed
binary report the version it was installed as.

`cli/python/LICENSE` is a copy of `cli/LICENSE`; keep the two identical.

## 1. One-time setup (per registry)

Both registries use **trusted publishing** (OIDC): GitHub mints a
short-lived token for the workflow run and the registry checks it against
the publisher registered for this repository and workflow file. No API
token is stored in this repository, and no secret is needed once setup is
done.

### GitHub

Nothing to configure. The workflow uses the built-in `GITHUB_TOKEN` with
job-scoped permissions (`contents: write` only for the job that creates the
release, `id-token: write` only for the two publish jobs).

One thing to know: the `binaries` job also pushes a **Go module tag**,
`cli/v0.2.1`, at the same commit as `v0.2.1`. The CLI is a Go module in a
subdirectory (`cli/go.mod`), and the module proxy versions subdirectory
modules from tags carrying that subdirectory as a prefix — without it, `go
install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest` cannot
resolve. One release, one commit, two tags.

### npm

npm can only attach a trusted publisher to a package that already exists,
so the **first** publish is done by a human:

```bash
# after the first GitHub release exists (step 2), from a clean checkout:
cd cli/npm
npm version 0.2.0 --no-git-tag-version       # the release version
npm publish --access public --provenance     # 2FA prompt
```

Then, once on npmjs.com → package `reliastra` → **Settings** → **Trusted
Publisher** → *GitHub Actions*:

| Field | Value |
| --- | --- |
| Organization or user | `ReliaAstra` (capitalise exactly as GitHub shows it) |
| Repository | `Reliastra` |
| Workflow filename | `release-cli.yml` |
| Environment name | **blank** — the npm job declares no environment |

After the first OIDC publish succeeds, set publishing access to *Require
two-factor authentication and disallow tokens*.

**Fallback:** a granular access token stored as the `NPM_TOKEN` secret
(automation type, publish permission). The publish step uses it whenever it
is present, and needs nothing else. Remove it once trusted publishing
works.

Requirements the workflow handles: `id-token: write`, Node 24 (npm ≥
11.5.1, which trusted publishing needs — the job upgrades npm if the runner
is older), and a package.json `repository` field matching this repository.

### PyPI

pypi.org → **Publishing** → *Add a pending publisher* (a *pending* publisher
is enough for a first release; no manual first upload):

| Field | Value |
| --- | --- |
| PyPI project name | `reliastra` |
| Owner | `ReliaAstra` |
| Repository name | `Reliastra` |
| Workflow name | `release-cli.yml` |
| Environment name | `pypi` |

The `pypi` job declares `environment: pypi`, so create that environment in
*Settings → Environments* (no protection rules needed) if it does not exist
yet.

**Fallback:** a PyPI API token stored as the `PYPI_API_TOKEN` secret. The
publish action uses it when it is non-empty, and trusted publishing
otherwise.

> The workflow filename is part of both trust relationships. Renaming
> `release-cli.yml` means updating npm and PyPI.

## 2. Cut a release

From a clean checkout of `main`:

```bash
# a. One version, everywhere it has to appear.
make cli-release-prep VERSION=0.2.1

# b. Document it at the top of cli/CHANGELOG.md (newest first).

# c. Run the whole gate locally — the same checks CI and the pipeline run.
make cli-check          # add RELIASTRA_CHECK_SKIP_GO=1 without a Go toolchain

# d. Optionally build the release without publishing it and look at dist/.
make cli-dry-run
bash cli/test/artifacts_check.sh 0.2.1 dist

# e. Commit, tag, push. The tag is what starts the pipeline.
git add -A && git commit -m "release: reliastra 0.2.1"
git tag v0.2.1
git push origin main
git push origin v0.2.1
```

The pipeline then runs, in order, and stops on the first failure:

| Job | Does | Publishes |
| --- | --- | --- |
| `verify` | one version everywhere; gofmt, vet, build, cross-compile all six targets, `go test -race`; `goreleaser check`; npm and PyPI packaging checks (no dependencies, no install scripts); installer smoke test | — |
| `binaries` | GoReleaser: 6 binaries, archives, checksums.txt, GitHub release; pushes the `cli/v0.2.1` module tag | GitHub release |
| `npm` | packs and publishes `reliastra` (OIDC) | npm |
| `pypi` | builds sdist+wheel and publishes `reliastra` (OIDC) | PyPI |
| `install-smoke` | installs through npm and pip from the real release and runs the CLI | — |

Nothing is published unless `verify` passes: a test failure, a formatting
failure, a version mismatch and a package that grew a dependency are all
caught before a release exists.

## 3. Dry run (no publishing)

```bash
# Everything except the last mile: build, package, verify, install — and
# `npm publish --dry-run` instead of publishing.
gh workflow run release-cli.yml --ref main
#   → tag: (leave empty)   dry_run: true
```

Locally:

```bash
goreleaser check                                  # config schema
make cli-dry-run                                  # build a release, publish nothing
bash cli/test/artifacts_check.sh 0.2.1 dist       # every platform, checksums
make cli-install-smoke DIST=dist                  # npm + pip install, then run it
(cd cli/npm && npm pack --dry-run)
(cd cli/python && python -m build && python -m twine check dist/*)
bash cli/test/wrappers_smoke_test.sh              # fake release on loopback
```

## 4. Verify a release

```bash
reliastra --version                                   # the tag, without the v
npm view reliastra version                            # same
pip index versions reliastra                           # same
gh release view v0.2.1                                 # binaries + checksums.txt
go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@v0.2.1
```

Then on a clean machine (or with `RELIASTRA_CACHE` cleared), install
through each channel and run one command — that is the path the wrappers
exist for, and the one install-smoke exercises on every release.

## 5. When something goes wrong

- **A publish failed after the GitHub release was created** — the release is
  real and the binaries are fine. Fix the registry configuration and re-run
  the failed job (*Actions → Release CLI → Re-run failed jobs*). Publishing
  the same version twice is rejected by both registries; cut a new version
  instead of re-tagging.
- **npm: `404` or "unable to authenticate" with trusted publishing** — npm
  could not match the run to the registered publisher. Check the workflow
  filename, the owner's capitalisation, that `package.json` `repository`
  matches, and that npm is ≥ 11.5.1. An empty `NODE_AUTH_TOKEN` is correct
  when using OIDC.
- **PyPI: 403 on upload** — the pending publisher's owner/repo/workflow or
  environment name does not match, or the environment does not exist.
- **Wrappers fail a checksum** — the release assets and `checksums.txt`
  disagree, or a proxy altered the download. Do not re-tag; cut a new
  version.
- **A version was published with the wrong binary** — impossible by
  construction: the wrapper downloads `v<its own package version>` and
  verifies it against that release's `checksums.txt`. If it ever happens,
  the release's assets were modified after publication; treat it as a
  security incident, yank the PyPI file, deprecate the npm version, and cut
  a new release.
