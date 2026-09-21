# reliastra (PyPI package)

RELIASTRA command-line client — probes, verdicts, evidence records, public
verification. This is a **thin installer**: the CLI itself is a Go binary
published by [GoReleaser](../../.goreleaser.yaml); this package downloads it
and runs it.

```bash
pipx install reliastra     # recommended: isolated, on PATH
# or
pip install reliastra
```

## How it works

- The wheel is pure Python and identical on every platform. **Nothing is
  downloaded or executed at install time** — there are no build hooks.
- On the first `reliastra` invocation, the shim downloads
  `reliastra_<version>_<os>_<arch>` from the GitHub release matching the
  package version, verifies its **SHA-256 against that release's
  `checksums.txt`**, caches it, and execs it with your arguments.
- The cache is shared with the npm wrapper of the same version and lives at
  `~/.cache/reliastra` (Linux), `~/Library/Caches/reliastra` (macOS), or
  `%LOCALAPPDATA%\reliastra\Cache` (Windows).
- Exit codes, `--json`, and `--help` are the CLI's own — the shim only
  passes them through.

## Environment

| Variable                | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `RELIASTRA_BIN`         | Use this existing binary; skip the download        |
| `RELIASTRA_RELEASE_URL` | Alternate release asset base URL (mirrors/airgap)  |
| `RELIASTRA_CACHE`       | Move the binary cache                              |

Supported platforms: Linux, macOS, Windows on amd64/arm64. Anything else:
`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest`.

See [the CLI README](../README.md) for usage, or
[RELEASING.md](../RELEASING.md) for how releases reach this package.
