# `reliastra` CLI

Command-line access to RELIASTRA: what is being probed, what each probe
recorded, what the detector concluded, and the evidence record that follows.

No dependencies. Node 18.17 or newer.

```bash
node bin/reliastra.mjs --help      # from a checkout
npm install -g .                   # or install it as `reliastra`
```

## Sign in

```bash
reliastra login --email you@example.com
# session stored in ~/.config/reliastra/config.json (mode 0600)
```

In CI, skip the prompt:

```bash
RELIASTRA_TOKEN=rs_live_… reliaastra deps list --json
```

Precedence is `--token` → `RELIASTRA_TOKEN` → the config file. `whoami` prints
which one was used, because "which credential is this running as" is the first
question in any support thread.

## Watch a dependency

```bash
reliastra deps add "Payments API" https://api.example.com/health --interval 60
reliastra deps list
```

```
ID        NAME            ENDPOINT                            EVERY  ACTIVE  LAST CHECK
dep-1234  Payments API    https://api.example.com/health       1m  yes     2026-09-18 10:00:00Z
```

```bash
reliastra checks recent --limit 20
```

```
EXECUTED (UTC)         RESULT   STATUS  LATENCY   DETAIL            DEP
2026-09-18 10:00:00Z   up           200  212 ms                      dep-1234
2026-09-18 09:59:00Z   failed          —        —  connect timeout   dep-1234
```

A failed observation is a fact about one probe. An incident is opened by the
detector — two consecutive failures from the single observation point — and
`incidents show` reports the incident, not the individual probe.

## Evidence and verification

```bash
reliastra incidents list
reliastra evidence list
reliastra evidence get 4b2e… --out incident-2026-09-04.pdf
reliastra verify 8Kd2… --file incident-2026-09-04.pdf
```

`verify` is the reason this CLI exists. It reads the public verification record
for an artifact (no account required — the same endpoint a vendor or an
arbitrator would use), recomputes the SHA-256 of the bytes on disk, and exits
non-zero when they disagree.

```
$ reliaastra verify 8Kd2… --file incident.pdf
verification record found
verification id   8Kd2…
incident          9f1c…
window            2026-09-04 09:12:00Z → 2026-09-04 09:41:00Z
data hash         3f9a…
document checksum 0c72…
methodology       v1.0
signed            no — this deployment issues unsigned artifacts and the document says so
```

Because the exit codes are meaningful, it works as a gate with no wrapper:

| code | meaning |
|---|---|
| 0 | success |
| 1 | usage error |
| 2 | the API returned an error |
| 3 | authentication required or expired |
| 4 | a verification claim did not hold |

```yaml
# GitHub Actions
- run: npx @reliastra/cli verify "$VERIFICATION_ID" --file evidence.pdf
  env:
    RELIASTRA_TOKEN: ${{ secrets.RELIASTRA_TOKEN }}
```

Exit 4 is returned for a missing record, a hash mismatch, an expected-hash
mismatch, and a verification service that could not be read — the last one
deliberately, because "we could not check" must not be reported as a pass.

## The public observatory

These commands read the same unauthenticated data the public site renders:

```bash
reliastra obs list
reliastra obs show openai --json
```

`recent_status` is derived from the five most recent observations and describes
one path, at one minute. The CLI prints that provenance rather than implying
vendor-wide health.

## Machine-readable output

Every command accepts `--json`, and the JSON is the API's own shape — no
renamed fields, no dropped nulls, no derived values:

```bash
reliastra checks recent --json | jq '[.[] | select(.is_up == false)] | length'
reliastra deps list --json | jq -r '.[] | "\(.name)\t\(.endpoint_url)"'
```

A field the API did not return is `null` in JSON and `—` in the table. It is
never rendered as `0` or `unknown`.

## Tests

```bash
npm test
```

The suite runs the real commands against a local HTTP server, so argument
parsing, status-code mapping, hashing and exit codes are exercised the way a
pipeline exercises them.
