# reliastra (npm package)

RELIASTRA command-line client — probes, verdicts, evidence records, public
verification. This is a **thin installer**: the CLI itself is a Go binary
published by [GoReleaser](../../.goreleaser.yaml); this package downloads it
and runs it.

```bash
npm install -g reliastra
npx reliastra --help    # try without installing
```

## How it works

- The package is a single script with **zero npm dependencies** and **no
  install-time scripts** — `npm install` runs no postinstall, makes no
  network request, and executes no downloaded code.
- On the first `reliastra` invocation, the shim downloads
  `reliastra_<version>_<os>_<arch>` from the GitHub release matching the
  package version, verifies its **SHA-256 against that release's
  `checksums.txt`**, caches it, and execs it with your arguments.
- The cache is shared with the PyPI wrapper of the same version and lives
  at `~/.cache/reliastra` (Linux), `~/Library/Caches/reliastra` (macOS), or
  `%LOCALAPPDATA%\reliastra\Cache` (Windows).
- Exit codes, `--json`, and `--help` are the CLI's own — the shim only
  passes them through.

## Environment

| Variable                | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `RELIASTRA_BIN`         | Use this existing binary; skip the download        |
| `RELIASTRA_RELEASE_URL` | Alternate release asset base URL: https, or http on localhost (mirrors/airgap) |
| `RELIASTRA_CACHE`       | Move the binary cache                              |

`RELIASTRA_RELEASE_URL` is the one variable that decides where a binary is
fetched from, so it is restricted to https (http is allowed on `localhost`
for a mirror or a test). Anything else is refused rather than resolved.

Supported platforms: Linux, macOS, Windows on amd64/arm64 (Node >= 18).
Anything else fails with that message instead of guessing:
`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest`.

Upgrading is `npm update -g reliastra`; each version caches its own binary,
so an upgrade downloads once. Uninstalling is `npm uninstall -g reliastra`
plus `rm -rf ~/.cache/reliastra` (Linux) if you want the binaries gone.

See [the CLI README](../README.md) for usage, or
[RELEASING.md](../RELEASING.md) for how releases reach this package.
