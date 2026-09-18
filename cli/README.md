# `reliastra` CLI

Command-line access to RELIASTRA: the endpoints being probed, what each probe
recorded, what the detector concluded, the evidence record that follows, and the
public verification of that record.

No runtime dependencies. Node 18.17 or newer.

```bash
git clone --depth 1 https://github.com/ReliaAstra/Reliastra.git
npm install -g ./Reliastra/cli      # installs `reliastra`
reliastra --help
```

The package is `cli/` in that repository. It is **not published to the public
npm registry**, so `npm install -g @reliastra/cli` and `npx @reliastra/cli` have
nothing to resolve. Without installing anything, run the file directly from a
checkout:

```bash
node ./Reliastra/cli/bin/reliastra.mjs deps list
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
retention         until 2027-09-04T09:12:00Z
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
checkout, with no secret and no install:

```yaml
# GitHub Actions
- uses: actions/checkout@v4
- run: node ./Reliastra/cli/bin/reliastra.mjs verify "$VERIFICATION_ID" --file incident.pdf
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

`--quiet` drops the explanatory lines and prints data only; `--json` implies it.
A field the API did not return is `null` in JSON and `—` in the table. It is
never rendered as `0` or `unknown`.

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
npm test
```

The suite runs the real commands against a local HTTP server, so argument
parsing, status-code mapping, help text, exit codes, destructive-command guards
and hashing are exercised the way a pipeline exercises them.
