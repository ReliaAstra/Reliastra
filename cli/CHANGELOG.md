# CLI changelog

## Unreleased — distribution

The CLI can now be installed without Go. Alongside `go install`, one tag
push now publishes prebuilt binaries plus two thin installer packages
(see cli/RELEASING.md):

- `npm install -g reliastra`
- `pipx install reliastra` (or `pip install reliastra`)
- binaries and archives on the GitHub release

The npm and PyPI packages are launchers, not ports: no CLI logic was
rewritten. On first run they download the platform binary published by
GoReleaser, verify its SHA-256 against the release's `checksums.txt`,
cache it (one cache, shared between the two wrappers, relocated with
`RELIASTRA_CACHE`), and hand off with arguments and exit codes untouched.
Nothing runs or downloads at install time (no postinstall scripts), and
`RELIASTRA_BIN` points a wrapper at an existing binary to skip the
download entirely.

Release packaging is checked in CI: `goreleaser check` validates
`.goreleaser.yaml`, and `cli/test/wrappers_smoke_test.sh` exercises both
wrappers end-to-end (download, verify, exec, cache reuse, `RELIASTRA_BIN`
override, tampered-checksum refusal) against a fake release on loopback.

## 0.2.0 — Go rewrite

The CLI is now a single static Go binary (`cli/`, standard library only). The
Node implementation (`bin/`, `src/`, `package.json`) is removed. Install with
`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest`, build with `go build`,
or run from a checkout with `go run ./cli/cmd/reliastra …`.

Commands, flags, exit codes (0–6), output prose, and the credential precedence
(`--token` → `RELIASTRA_TOKEN` → config file) are unchanged. The differences
below are the only intentional behavior changes; everything else is a port.

### Fixed

- `login` and token refresh no longer drop unrelated config. Previously the
  config file was rewritten with only the new credential, silently discarding
  a stored `site_url` (and, on refresh, the account email). Writes now merge.
- `verify --expect-hash` against a record that carries no data hash now fails
  closed (exit 4) instead of silently passing a check that compared nothing.
- `verify` and `obs` no longer send an ambient credential. Both read public
  records — the documented intent, which the implementation did not honor —
  so an expired or scope-limited stored session no longer breaks public reads.
- A 401 on a `--token`/`RELIASTRA_TOKEN` credential no longer triggers a
  refresh from the stored session. Falling back to a different credential
  than the one the invocation was given silently ran the command as the
  wrong identity; only config sessions refresh now.
- `verify --file` for an unreadable file exits 1 (`could not read --file …`)
  instead of 2 with a raw filesystem error that misattributed a local path
  problem to the API.
- The `deps list` hint suggested `reliastra open dependencies <id>`, which is
  not a target (`open` takes the singular `dependency`). It now suggests the
  command that runs.
- Missing values in composed strings render as `—` instead of leaking
  `null`/`undefined` (incident window, severity/status, dependency endpoint).
- A signed record without an algorithm prints `yes` instead of `yes
  (undefined)`.
- Ctrl+C during the password prompt exits 130 like everywhere else (was 1).

### Changed

- `--json` object keys print in alphabetical order. The shape is unchanged;
  the output is now stable and diffable run over run.
- A missing flag value (`--limit` with nothing after it), an empty
  `--flag=`, and a non-boolean `--json=yes` are usage errors instead of
  silently mistyped values.
- Numeric flags are validated before the request: `--limit`/`--observations`
  accept 0 or more, `--interval`/`--timeout` accept 1 or more, and `--expect`
  accepts comma-separated 100–599 codes.
- `login --token` honors `--json`, consistent with session login.
- `--help` answers specifically for `checks recent`, `keys list`, and `obs
  list` instead of falling back to the parent command's help.
- `--no-persist`, `-v`, and `RELIASTRA_EMAIL` are now documented in the help.

### Migration

- Replace `node ./cli/bin/reliastra.mjs …` with `go run ./cli/cmd/reliastra …` (checkout)
  or install the binary once and call `reliastra …`.
- Replace `npm test` in `cli/` with `go test ./...`.
- If you string-compared `--json` output, sort-tolerant comparison (or `jq`)
  is now required: key order is alphabetical, and nulls/numbers keep the
  API's shape exactly.
