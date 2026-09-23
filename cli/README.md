# `reliastra` CLI

Command-line access to RELIASTRA: the endpoints being probed, what each probe
recorded, what the detector concluded, the evidence record that follows, and the
public verification of that record.

A single static binary with no runtime dependencies. Go 1.23 or newer is
needed only to build from source — the installers below ship the compiled
binary.

## Install

RELIASTRA has **one CLI implementation**: the Go program in this directory.
npm and PyPI distribute *that binary* — neither reimplements a command, and
neither needs a Go toolchain. Pick one channel; all four give you the same
executable.

**npm** — any supported platform:

```bash
npm install -g reliastra
```

**pipx / pip** — any supported platform:

```bash
pipx install reliastra
# or: pip install reliastra
```

**Go** — compiles from source:

```bash
go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest   # installs `reliastra`
```

**Prebuilt binaries** — download the archive for your platform from
[Releases](https://github.com/ReliaAstra/Reliastra/releases), confirm its
line in that release's `checksums.txt`, and put `reliastra` on your `PATH`.

The npm and pip packages are thin installers, not ports. Nothing is
downloaded or executed at install time; on the first `reliastra` invocation
they download the platform binary attached to the GitHub release matching
their own version, verify its SHA-256 against that release's
`checksums.txt`, cache it (one cache shared by npm and pip), and hand off
with your arguments and exit codes untouched. `RELIASTRA_BIN` points either
wrapper at a binary you already have. Details:
[npm](npm/README.md) · [PyPI](python/README.md).

> **Release status — read before sharing these commands.** Every
> download-based channel above is published by the release pipeline
> (`.github/workflows/release-cli.yml`) when a version tag is pushed. Until
> the first tag is pushed there is no GitHub release, no npm package and no
> PyPI package, so `npm install -g reliastra`, `pip install reliastra` and
> `go install …@latest` have nothing to fetch. Build from a checkout
> instead:
>
> ```bash
> git clone --depth 1 https://github.com/ReliaAstra/Reliastra.git
> cd Reliastra && go build -o reliastra ./cli/cmd/reliastra
> ```
>
> The registry configuration the pipeline needs to publish is listed in
> [RELEASING.md](RELEASING.md#1-one-time-setup-per-registry); cutting the
> first release is [step 2](RELEASING.md#2-cut-a-release).

### Supported platforms

| OS | amd64 (x86-64) | arm64 (Apple Silicon, ARM servers) |
| --- | --- | --- |
| Linux | ✅ | ✅ |
| macOS | ✅ | ✅ |
| Windows | ✅ | ✅ |

Those six are what every release builds and tests. Anything else — 32-bit,
`armv7`, BSD, `riscv64` — has no prebuilt binary: the installers say so and
exit rather than guessing, and the Go route works wherever Go compiles
(`go install …@latest` needs no release asset).

### Upgrading

Each channel upgrades in place; the binary cache is keyed by version, so
every version downloads once and an older version's install keeps working
until you remove it.

```bash
npm update -g reliastra         # npm
pipx upgrade reliastra          # pipx; `pip install --upgrade reliastra` for pip
go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest   # Go
reliastra --version             # what you ended up with
```

### Uninstalling

```bash
npm uninstall -g reliastra      # npm
pipx uninstall reliastra        # pipx; `pip uninstall reliastra` for pip
rm -f "$(go env GOPATH)/bin/reliastra"   # Go
```

Then, to reclaim the downloaded binaries: `rm -rf ~/.cache/reliastra`
(Linux), `~/Library/Caches/reliastra` (macOS), or
`%LOCALAPPDATA%\reliastra` (Windows).

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `reliastra: command not found` after installing | The installer's bin directory is not on `PATH`. npm: `npm root -g` / `npm bin -g`; pipx: `pipx ensurepath`; Go: `$(go env GOPATH)/bin` (see the Windows note below). |
| `checksum mismatch for …` and nothing runs | The download did not match the release's `checksums.txt`. The binary was **not** executed. Retry; if it persists, do not use this machine's copy and report the release. |
| `no prebuilt reliastra binary for …` | Unsupported OS/architecture. Use `go install …@latest`, or build from a checkout. |
| `could not fetch …: HTTP 404` | The release for the installed package version does not exist yet (or was withdrawn). Upgrade the package, or point `RELIASTRA_RELEASE_URL` at a mirror you trust. |
| Everything is behind a proxy or offline | `RELIASTRA_RELEASE_URL` sets the release base (https only, or http on localhost); `RELIASTRA_BIN` runs an existing binary and skips the download entirely. |
| Two versions report different `--version` values | Expected: each install is pinned to its own version. Upgrade all of them. |

This next part applies to the Go method only — npm and pipx/pip put
`reliastra` on `PATH` themselves. On Windows, `go install` puts the binary
in `%USERPROFILE%\go\bin` but does not add that directory to `PATH`, so
PowerShell will not find `reliastra` on its own. Run it once via its full
path (`& "$env:USERPROFILE\go\bin\reliastra.exe" --help`), and make it
permanent by appending the directory to your user `PATH`:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path","User") + ";$env:USERPROFILE\go\bin",
  "User"
)
```

Then open a new terminal. If `GOBIN` or `GOPATH` is set, the binary goes to
`%GOBIN%` or `%GOPATH%\bin` instead — check those with `go env`.

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
