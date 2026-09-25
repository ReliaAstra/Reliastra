# reliastra (PyPI package)

RELIASTRA command-line client — probes, verdicts, evidence records, public
verification. **This package is a thin installer, not a port.** The CLI is a
single Go binary built and released from
[github.com/ReliaAstra/Reliastra](https://github.com/ReliaAstra/Reliastra)
(`cli/`); this package downloads that binary and runs it. The same binary is
also on npm (`npm install -g reliastra`) and via
`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest`.

```bash
pipx install reliastra     # recommended: isolated, on PATH
# or
pip install reliastra

reliastra --version        # downloads the binary on first run, then prints e.g. 0.2.0
reliastra --help
```

## How it works

- The wheel is pure Python, identical on every platform, **standard
  library only**, and has **no build hooks** — nothing is downloaded or
  executed at install time.
- On the first `reliastra` invocation the package downloads
  `reliastra_<version>_<os>_<arch>` over HTTPS from the GitHub release
  whose tag equals this package's version (`v<version>`), verifies its
  **SHA-256 against that release's `checksums.txt`**, caches it with
  executable permission, and runs it with your arguments. A mismatch is
  discarded and nothing is executed.
- The cache is per version and shared with the npm package:
  `~/.cache/reliastra` (Linux, or `$XDG_CACHE_HOME/reliastra`),
  `~/Library/Caches/reliastra` (macOS), `%LOCALAPPDATA%\reliastra\Cache`
  (Windows). Upgrading the package downloads the new version once.
- Exit codes, `--json`, `--help`, `--version` are the Go CLI's own — the
  package only passes them through. `python -m reliastra` is the same
  entry point as the `reliastra` console script.

## Supported platforms

Linux, macOS, Windows on amd64 (x86_64) and arm64 (aarch64 / Apple
silicon); Python ≥ 3.9. On any other platform the package exits with a
message instead of guessing — use
`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest`.

## Environment

| Variable                | Purpose                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `RELIASTRA_BIN`         | Run this binary instead of downloading. Must be an absolute path to a regular file.     |
| `RELIASTRA_RELEASE_URL` | Alternate release base URL for mirrors/air-gap. Must be `https://` (http: loopback only).|
| `RELIASTRA_CACHE`       | Move the binary cache.                                                                  |

## Upgrade / uninstall

```bash
pipx upgrade reliastra         # or: pip install --upgrade reliastra
pipx uninstall reliastra       # or: pip uninstall reliastra
                               # then optionally: rm -rf ~/.cache/reliastra
```

Full CLI documentation, versioning and troubleshooting:
https://github.com/ReliaAstra/Reliastra/blob/main/cli/README.md
