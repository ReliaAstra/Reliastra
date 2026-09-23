# `reliastra` CLI

Command-line access to RELIASTRA: the endpoints being probed, what each probe
recorded, what the detector concluded, the evidence record that follows, and the
public verification of that record.

A single static binary with no runtime dependencies. Go 1.23 or newer is
needed only to build from source — the installers below ship the compiled
binary.

## Install

One CLI, written in Go, compiled once per platform and shipped through
three channels. Every channel hands you the same binary; none of them is a
port or a wrapper with logic of its own.

```
                     cli/cmd/reliastra (Go)
                              │
                     compiled per platform
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  go install            npm install -g          pip / pipx install
  (builds the source)   (downloads the binary)  (downloads the binary)
        └─────────────────────┼─────────────────────┘
                              ▼
                     the same `reliastra`
```

Supported platforms for the prebuilt binary — the ones the release
pipeline builds, runs, and checks on every tag:

| OS | amd64 (x86_64) | arm64 (aarch64 / Apple silicon) |
| --- | --- | --- |
| Linux | ✓ | ✓ |
| macOS | ✓ | ✓ |
| Windows | ✓ | ✓ |

Anything else (FreeBSD, 32-bit, etc.) is not shipped prebuilt: the npm and
pip packages say so and exit rather than guess, and `go install` builds it
for you where Go supports the target.

**npm** (Node ≥ 18, no Go toolchain):

```bash
npm install -g reliastra
```

**PyPI** (Python ≥ 3.9, no Go toolchain) — `pipx` keeps it isolated and on
`PATH`; plain `pip` works the same:

```bash
pipx install reliastra
# or: pip install reliastra
```

**Go** (Go ≥ 1.23) — compiles from source at the latest tagged release:

```bash
go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest   # installs `reliastra`
```

**Prebuilt binaries** — download `reliastra_<version>_<os>_<arch>.tar.gz`
(`.zip` on Windows) from
[Releases](https://github.com/ReliaAstra/Reliastra/releases), check its
line in that release's `checksums.txt` (`sha256sum -c --ignore-missing
checksums.txt`), and put `reliastra` on your `PATH`. Every asset also has a
provenance attestation: `gh attestation verify <file> -R ReliaAstra/Reliastra`.

Then, whichever you picked:

```bash
reliastra --version     # the release version, e.g. 0.2.0
reliastra --help
```

### How the npm and pip packages work

They are thin installers — a single dependency-free script each — not
reimplementations. Nothing is downloaded or executed at install time (no
`postinstall`, no build hooks). On the first `reliastra` invocation the
package:

1. picks the release asset for your OS and CPU
   (`reliastra_<version>_<os>_<arch>`, with `<version>` equal to the
   package's own version, so a package can only ever run its own release);
2. downloads it over HTTPS from that GitHub release, together with the
   release's `checksums.txt`, and refuses to run anything whose SHA-256
   does not match;
3. caches it (`~/.cache/reliastra` on Linux, `~/Library/Caches/reliastra`
   on macOS, `%LOCALAPPDATA%\reliastra\Cache` on Windows — one cache
   shared by npm and pip, one directory per version), marks it executable;
4. executes it with your arguments untouched and returns its exit code.

From then on, `reliastra` is the cached Go binary; the script only finds
and runs it. Details: [npm](npm/README.md) · [PyPI](python/README.md).

### Versioning

One release, one version, everywhere: the git tag `vX.Y.Z` is the GitHub
release, the npm version, the PyPI version, the Go module version, and
what `reliastra --version` prints. The release pipeline refuses to publish
if any of those would disagree (see [RELEASING.md](RELEASING.md)).

### Upgrading

```bash
npm update -g reliastra            # or: npm install -g reliastra@latest
pipx upgrade reliastra             # or: pip install --upgrade reliastra
go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest
```

An upgraded npm/pip package downloads its new binary on the next run;
older versions stay in the cache and can be deleted freely. To pin:
`npm install -g reliastra@0.2.0`, `pip install reliastra==0.2.0`,
`go install …/cmd/reliastra@v0.2.0`.

### Uninstalling

```bash
npm uninstall -g reliastra
pipx uninstall reliastra           # or: pip uninstall reliastra
rm "$(go env GOPATH)/bin/reliastra"   # Go: it is just the binary
```

Then, optionally, the binary cache and your session:

```bash
rm -rf ~/.cache/reliastra            # Linux   (macOS: ~/Library/Caches/reliastra)
reliastra logout                     # before uninstalling, to revoke the session
rm -rf ~/.config/reliastra           # config file, if you skipped logout
```

### Troubleshooting installation

- **`reliastra: command not found` after `npm install -g`** — npm's global
  bin directory is not on `PATH`. `npm prefix -g` prints the prefix; add
  `<prefix>/bin` (Windows: the prefix itself) to `PATH`.
- **… after `pip install`** — use `pipx`, or add the user scripts directory
  (`python -m site --user-base` + `/bin`, Windows: `\Scripts`) to `PATH`.
- **… after `go install`** — the binary is in `$(go env GOPATH)/bin`
  (Windows: `%USERPROFILE%\go\bin`), which Go does not add to `PATH`. On
  Windows, make it permanent with:

  ```powershell
  [Environment]::SetEnvironmentVariable(
    "Path",
    [Environment]::GetEnvironmentVariable("Path","User") + ";$env:USERPROFILE\go\bin",
    "User"
  )
  ```

  and open a new terminal. If `GOBIN` or `GOPATH` is set, check `go env`.
- **`could not fetch … checksums.txt`** on first run — no route to
  `github.com`. Check the network and proxy, then retry; in an air-gapped
  environment, fetch the release binary another way and point the wrapper
  at it with `RELIASTRA_BIN=/absolute/path/to/reliastra`, or mirror the
  release directory and set `RELIASTRA_RELEASE_URL=https://mirror/...`
  (HTTPS required).
- **`checksum mismatch`** — the download did not match the release's
  `checksums.txt` and was discarded. Retry once; if it persists, something
  between you and GitHub is altering downloads — do not work around it.
- **`no prebuilt reliastra binary for <os>/<arch>`** — not in the matrix
  above. Use `go install`.
- **Which binary is running?** `reliastra --version` is answered by the
  Go binary, never by the wrapper; on Linux/macOS the wrapper's cached
  copy is at `~/.cache/reliastra/v<version>/reliastra`.
- **Two `reliastra`s on `PATH`** (say, npm and pip both installed) — they
  run the same cached binary, so it does not matter which wins; uninstall
  one to keep things tidy.

Or build from a checkout:

```bash
git clone --depth 1 https://github.com/ReliaAstra/Reliastra.git
go build -o reliastra ./Reliastra/cli/cmd/reliastra
./reliastra --help
```

Without installing anything, run from the checkout (from the repository root):

```bash
go run ./cli/cmd/reliastra deps list
```

Every command supports `--help` (`reliastra evidence get --help`), and
`reliastra --version` prints the version.

## 1. Authenticate

```bash
reliastra login --email you@example.com
# session stored in ~/.config/reliastra/config.json (mode 0600)

reliastra whoami                    # which account, and which credential
```

Two kinds of credential work, and the CLI tells you which one it is using:

```bash
# An API key: scoped, revocable, and the right choice for CI or another service
reliastra keys create ci-deploy --scopes read:checks,read:incidents,read:evidence,read:dependencies
RELIASTRA_TOKEN=rel_… reliastra deps list --json

# Store a key on this machine instead of a session
reliastra login --token rel_…
```

Precedence is `--token` → `RELIASTRA_TOKEN` → the config file. `whoami` prints
which one was used, because "which credential is this running as" is the first
question in any support thread. A password is never taken as a flag: it comes
from a prompt, or from `RELIASTRA_PASSWORD` in automation, so it cannot land in
shell history or a process listing.

Something wrong? `reliastra doctor` checks the config file (including its mode),
the credential, and the API, and says which of the three is failing:

```
$ reliastra doctor
reliastra doctor

  ok    config file    /home/you/.config/reliastra/config.json (mode 600)
  ok    credential     from config
  ok    api url        https://api.reliastra.com
  ok    api reachable  https://api.reliastra.com/health answered
  ok    authenticated  as you@example.com
```

## 2. See what is being probed

```bash
reliastra deps add "Payments API" https://api.example.com/health --interval 60
reliastra deps list
reliastra deps show dep-1234abcd           # configuration, observations, incidents
reliastra checks recent --limit 20
```

```
ID               NAME           ENDPOINT                        EVERY  ACTIVE  LAST CHECK
dep-1234abcd     Payments API   https://api.example.com/health  1m     yes     2026-09-18 10:00:00Z
```

A failed observation is a fact about one probe. An incident is opened by the
detector after consecutive failures, and `incidents` reports the incident rather
than the individual probe.

## 3. Inspect an incident

```bash
reliastra incidents list --status open --web
reliastra incidents show 9f1c8b0e             # window, severity, correlations
reliastra incidents show 9f1c8b0e --evidence  # follow it to the evidence record
reliastra incidents correlate 9f1c8b0e        # score an overlapping degradation
```

Correlation scores come from five weighted signals under a published
methodology version. An overlap is an alignment between two timelines; the
output says so rather than implying cause.

## 4. Retrieve evidence and verify it

```bash
reliastra evidence list
reliastra evidence show 7c1d0a5f              # prints the public verification URL
reliastra evidence get 7c1d0a5f --out incident.pdf
reliastra verify 8Kd2xQ7mB4pL --file incident.pdf
```

`verify` is the reason this CLI exists. It reads the public verification record
for an artifact — no account required, the same endpoint a vendor or an
arbitrator would use — recomputes the SHA-256 of the bytes on disk, and exits
non-zero when they disagree.

```
$ reliastra verify 8Kd2xQ7mB4pL --file incident.pdf
verification record found
verification id   8Kd2xQ7mB4pL
incident          9f1c8b0e
window            2026-09-04 09:12:00Z → 2026-09-04 09:41:00Z
data hash         3f9a…
document checksum 0c72…
methodology       2.0
signed            no — this deployment issues unsigned artifacts and the document says so
retention         until 2027-09-04 09:12:00Z
```

Because the exit codes are meaningful, it works as a gate with no wrapper:

| code | meaning |
|---|---|
| 0 | success |
| 1 | usage error, or invalid configuration |
| 2 | the API returned an error (validation, not found, upstream) |
| 3 | authentication required, rejected, or expired |
| 4 | a verification claim did not hold |
| 5 | authenticated, but not permitted to make this call |
| 6 | the API could not be reached at all |

Exit 4 is returned for a missing record, a hash mismatch, an expected-hash
mismatch, and a verification service that could not be read — the last one
deliberately, because "we could not check" must not be reported as a pass.

`verify` needs no credential: the record it reads is public, which is the whole
point of a verification endpoint. So the pipeline step is one line after a
checkout, with no secret:

```yaml
# GitHub Actions (Go is preinstalled on github-hosted runners)
- uses: actions/checkout@v4
- uses: actions/setup-go@v5
  with: { go-version: '1.23' }
- run: go run ./cli/cmd/reliastra verify "$VERIFICATION_ID" --file incident.pdf
```

## 5. Move between the terminal and the web

Every object the CLI prints has a page where a person can read it, and the CLI
prints the URL rather than describing it:

```bash
reliastra open verify 8Kd2xQ7mB4pL              # public page, no account needed
reliastra open incident 9f1c8b0e --browser      # console page, in the browser
open "$(reliastra open evidence 7c1d0a5f)"      # printing is the default, so this composes
```

`--web` adds the console URL to the list commands (`deps list`, `incidents
list`, `evidence list`), and `evidence show` prints the verification URL
unconditionally. A self-hosted deployment sets its own origin with `--site-url`
or `RELIASTRA_SITE_URL`.

## Machine-readable output

Every command accepts `--json`, and the JSON is the API's own shape — no
renamed fields, no dropped nulls, no derived values:

```bash
reliastra checks recent --json | jq '[.[] | select(.is_up == false)] | length'
reliastra deps list --json | jq -r '.[] | "\(.name)\t\(.endpoint_url)"'
reliastra evidence list --json | jq -r '.[].checksum'
```

Object keys print in alphabetical order, so the output is stable and diffable;
the shape is unchanged. `--quiet` drops the explanatory lines and prints data
only; `--json` implies it. A field the API did not return is `null` in JSON
and `—` in the table. It is never rendered as `0` or `unknown`.

## Errors

Every failure is classified, and the exit code says which class it was: not
authenticated, not permitted, not found, invalid request, unreachable. There are
no stack traces and no "something went wrong". A 403 names the scope that was
missing; a network failure tells you to check `reliastra doctor`; a missing
resource says that ids are scoped to the account that owns them.

## Configuration

| Variable | Effect |
|---|---|
| `RELIASTRA_TOKEN` | Bearer token or API key for this invocation |
| `RELIASTRA_API_URL` | API base URL (default `https://api.reliastra.com`) |
| `RELIASTRA_SITE_URL` | Web origin used for links (default `https://reliastra.com`) |
| `RELIASTRA_CONFIG` | Path to the config file |
| `RELIASTRA_PASSWORD` | Password for a non-interactive `login` |

The config file is written with mode 0600 in a 0700 directory. `logout` revokes
the session server-side and deletes the file even if the API cannot be reached,
so a network outage cannot leave a token on disk.

## The public observatory

These commands read the same unauthenticated data the public site renders:

```bash
reliastra obs list
reliastra obs show openai --json
```

`recent_status` is derived from the five most recent observations and describes
one path. The CLI prints that provenance rather than implying vendor-wide
health.

## Tests

```bash
go test ./...
```

The suite runs the real commands against a local HTTP server, so argument
parsing, status-code mapping, help text, exit codes, destructive-command guards
and hashing are exercised the way a pipeline exercises them.
