/**
 * The documentation corpus.
 *
 * Every command, endpoint, field name and default below was read out of the
 * code it documents - the backend module schemas, the settings object and
 * the CLI command modules - rather than written from
 * memory. The docs test asserts the two things that rot first: that every guide
 * here has a route, and that the defaults quoted in prose match the ones in
 * `lib/product-contract.ts`.
 *
 * Writing rules for anything added here:
 *   - A guide starts with the thing the reader is trying to do, not with
 *     orientation copy.
 *   - Numbers come from the contract, never from an author's recollection.
 *   - Limits and failure modes are stated next to the feature they limit.
 */

import { DETECTION, OBSERVATION_POINTS, PROBE_INTERVAL_SECONDS } from '@/lib/methodology';
import type { Doc } from './types';

export const DOCS: Doc[] = [
  /* ── Quickstart ───────────────────────────────────────────────────────── */
  {
    slug: 'quickstart',
    title: 'Quickstart',
    summary: 'Install the CLI, add an endpoint, read the first observation, and follow an incident through to its evidence record.',
    group: 'Start',
    sections: [
      {
        id: 'install',
        heading: 'Install the CLI',
        blocks: [
          {
            kind: 'p',
            text: 'Everything below is one path, and the fastest way through it is the CLI: a single binary, no dependencies, Node 18.17 or newer.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `git clone --depth 1 https://github.com/ReliaAstra/Reliastra.git
npm install -g ./Reliastra/cli
reliastra --version`,
          },
          {
            kind: 'p',
            text: 'The CLI lives in that repository at `cli/` and installs from the checkout. It is not on the public npm registry, so an install by name does not resolve — `npm install -g ./Reliastra/cli` is the working form. Node 18.17 or newer, no dependencies.',
          },
        ],
      },
      {
        id: 'what-you-need',
        heading: 'What you need',
        blocks: [
          {
            kind: 'list',
            items: [
              'An HTTPS endpoint you are authorized to monitor. Any URL that returns a status code works; it does not have to be health-check-shaped.',
              'An account. The trial starts on signup, no card.',
            ],
          },
          {
            kind: 'note',
            tone: 'info',
            title: 'Authorization',
            text: 'Only monitor endpoints you own or are permitted to probe. A dependency that requires a credential can carry it in a header — the value is encrypted at rest and never returned by any API response.',
          },
        ],
      },
      {
        id: 'add-a-dependency',
        heading: 'Add a dependency',
        blocks: [
          { kind: 'p', text: 'From the console: **Dependencies → Add**, paste the URL, choose an interval. Or from the CLI:' },
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra login --email you@example.com
reliastra deps add "Payments API" https://api.example.com/health --interval 60`,
          },
          { kind: 'p', text: 'Or directly against the API:' },
          {
            kind: 'code',
            lang: 'bash',
            caption: 'POST /v1/dependencies',
            code: `curl -sS https://api.reliastra.com/v1/dependencies \\
  -H "Authorization: Bearer $RELIASTRA_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Payments API",
    "endpoint_url": "https://api.example.com/health",
    "check_interval_seconds": 60,
    "expected_status_codes": [200]
  }'`,
          },
          {
            kind: 'code',
            lang: 'json',
            caption: '201 Created',
            code: `{
  "id": "9f1c8b0e-6a2f-4f1e-9f3a-1c2d3e4f5a6b",
  "name": "Payments API",
  "endpoint_url": "https://api.example.com/health",
  "method": "GET",
  "expected_status_codes": [200],
  "timeout_seconds": 10,
  "check_interval_seconds": 60,
  "regions": ["us-east"],
  "is_active": true,
  "next_check_at": "2026-09-18T10:01:00Z"
}`,
          },
        ],
      },
      {
        id: 'first-observation',
        heading: 'The first observation',
        blocks: [
          {
            kind: 'p',
            text: 'The scheduler picks the dependency up on the next tick and writes one row per probe. There is nothing to enable and no agent to install — the probe is issued by RELIASTRA, not by you.',
          },
          {
            kind: 'code',
            lang: 'bash',
            caption: 'GET /v1/checks/recent',
            code: `reliastra checks recent --limit 5

EXECUTED (UTC)         RESULT   STATUS  LATENCY   DETAIL  DEP
2026-09-18 10:01:03Z   up           200  184 ms            dep-9f1c`,
          },
          {
            kind: 'note',
            tone: 'note',
            title: 'One failed row is not an incident',
            text: `A single failed probe is recorded and nothing more. An incident opens after ${DETECTION.failureChecks} consecutive failures from the ${OBSERVATION_POINTS === 1 ? 'single observation point' : 'observation points'} and resolves after ${DETECTION.recoveryChecks} consecutive successes.`,
          },
        ],
      },
      {
        id: 'an-incident',
        heading: 'Follow an incident',
        blocks: [
          {
            kind: 'p',
            text: `When the detector opens an incident, the incident — not the individual probe — is the thing to read. Its window, severity and root-cause field are one record:`,
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra incidents list --status open
reliastra incidents show <incident-id>
reliastra incidents show <incident-id> --evidence`,
          },
          {
            kind: 'p',
            text: '`--evidence` follows the record to the evidence artifact issued for it, so the window, the detector’s rule, the observation list and the integrity hashes are one command away rather than three.',
          },
          {
            kind: 'note',
            tone: 'note',
            title: 'Correlation is not causation',
            text: '`reliastra incidents correlate <id>` scores an overlapping dependency degradation against this window using five weighted signals under a published methodology version. An alignment between two timelines is what it reports, and that is all it reports.',
          },
        ],
      },
      {
        id: 'retrieve-evidence',
        heading: 'Retrieve evidence and verify it',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra evidence list
reliastra evidence show <report-id>              # prints the public verification URL
reliastra evidence get <report-id> --out incident.pdf
reliastra verify <verification-id> --file incident.pdf`,
          },
          {
            kind: 'p',
            text: '`verify` needs no account: it reads the public verification record, recomputes the SHA-256 of the bytes on disk and compares it with the checksum recorded at issue time. It exits 4 when they disagree, which is what makes it usable directly as a gate:',
          },
          {
            kind: 'code',
            lang: 'yaml',
            caption: 'GitHub Actions',
            code: `- uses: actions/checkout@v4
- run: node ./Reliastra/cli/bin/reliastra.mjs verify "$VERIFICATION_ID" --file incident.pdf`,
          },
        ],
      },
      {
        id: 'terminal-and-web',
        heading: 'Between the terminal and the web',
        blocks: [
          {
            kind: 'p',
            text: 'The CLI and the console are two views of one record, and the CLI prints the address of the other view rather than describing what it would show.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra open incident <incident-id> --browser
reliastra open verify <verification-id>          # prints the URL; no account needed
open "$(reliastra open evidence <report-id>)"    # printing is the default, so this composes`,
          },
          {
            kind: 'list',
            items: [
              'Every identifier is the same in both places: an incident id from `incidents list` opens the same incident in the console.',
              '`--json` prints the API’s own shape, so a script sees exactly what the API returned.',
              '`--web` adds the console URL to the list commands; `evidence show` prints the verification URL unconditionally.',
              'A self-hosted deployment points the links at its own origin with `--site-url` or `RELIASTRA_SITE_URL`.',
            ],
          },
        ],
      },
      {
        id: 'next',
        heading: 'Where to go next',
        blocks: [
          {
            kind: 'definitions',
            items: [
              { term: 'CLI', def: 'Every command, the exit codes, and how to use it in a pipeline.' },
              { term: 'REST API', def: 'The endpoints behind the CLI, scopes for API keys, pagination and error semantics.' },
              { term: 'Configuration', def: 'Intervals, expected status codes, secret headers, disabling without deleting.' },
              { term: 'Incidents', def: 'How the detector decides, what severity means, and how an incident closes.' },
              { term: 'Evidence', def: 'Turning a resolved incident into a record you can hand to someone.' },
              { term: 'Verification', def: 'What the public record proves, and what it deliberately does not.' },
            ],
          },
        ],
      },
    ],
  },

  /* ── Concepts ─────────────────────────────────────────────────────────── */
  {
    slug: 'concepts',
    title: 'Concepts',
    summary: 'Four ideas the rest of these docs assume: observation, confirmation, attribution, evidence.',
    group: 'Start',
    sections: [
      {
        id: 'observation',
        heading: 'Observation',
        blocks: [
          {
            kind: 'p',
            text: 'An observation is one probe: RELIASTRA issued an HTTP request to your dependency and recorded what came back. It is a fact, not an interpretation, and every downstream conclusion is derived from a set of them.',
          },
          { kind: 'p', text: `Probes are issued from **${OBSERVATION_POINTS === 1 ? 'one' : OBSERVATION_POINTS} observation point** today, every ${PROBE_INTERVAL_SECONDS} seconds by default. What that means for a claim is stated on every surface that reports one.` },
          {
            kind: 'fields',
            items: [
              { field: 'executed_at', type: 'timestamp', def: 'When the probe completed, in UTC.' },
              { field: 'status_code', type: 'integer | null', def: 'The HTTP status returned. Null when the request never produced a response.' },
              { field: 'latency_ms', type: 'number', def: 'Time to first byte. Not a transaction time — the probe reads headers and stops.' },
              { field: 'is_up', type: 'boolean', def: 'The verdict the detector reads: status code in the expected set, no transport error.' },
              { field: 'error_message', type: 'string | null', def: 'Transport error text, when the failure was at the connection level.' },
            ],
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'An observation is about a path, not a vendor',
            text: 'A probe measures the route from RELIASTRA to that endpoint. It cannot see the vendor’s internal state, other customers, or other regions. Conclusions that need those are not available from this data and are never drawn from it.',
          },
        ],
      },
      {
        id: 'confirmation',
        heading: 'Confirmation',
        blocks: [
          {
            kind: 'p',
            text: 'One failure is a data point; a run of them is a fault. The detector is a pure function of the stored observations — no clock reads, no randomness, no heuristics — so a decision can be replayed from the rows and reproduced exactly.',
          },
          {
            kind: 'definitions',
            items: [
              { term: 'Opens an incident', def: `${DETECTION.failureChecks} consecutive failed checks. Rule id \`${DETECTION.ruleId}\`.` },
              { term: 'Resolves an incident', def: `${DETECTION.recoveryChecks} consecutive successful checks. Rule id \`${DETECTION.recoveryRuleId}\`.` },
              { term: 'Backed out', def: 'A failure run that does not reach the threshold closes nothing and opens nothing. It stays in the record as observations.' },
            ],
          },
          {
            kind: 'p',
            text: 'The rule identifier and the reason string are stored with the incident and printed in the evidence artifact, so a reader can tell which rule fired without reading source code.',
          },
        ],
      },
      {
        id: 'attribution',
        heading: 'Attribution',
        blocks: [
          {
            kind: 'p',
            text: 'Attribution asks whether an incident overlaps degradation on a dependency you have configured. Five normalised signals are combined with fixed weights and the result is classified against two thresholds. It is arithmetic, not a model, and the methodology version is stamped on every result.',
          },
          {
            kind: 'table',
            columns: ['Classification', 'When it is returned'],
            rows: [
              ['vendor_failure', 'Confidence ≥ 75'],
              ['multi_cause', 'Confidence ≥ 50 and < 75'],
              ['infrastructure_issue', 'Below 50 and RELIASTRA’s own probes were degraded'],
              ['unknown', 'Anything else. This is a result, not an error.'],
            ],
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'Correlation, not causation',
            text: 'No classification means "the vendor caused your outage". A high score means two timelines lined up closely with the signals the engine measures. Treat it as evidence to weigh, and read the weights in the Methodology guide before quoting a score.',
          },
        ],
      },
      {
        id: 'evidence',
        heading: 'Evidence',
        blocks: [
          {
            kind: 'p',
            text: 'An evidence record is the compiled artifact for one incident: the window, the observations inside it, the arithmetic behind the SLA figures, the attribution result, and a checksum over the payload. It is generated once and retained, not recomputed on read.',
          },
          {
            kind: 'p',
            text: 'The record is verifiable by someone who does not have an account — that is the point of it. A public endpoint returns the hashes, the signature and the procedure to check them.',
          },
        ],
      },
    ],
  },

  /* ── Configuration ────────────────────────────────────────────────────── */
  {
    slug: 'configuration',
    title: 'Configuration',
    summary: 'Every field on a dependency, its default, and the two that can lock you out of your own endpoint.',
    group: 'Operate',
    sections: [
      {
        id: 'fields',
        heading: 'Dependency fields',
        blocks: [
          {
            kind: 'fields',
            items: [
              { field: 'name', type: 'string, ≤150', def: 'Appears in incidents, evidence records and notifications. Name it the way your team refers to it.' },
              { field: 'endpoint_url', type: 'string', def: 'Must start with http:// or https://. Any path is valid.' },
              { field: 'method', type: 'GET | POST | PUT | PATCH | DELETE | HEAD', def: 'Default GET.' },
              { field: 'headers', type: 'object | null', def: 'Sent with every probe. Authorization values are encrypted at rest and never returned by an API response — responses carry `has_headers` instead.' },
              { field: 'expected_status_codes', type: 'array<integer>', def: 'Default [200]. Any status outside this set counts as a failure. A 401 you did not expect is a failure, which is usually what you want.' },
              { field: 'timeout_seconds', type: '1–300', def: 'Default 10. The probe gives up and records the timeout as a failure.' },
              { field: 'check_interval_seconds', type: '1–86400', def: `Default ${PROBE_INTERVAL_SECONDS}. Shorter intervals detect faster and produce more rows; retention is by age, not by row count.` },
              { field: 'regions', type: 'array<string>, min 1', def: 'The scheduler label for the worker that runs the probe. One point is deployed today; this is not a geographic spread and the API does not offer a choice that changes the answer.' },
              { field: 'alert_threshold_ms', type: 'integer | null', def: 'Latency above this value is flagged on the dependency record. Null disables it. It does not open an incident on its own.' },
              { field: 'is_active', type: 'boolean', def: 'Default true. Setting false stops probing and preserves history — use this instead of deleting when you are unsure.' },
            ],
          },
        ],
      },
      {
        id: 'secret-headers',
        heading: 'Secret headers',
        blocks: [
          {
            kind: 'code',
            lang: 'json',
            caption: 'A dependency that authenticates its health endpoint',
            code: `{
  "name": "Internal gateway",
  "endpoint_url": "https://gw.internal.example.com/healthz",
  "headers": { "Authorization": "Bearer <token>", "X-Probe-From": "reliastra" },
  "expected_status_codes": [200],
  "timeout_seconds": 5
}`,
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'Values are write-only',
            text: 'A read of a dependency returns `has_headers: true`, never the values. There is no endpoint that returns them, including for administrators. Rotate by sending a new `headers` object; there is no way to read the old one back.',
          },
        ],
      },
      {
        id: 'cadence',
        heading: 'Choosing an interval',
        blocks: [
          {
            kind: 'p',
            text: `The interval is the resolution of every claim made from this data. At ${PROBE_INTERVAL_SECONDS} seconds, an outage shorter than that can exist entirely between two probes and leave no trace. Shrinking the interval narrows that blind spot; it does not close it.`,
          },
          {
            kind: 'table',
            columns: ['Interval', 'Blind spot', 'Use it for'],
            rows: [
              ['30s', 'Outages under ~30s', 'A dependency your product calls on every request'],
              ['60s', 'Outages under ~1m', 'Checkout, auth, anything with a hard SLA'],
              ['300s (default)', 'Outages under ~5m', 'Background syncs, dashboards, internal tools'],
              ['3600s', 'Outages under ~1h', 'Vendors you report on monthly, not daily'],
            ],
          },
          {
            kind: 'p',
            text: `Detection latency is the interval multiplied by the failure threshold: at ${PROBE_INTERVAL_SECONDS} seconds and a threshold of ${DETECTION.failureChecks}, an incident opens roughly ${Math.round((PROBE_INTERVAL_SECONDS * DETECTION.failureChecks) / 60)} minutes after the dependency actually broke.`,
          },
        ],
      },
      {
        id: 'updating',
        heading: 'Updating and removing',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `# Pause probing without losing history
reliastra deps list --json | jq -r '.[] | select(.name=="Payments API") | .id' \\
  | xargs -I{} curl -sS -X PATCH "https://api.reliastra.com/v1/dependencies/{}" \\
      -H "Authorization: Bearer $RELIASTRA_TOKEN" \\
      -H 'Content-Type: application/json' -d '{"is_active": false}'`,
          },
          {
            kind: 'note',
            tone: 'note',
            title: 'Deleting is permanent',
            text: 'Deleting a dependency removes its observations. Incidents and already-issued evidence records survive, because a record you have handed to a vendor cannot be recalled — but you lose the ability to show what it was measuring.',
          },
        ],
      },
    ],
  },

  /* ── Monitoring ───────────────────────────────────────────────────────── */
  {
    slug: 'monitoring',
    title: 'Monitoring',
    summary: 'What a probe does, what it records, and the four things it structurally cannot see.',
    group: 'Operate',
    sections: [
      {
        id: 'what-a-probe-does',
        heading: 'What a probe does',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              'Resolves the endpoint and opens a connection.',
              'Sends the configured method, headers and no body.',
              'Reads the response status and headers, then closes.',
              'Writes one row: timestamp, status, latency, verdict, error.',
            ],
          },
          {
            kind: 'p',
            text: 'The probe reads headers and stops. It does not download the body, so a large JSON payload does not inflate the latency it reports or the bill it costs.',
          },
        ],
      },
      {
        id: 'states',
        heading: 'Observation states',
        blocks: [
          {
            kind: 'definitions',
            items: [
              { term: 'up', def: 'The status code was in `expected_status_codes` and no transport error occurred.' },
              { term: 'failed', def: 'Either the status was outside the expected set, or the request produced no response (DNS, TLS, connection, timeout).' },
              { term: 'blocked', def: 'A failure inside the observation path itself — the probe could not be trusted. Blocked observations are excluded from availability arithmetic and counted separately.' },
            ],
          },
          {
            kind: 'note',
            tone: 'info',
            title: 'A failed probe is not a failed vendor',
            text: 'An observation records what happened on this path, at this minute. It is the detector’s job — not the probe’s — to decide whether that amounts to an incident.',
          },
        ],
      },
      {
        id: 'limits',
        heading: 'What monitoring cannot see',
        blocks: [
          {
            kind: 'fields',
            items: [
              { field: 'Vendor-internal state', def: 'The probe is outside the vendor’s network. It sees what the vendor’s edge returned.' },
              { field: 'Other customers', def: 'A 200 from this path does not mean every caller got a 200. It means this one did.' },
              { field: 'Erratic paths', def: 'A dependency that fails for one in twenty requests may never produce the consecutive failures the rule needs. Reported latency distribution is the signal to read in that case.' },
              { field: 'Anything behind your auth', def: 'If the endpoint requires a session you cannot supply, the probe cannot reach what your application reaches.' },
            ],
          },
        ],
      },
      {
        id: 'reading-latency',
        heading: 'Reading latency',
        blocks: [
          {
            kind: 'p',
            text: 'Latency is the wall-clock time from issuing the request to receiving the complete response, redirect hops included, measured from one observation point. It therefore contains DNS, TLS and the network path between RELIASTRA and the endpoint — none of which your users experience identically. Use it to detect change over time on the same dependency, not to rank one dependency against another.',
          },
          {
            kind: 'code',
            lang: 'bash',
            caption: 'Distribution rather than a single number',
            code: `reliastra checks recent --limit 200 --json \\
  | jq '[.[] | select(.is_up)] | (map(.latency_ms) | sort) as $l
        | { count: ($l|length), p50: $l[($l|length*0.5|floor)], p95: $l[($l|length*0.95|floor)] }'`,
          },
        ],
      },
    ],
  },

  /* ── Incidents ────────────────────────────────────────────────────────── */
  {
    slug: 'incidents',
    title: 'Incidents',
    summary: 'The detection rule, the fields on an incident, and what resolution does and does not mean.',
    group: 'Operate',
    sections: [
      {
        id: 'rule',
        heading: 'The rule',
        blocks: [
          {
            kind: 'code',
            lang: 'text',
            caption: 'The decision, in full',
            code: `if current.is_up is false:
    failures = trailing run of failures ending at current
    if failures >= ${DETECTION.failureChecks} and no incident open:
        open incident, started_at = first failure of the run
else:
    successes = trailing run of successes ending at current
    if successes >= ${DETECTION.recoveryChecks} and incident open:
        resolve incident`,
          },
          {
            kind: 'p',
            text: 'The incident’s `started_at` is the **first** failure of the run, not the check that crossed the threshold. An incident window therefore covers the outage the dependency actually had, rather than starting a check or two late.',
          },
          {
            kind: 'code',
            lang: 'json',
            caption: 'Detection metadata, stored with the decision',
            code: `{
  "rule": "${DETECTION.ruleId}",
  "reason": "${DETECTION.failureChecks} consecutive failed check(s); ${DETECTION.failureChecks} required",
  "confirmed": true,
  "consecutive_failures": ${DETECTION.failureChecks},
  "required": ${DETECTION.failureChecks},
  "run_started_at": "2026-09-18T09:55:00Z"
}`,
          },
        ],
      },
      {
        id: 'fields',
        heading: 'Incident fields',
        blocks: [
          {
            kind: 'fields',
            items: [
              { field: 'started_at / resolved_at', type: 'timestamp', def: 'The outage window. `resolved_at` is null while the incident is open.' },
              { field: 'severity', type: 'critical | major | minor', def: 'Set when the incident opens and editable afterwards.' },
              { field: 'status', type: 'open | resolved | false_positive', def: '`false_positive` is a first-class value: if a run of failures was your own maintenance, saying so keeps the data honest instead of deleting the row.' },
              { field: 'root_cause', type: 'vendor_failure | network_issue | config_error | unknown', def: 'Your classification. It is separate from the attribution score and can disagree with it.' },
              { field: 'evidence_status', type: 'pending | ready | failed | skipped', def: 'Where artifact generation is up to, so no surface has to render a bare "none".' },
            ],
          },
        ],
      },
      {
        id: 'correlation',
        heading: 'Correlating dependencies',
        blocks: [
          {
            kind: 'p',
            text: 'When several of your dependencies degrade at once, the interesting question is whether they share one cause. Correlation records that a second dependency was failing inside a window around the incident, with the method and confidence stored on the link.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra incidents correlate 9f1c8b0e-…
# or, on the API:
curl -sS -X POST "https://api.reliastra.com/v1/incidents/9f1c8b0e-…/correlate" \\
  -H "Authorization: Bearer $RELIASTRA_TOKEN" -H 'Content-Type: application/json' \\
  -d '{"correlated_dependency_id":"d4e5…","time_window_seconds":300,"correlation_method":"manual"}'`,
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'A correlation is a recorded observation about two timelines. Two dependencies failing together is not evidence that one caused the other, and RELIASTRA does not present it that way.',
          },
        ],
      },
      {
        id: 'resolution',
        heading: 'What resolution means',
        blocks: [
          {
            kind: 'p',
            text: `Resolution means ${DETECTION.recoveryChecks} consecutive successful probes. It does not mean the vendor confirmed anything, that the underlying cause was fixed, or that the service is healthy — it means this path responded successfully twice in a row.`,
          },
        ],
      },
    ],
  },

  /* ── Evidence ─────────────────────────────────────────────────────────── */
  {
    slug: 'evidence',
    title: 'Evidence',
    summary: 'What the artifact contains, how it is generated, and how long it is retained.',
    group: 'Operate',
    sections: [
      {
        id: 'generation',
        heading: 'Generation',
        blocks: [
          {
            kind: 'p',
            text: 'An evidence record is generated for a resolved incident. Generation is asynchronous: `evidence_status` moves from `pending` to `ready`, or to `failed` with a reason in `evidence_error`. A record is written once and never silently regenerated — if you need it rebuilt, `POST /v1/evidence/{report_id}/regenerate` creates a new one and records that it was rebuilt.',
          },
        ],
      },
      {
        id: 'contents',
        heading: 'What is in the record',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Incident record** — the window, the dependency, severity, status, and the observation topology the measurements came from.',
              '**Detection record** — the rule identifier, its reason string, and the run that satisfied it.',
              '**Incident window measurements** — checks in window, successes, failures, blocked probes excluded, availability, longest failure run, latency, first and last observation.',
              '**SLA impact calculation** — target uptime, measured availability, degradation impact, measured downtime, and the arithmetic basis for each.',
              '**Observed latency and failures** — the chart, drawn from the rows in the appendix.',
              '**Rolling 24-hour health** — context, labelled as context, never as the incident window.',
              '**Correlated dependency events** — the other dependencies that failed nearby, by name.',
              '**Deterministic attribution** — classification, confidence score, methodology version.',
              '**Documented observations** — every observation in the window, individually, with timestamp, result, latency and status.',
              '**Authenticity, retention and verification** — the payload hash, the document checksum, the verification URL, the signing status.',
            ],
          },
        ],
      },
      {
        id: 'integrity',
        heading: 'Integrity',
        blocks: [
          {
            kind: 'definitions',
            items: [
              { term: 'Evidence data hash', def: 'SHA-256 over the canonical payload — the incident’s facts as data, not as a rendered PDF.' },
              { term: 'Document checksum', def: 'SHA-256 over the rendered bytes. A PDF cannot contain the hash of itself, so the checksum lives on the record, not inside the document.' },
              { term: 'Signature', def: 'Ed25519 over the canonical payload bytes, when the deployment has a signing key configured. The public key is at `/v1/verify/keys`.' },
            ],
          },
          {
            kind: 'note',
            tone: 'info',
            title: 'Unsigned is stated, not hidden',
            text: 'A deployment with no signing key issues unsigned artifacts and the document says so on its face. That is deliberate: a missing signature that looks like a present one is worse than no signature at all.',
          },
        ],
      },
      {
        id: 'retention',
        heading: 'Retention and sharing',
        blocks: [
          {
            kind: 'p',
            text: 'Records are retained for 365 days from issue. Sharing is by token: a recipient opens the artifact and its verification page without an account. The token is unguessable and carries capability, so treat a shared link as you would the document.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra evidence list
reliastra evidence get 4b2e… --out incident-2026-09-18.pdf`,
          },
        ],
      },
    ],
  },

  /* ── Verification ─────────────────────────────────────────────────────── */
  {
    slug: 'verification',
    title: 'Verification',
    summary: 'How a third party checks an artifact without trusting RELIASTRA, and without an account.',
    group: 'Operate',
    sections: [
      {
        id: 'endpoint',
        heading: 'The verification endpoint',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            caption: 'No authentication. Cache-Control: no-store.',
            code: `curl -sS https://api.reliastra.com/v1/verify/8Kd2xQ…`,
          },
          {
            kind: 'code',
            lang: 'json',
            caption: '200 OK',
            code: `{
  "found": true,
  "incident_id": "9f1c8b0e-…",
  "dependency_id": "d4e5f6a7-…",
  "time_window": { "start": "2026-09-18T09:55:00+00:00", "end": "2026-09-18T10:06:00+00:00" },
  "data_hash": "3f9a…",
  "report_checksum": "0c72…",
  "methodology_version": "v1.0",
  "created_at": "2026-09-18T10:07:12+00:00",
  "authenticity": {
    "signed": true,
    "algorithm": "Ed25519",
    "signature_covers": "canonical payload bytes (the value hashed into data_hash)",
    "public_keys": "/v1/verify/keys"
  }
}`,
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'What the record does not contain',
            text: 'The payload itself. The endpoint proves what a payload must hash to; it does not restate the incident. That is why a verifier who has only the token learns nothing about the customer.',
          },
        ],
      },
      {
        id: 'procedure',
        heading: 'Verifying a document you were handed',
        blocks: [
          {
            kind: 'steps',
            items: [
              {
                title: 'Read the verification URL or QR from the document',
                text: 'Both point at `/reports/{verification-id}`.',
              },
              {
                title: 'Fetch the record and compare the checksum',
                text: 'The record returns the SHA-256 of the rendered bytes. Compute the same hash over the file you hold.',
                code: { lang: 'bash', code: 'sha256sum incident.pdf' },
              },
              {
                title: 'Check the signature, if the record reports one',
                text: 'Fetch the public key, then verify the Ed25519 signature over the canonical payload bytes. The signature covers the payload, not the PDF, so a re-render that changes font embedding does not invalidate it.',
                code: { lang: 'bash', code: 'curl -sS https://api.reliastra.com/v1/verify/keys' },
              },
            ],
          },
        ],
      },
      {
        id: 'exit-codes',
        heading: 'As a CI gate',
        blocks: [
          {
            kind: 'p',
            text: '`reliastra verify` returns a status code rather than a sentence, so it can gate a pipeline without a wrapper. Exit 4 means the claim did not hold — including when the verification service could not be read, because "we could not check" must not be reported as a pass.',
          },
          {
            kind: 'code',
            lang: 'yaml',
            caption: '.github/workflows/evidence.yml',
            code: `- uses: actions/checkout@v4
- name: Verify the evidence record
  run: node ./Reliastra/cli/bin/reliastra.mjs verify "\${{ vars.VERIFICATION_ID }}" --file incident.pdf`,
          },
        ],
      },
    ],
  },

  /* ── REST API ─────────────────────────────────────────────────────────── */
  {
    slug: 'api',
    title: 'REST API',
    summary: 'Authentication, the endpoints that matter, pagination and rate limits.',
    group: 'Integrate',
    sections: [
      {
        id: 'authentication',
        heading: 'Authentication',
        blocks: [
          {
            kind: 'p',
            text: 'Two credentials work on the API. A session token from `/v1/auth/login` acts as the account. An API key acts for a specific set of scopes and is what a service or a pipeline should use.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `# Issue a scoped key (shown once)
reliastra keys create ci-bot --scopes read:checks,write:dependencies,read:incidents,read:evidence

# Use it
export RELIASTRA_TOKEN=rel_…
curl -sS https://api.reliastra.com/v1/dependencies -H "Authorization: Bearer $RELIASTRA_TOKEN"`,
          },
          {
            kind: 'table',
            columns: ['Scope', 'Grants'],
            rows: [
              ['read:checks', 'Read observations'],
              ['write:dependencies', 'Create, update and delete dependencies'],
              ['read:incidents', 'Read incidents and correlations'],
              ['read:evidence', 'Read evidence records and download artifacts'],
            ],
          },
        ],
      },
      {
        id: 'endpoints',
        heading: 'Endpoints',
        blocks: [
          {
            kind: 'table',
            columns: ['Method and path', 'What it does'],
            rows: [
              ['POST /v1/auth/login', 'Exchange email and password for an access and refresh token'],
              ['POST /v1/auth/refresh', 'Rotate an expired access token'],
              ['GET /v1/users/me', 'The authenticated account'],
              ['GET /v1/dependencies', 'List dependencies (`limit`, `cursor`)'],
              ['POST /v1/dependencies', 'Create one'],
              ['GET /v1/dependencies/{id}', 'Read one'],
              ['PATCH /v1/dependencies/{id}', 'Update one'],
              ['DELETE /v1/dependencies/{id}', 'Delete one and its observations'],
              ['GET /v1/dependencies/{id}/results', 'Observations for one dependency'],
              ['GET /v1/dependencies/{id}/history', 'Aggregated history over a window'],
              ['GET /v1/checks/recent', 'The most recent observations across dependencies'],
              ['GET /v1/incidents', 'List incidents (`limit`, `cursor`, `status`, `severity`, `dependency_id`)'],
              ['GET /v1/incidents/{id}', 'One incident with its correlations'],
              ['PATCH /v1/incidents/{id}', 'Set status, severity, root cause or description'],
              ['POST /v1/incidents/{id}/correlate', 'Record a correlated dependency'],
              ['GET /v1/incidents/{id}/evidence', 'The evidence record for this incident'],
              ['GET /v1/evidence', 'List evidence records'],
              ['GET /v1/evidence/{id}', 'One record: checksum, verification id and URL, payload hash, and a one-hour signed `download_url`'],
              ['GET /v1/evidence/{id}/artifact', 'The rendered artifact itself, streamed. Use this from a script'],
              ['GET /v1/evidence/{report_token}/download', 'Public gate download by token, for a shared record'],
              ['POST /v1/evidence/{id}/regenerate', 'Rebuild an artifact from its incident'],
              ['GET /v1/verify/{verification_id}', 'Public verification record. No authentication.'],
              ['GET /v1/verify/keys', 'Public signing keys, in JWK form'],
              ['GET /v1/vendors', 'The public observatory index'],
              ['GET /v1/vendors/{name}', 'One vendor’s public record'],
              ['GET|POST /v1/webhooks', 'List or create webhook subscriptions (session only)'],
              ['GET /v1/api-keys', 'List keys (prefixes only; needs `read:api_keys`)'],
              ['POST /v1/api-keys', 'Issue a key. The full value is returned once.'],
            ],
          },
        ],
      },
      {
        id: 'evidence-path',
        heading: 'From an artifact to its verification',
        blocks: [
          {
            kind: 'p',
            text: 'A resolved incident produces an evidence record. `GET /v1/evidence/{id}` returns everything needed to check the artifact it issued, including the public verification id and URL that are printed inside the document itself:',
          },
          {
            kind: 'code',
            lang: 'json',
            caption: 'GET /v1/evidence/{id}',
            code: `{
  "id": "7c1d0a5f-…",
  "incident_id": "9f1c8b0e-…",
  "checksum": "0c72…",              // SHA-256 of the rendered document
  "data_hash": "3f9a…",             // SHA-256 of the canonical facts payload
  "verification_id": "8Kd2xQ7mB4pL",
  "verification_url": "https://reliastra.com/reports/8Kd2xQ7mB4pL",
  "methodology_version": "2.0",
  "signed": false,                  // this deployment issues unsigned artifacts
  "expires_at": "2027-09-04T09:12:00Z"
}`,
          },
          {
            kind: 'p',
            text: '`verification_url` opens a page that needs no account, and `GET /v1/verify/{verification_id}` is the same record as JSON. `GET /v1/verify/keys` publishes the Ed25519 public keys for deployments that sign, so a third party can check a signature without trusting either endpoint.',
          },
        ],
      },
      {
        id: 'api-keys',
        heading: 'What an API key can and cannot reach',
        blocks: [
          {
            kind: 'p',
            text: 'Keys are denied by default. A key can reach the dependency, observation, incident and evidence surfaces its scopes allow; it cannot reach identity, account, webhook or key-management surfaces at all, whatever scopes it carries. That boundary is deliberate: a leaked key must not be able to mint credentials or read the account.',
          },
          {
            kind: 'table',
            columns: ['Surface', 'API key', 'Session'],
            rows: [
              ['Dependencies, observations, incidents, evidence', 'With the matching scope', 'Yes'],
              ['Webhook configuration', 'No', 'Yes'],
              ['API key management', 'No (unless the key carries `read:api_keys`)', 'Yes'],
              ['Account and identity', 'No', 'Yes'],
            ],
          },
          {
            kind: 'note',
            tone: 'info',
            title: 'Programmatic reads are still first-class',
            text: '`GET /v1/dependencies/{id}/results`, `GET /v1/incidents?dependency_id=…` and `GET /v1/evidence/{id}` cover the whole read path a service needs. Use the CLI or the console for webhooks and keys, where a human is making the change.',
          },
        ],
      },
      {
        id: 'pagination',
        heading: 'Pagination',
        blocks: [
          {
            kind: 'code',
            lang: 'json',
            caption: 'GET /v1/incidents?limit=2',
            code: `{ "items": [ … ], "next_cursor": "eyJpZCI6…", "has_more": true }`,
          },
          {
            kind: 'p',
            text: 'Pass `next_cursor` back as `cursor` to continue. Cursors are stable for a query shape, not across filters — change the filter and start again.',
          },
        ],
      },
      {
        id: 'errors',
        heading: 'Errors',
        blocks: [
          {
            kind: 'table',
            columns: ['Status', 'Meaning', 'What to do'],
            rows: [
              ['400', 'Validation failed. `detail` lists each bad field.', 'Fix the request. The field name is in the message.'],
              ['401', 'No credential, or the token expired.', 'Refresh, or issue a new key.'],
              ['403', 'The credential lacks the scope.', 'Check the scopes on the key.'],
              ['404', 'No such resource, or not yours.', 'Confirm the id came from your own list call.'],
              ['429', 'Rate limited.', 'Back off. Paginated list endpoints are the usual cause.'],
              ['503', 'A dependency of the API itself is unreadable.', 'Retry. Do not treat this as an empty result.'],
            ],
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'An empty list and a failure are different',
            text: '`{"items": []}` means you have none. A non-2xx means the question could not be answered. Code that collapses the two will eventually report "no incidents" during an API outage.',
          },
        ],
      },
      {
        id: 'openapi',
        heading: 'Schema',
        blocks: [
          {
            kind: 'p',
            text: 'The FastAPI-generated OpenAPI document is served by the API itself and is the authoritative field list — these docs quote it rather than replacing it.',
          },
          { kind: 'code', lang: 'bash', code: 'curl -sS https://api.reliastra.com/openapi.json | jq ".paths | keys"' },
        ],
      },
    ],
  },

  /* ── CLI ──────────────────────────────────────────────────────────────── */
  {
    slug: 'cli',
    title: 'CLI',
    summary:
      'Install, authenticate, read dependencies and incidents, retrieve evidence, and gate a pipeline on verification.',
    group: 'Integrate',
    sections: [
      {
        id: 'install',
        heading: 'Install',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `git clone --depth 1 https://github.com/ReliaAstra/Reliastra.git
npm install -g ./Reliastra/cli
reliastra --help`,
          },
          {
            kind: 'p',
            text: 'Node 18.17 or newer, no dependencies, no build step. The package is `cli/` in the repository and is not published to the public npm registry yet, so `npx` has nothing to resolve; a pipeline runs the file directly after checkout — `node ./Reliastra/cli/bin/reliastra.mjs`. `--version` prints the version, and every command and subcommand answers `--help`, including mid-command (`reliastra evidence get --help`).',
          },
        ],
      },
      {
        id: 'auth',
        heading: 'Authenticate',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `# A session for this machine
reliastra login --email you@example.com

# Or store an API key, which is what a service should use
reliastra login --token rel_…`,
          },
          {
            kind: 'p',
            text: 'Credential precedence is `--token` → `RELIASTRA_TOKEN` → the config file, and `whoami` prints which one was used — the first question in any support thread. A password is never accepted as a flag: it comes from a prompt, or from `RELIASTRA_PASSWORD` in automation, so it cannot reach shell history or a process listing.',
          },
          {
            kind: 'p',
            text: 'A session token can read the account; an API key cannot, by design — identity and account surfaces are closed to keys. The CLI detects which credential it holds and reports the right thing rather than sending you to re-login for a problem re-login cannot fix.',
          },
          {
            kind: 'code',
            lang: 'bash',
            caption: 'Something is wrong, and you want to know what',
            code: `reliastra doctor`,
          },
          {
            kind: 'p',
            text: '`doctor` checks the config file (including its permissions), the credential and the API, and names which of them failed. It needs no valid credential to be useful: “the API is unreachable” and “your credential was rejected” have different fixes and different exit codes.',
          },
        ],
      },
      {
        id: 'commands',
        heading: 'Commands',
        blocks: [
          {
            kind: 'table',
            columns: ['Command', 'What it does'],
            rows: [
              ['`reliastra login` / `logout` / `whoami`', 'Session and credential handling'],
              ['`reliastra doctor`', 'Check config, credential and API, and name the failure'],
              ['`reliastra deps list` / `show <id>` / `add` / `rm`', 'What is being probed, and one dependency in full'],
              ['`reliastra checks recent`', 'Raw observations, newest first (`--dependency <id>`)'],
              ['`reliastra incidents list` / `show <id>` / `correlate <id>`', 'Incidents, their windows, and correlation scores'],
              ['`reliastra evidence list` / `show <id>` / `get <id>`', 'Evidence records and artifact download'],
              ['`reliastra verify <verification-id>`', 'Check a document against the public record. No account needed'],
              ['`reliastra keys list` / `create` / `rm`', 'API keys for CI and other services'],
              ['`reliastra obs list` / `show <vendor>`', 'The public observatory, unauthenticated'],
              ['`reliastra open <kind> [id]`', 'Print (or open) the web page for a resource'],
            ],
          },
          {
            kind: 'p',
            text: 'Every command accepts `--json`, and the JSON is the API’s own shape: no renamed fields, no dropped nulls, no derived values. `--quiet` drops the explanatory lines.',
          },
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra checks recent --json | jq '[.[] | select(.is_up == false)] | length'
reliastra deps list --json | jq -r '.[] | "\(.name)\t\(.endpoint_url)"'
reliastra incidents list --status open --web`,
          },
        ],
      },
      {
        id: 'evidence',
        heading: 'Evidence and verification',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra incidents show <incident-id> --evidence
reliastra evidence show <report-id>            # prints the public verification URL
reliastra evidence get <report-id> --out incident.pdf --payload
reliastra verify <verification-id> --file incident.pdf`,
          },
          {
            kind: 'p',
            text: '`evidence get` writes the artifact and prints the SHA-256 of the bytes it wrote, computed locally — comparing that with the recorded checksum is the only way to know the transfer was faithful. `verify` is unauthenticated on purpose: it serves somebody who was handed a document and has no account.',
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'Failing closed',
            text: 'A missing record, a changed file, a hash mismatch and a verification service that cannot be read all exit 4. “We could not check” must never be reported as a pass, so it is not.',
          },
        ],
      },
      {
        id: 'web',
        heading: 'Terminal and web',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `reliastra open incident <incident-id> --browser
reliastra open verify <verification-id>        # public page, no account needed
open "$(reliastra open evidence <report-id>)"  # printing is the default, so this composes`,
          },
          {
            kind: 'p',
            text: '`--web` adds the console URL to `deps list`, `incidents list` and `evidence list`. `--site-url` (or `RELIASTRA_SITE_URL`) points the links at a self-hosted origin.',
          },
        ],
      },
      {
        id: 'exit-codes',
        heading: 'Exit codes',
        blocks: [
          {
            kind: 'table',
            columns: ['Code', 'Meaning'],
            rows: [
              ['0', 'Success'],
              ['1', 'Usage error, or invalid configuration'],
              ['2', 'The API returned an error (validation, not found, upstream)'],
              ['3', 'Authentication required, rejected, or expired'],
              ['4', 'A verification claim did not hold'],
              ['5', 'Authenticated, but not permitted to make this call'],
              ['6', 'The API could not be reached at all'],
            ],
          },
          {
            kind: 'p',
            text: 'A pipeline can therefore tell a rejected credential (3) from a missing scope (5) from a network failure (6) without parsing prose. Errors are classified and printed without stack traces; a 403 names the scope that was missing.',
          },
          {
            kind: 'code',
            lang: 'bash',
            caption: 'Verify in a pipeline',
            code: `reliastra verify "$VERIFICATION_ID" --file evidence.pdf
# 0 — the file matches the record
# 4 — a missing record, a changed file, or a service that could not be read`,
          },
        ],
      },
      {
        id: 'configuration',
        heading: 'Configuration',
        blocks: [
          {
            kind: 'table',
            columns: ['Variable', 'Effect'],
            rows: [
              ['`RELIASTRA_TOKEN`', 'Bearer token or API key for this invocation'],
              ['`RELIASTRA_API_URL`', 'API base URL (default `https://api.reliastra.com`)'],
              ['`RELIASTRA_SITE_URL`', 'Web origin used for links (default `https://reliastra.com`)'],
              ['`RELIASTRA_CONFIG`', 'Path to the config file'],
              ['`RELIASTRA_PASSWORD`', 'Password for a non-interactive `login`'],
            ],
          },
          {
            kind: 'p',
            text: 'The config file is written with mode 0600 in a 0700 directory. `logout` revokes the session server-side and removes the file even if the API cannot be reached, so an outage cannot leave a token on disk. No credential is ever printed: `whoami` and `doctor` report where a credential came from, never its value.',
          },
        ],
      },
    ],
  },

  /* ── Webhooks ─────────────────────────────────────────────────────────── */
  {
    slug: 'webhooks',
    title: 'Webhooks',
    summary: 'Push incidents and evidence into your own systems instead of polling for them.',
    group: 'Integrate',
    sections: [
      {
        id: 'create',
        heading: 'Create a subscription',
        blocks: [
          {
            kind: 'code',
            lang: 'bash',
            code: `curl -sS -X POST https://api.reliastra.com/v1/webhooks \\
  -H "Authorization: Bearer $RELIASTRA_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://ops.example.com/hooks/reliastra","events":["incident.opened","incident.updated","incident.resolved","evidence.ready"]}'`,
          },
        ],
      },
      {
        id: 'events',
        heading: 'Events',
        blocks: [
          {
            kind: 'definitions',
            items: [
              { term: 'incident.opened', def: 'The detector confirmed a failure run. Carries the incident id, dependency id, window and the rule that fired.' },
              { term: 'incident.updated', def: 'A field on an open incident changed by hand (severity, status, root cause, description). Carries the field names that changed.' },
              { term: 'incident.resolved', def: 'The recovery rule was satisfied. Carries the window and the root-cause field as they stand at resolution.' },
              { term: 'evidence.ready', def: 'An artifact was generated and is retrievable. Carries the report id, the verification id and the document checksum, so a consumer can act on it without a second lookup.' },
            ],
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'The API accepts five further values — `vendor.degraded`, `vendor.down`, `vendor.recovered`, `sla.breach` and `check.failed` — because they are part of the event enum. Nothing emits them yet, so a subscription that names one stores successfully and never fires. They are listed here rather than omitted: a silent no-op is worse than a documented gap.',
          },
          {
            kind: 'code',
            lang: 'json',
            caption: 'incident.opened — body',
            code: `{
  "event": "incident.opened",
  "timestamp": "2026-09-18T10:06:02.412+00:00",
  "data": {
    "incident_id": "9f1c8b0e-…",
    "dependency_id": "d4e5f6a7-…",
    "started_at": "2026-09-18T09:55:00Z",
    "severity": "major",
    "status": "open",
    "detection": { "rule": "${DETECTION.ruleId}", "required": ${DETECTION.failureChecks} }
  }
}`,
          },
          {
            kind: 'table',
            columns: ['Header', 'Value'],
            rows: [
              ['`X-Reliastra-Event`', 'The event type, so a consumer can route without parsing the body'],
              ['`X-Reliastra-Delivery`', 'A unique delivery id — deduplicate on this, not on the body'],
              ['`X-Reliastra-Signature`', '`sha256=<hmac>` over the raw body, when the subscription has a secret'],
            ],
          },
          {
            kind: 'list',
            items: [
              '`incident.opened` is sent once, when the detector confirms a failure run. A repeat call for an incident that is already open dispatches nothing.',
              '`incident.updated` carries the field names that changed (`"changed": ["severity"]`), and is not sent when an update resolves the incident.',
              '`incident.resolved` carries the window and the root-cause field as they stand at resolution.',
              '`evidence.ready` is sent after the artifact exists and is retrievable, with the report id, the verification id and the document checksum.',
            ],
          },
        ],
      },
      {
        id: 'deliveries',
        heading: 'Delivery',
        blocks: [
          {
            kind: 'list',
            items: [
              'A 2xx within ten seconds marks the delivery successful. Anything else is recorded against the delivery and retried on a fixed backoff: 1m, 5m, 15m, 1h, 3h, then permanently failed.',
              'Delivery happens off the request that caused it, on the task queue, so a slow consumer cannot affect incident detection or evidence generation.',
              'Every delivery carries a delivery id in a header, so a consumer can deduplicate rather than process twice.',
              '`GET /v1/webhooks/{id}/deliveries` lists recent attempts with their response codes, which is how you diagnose a consumer that has started failing.',
              '`POST /v1/webhooks/{id}/test` sends a synthetic delivery, in the same envelope, so one parser covers both paths.',
            ],
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'Treat the body as untrusted input',
            text: 'Verify the delivery against the shared secret before acting on it, and never let a webhook body trigger a privileged operation directly.',
          },
        ],
      },
    ],
  },

  /* ── Methodology ──────────────────────────────────────────────────────── */
  {
    slug: 'methodology',
    title: 'Methodology',
    summary: 'The canonical explanation of every rule and number RELIASTRA reports, and the limits of each.',
    group: 'Reference',
    sections: [
      {
        id: 'topology',
        heading: 'Observation topology',
        blocks: [
          {
            kind: 'p',
            text: `Probes are issued from **${OBSERVATION_POINTS === 1 ? 'one' : OBSERVATION_POINTS} observation point**. A \`region\` value appears on every observation because the scheduler labels the worker that ran the probe; under the deployed topology it carries no confirmation weight.`,
          },
          {
            kind: 'note',
            tone: 'warn',
            title: 'No regional claims',
            text: 'Nothing on this site or in any record claims multi-region agreement, because there is no fleet of independent points to agree. If you have read otherwise elsewhere, that text is wrong and this page supersedes it.',
          },
        ],
      },
      {
        id: 'detection',
        heading: 'Detection',
        blocks: [
          {
            kind: 'p',
            text: `Under a single observation point there is no second opinion available, so the only honest confirmation signal is persistence: ${DETECTION.failureChecks} consecutive failed checks open an incident, ${DETECTION.recoveryChecks} consecutive successes resolve one.`,
          },
          {
            kind: 'table',
            columns: ['Property', 'Value'],
            rows: [
              ['Failure rule', `\`${DETECTION.ruleId}\`, threshold ${DETECTION.failureChecks}`],
              ['Recovery rule', `\`${DETECTION.recoveryRuleId}\`, threshold ${DETECTION.recoveryChecks}`],
              ['Determinism', 'Pure function of stored observations. Replayable; no clock reads, no randomness.'],
              ['Incident start', 'The first failure of the qualifying run, not the check that crossed the threshold.'],
              ['Backfill', 'None. Missed probes are missing, not reconstructed.'],
            ],
          },
        ],
      },
      {
        id: 'attribution-model',
        heading: 'Attribution',
        blocks: [
          {
            kind: 'p',
            text: 'Five normalised signals are combined with fixed weights. The weights sum to exactly 1, which is what makes a score reproducible.',
          },
          {
            kind: 'table',
            columns: ['Signal', 'Weight', 'Question it answers'],
            rows: [
              ['Temporal overlap', '0.20', 'Did the dependency degrade inside the incident window?'],
              ['Endpoint overlap', '0.25', 'Was the failing endpoint one this dependency serves?'],
              ['Latency correlation', '0.25', 'Did latency move with the failures?'],
              ['Error pattern', '0.15', 'Are the errors one coherent class, or several?'],
              ['Infrastructure baseline', '0.15', 'Were RELIASTRA’s own probes healthy while this happened?'],
            ],
          },
          {
            kind: 'p',
            text: 'Classification follows the score: **≥75** `vendor_failure`, **≥50** `multi_cause`, and below 50 either `infrastructure_issue` or `unknown`. Every result carries `methodology_version`.',
          },
        ],
      },
      {
        id: 'what-we-refuse',
        heading: 'What RELIASTRA refuses to claim',
        blocks: [
          {
            kind: 'list',
            items: [
              'Causation from correlation. A score is an alignment between timelines.',
              'Vendor-wide outages from one path. A single observation point measures one route.',
              'Availability without a denominator. An availability figure is always shown with the observation count behind it, and prints as **insufficient data** at zero.',
              'A number for something not measured. An unmeasured value renders as a named sentinel, never as `0` or `100%`.',
              'Reconstructed history. If probes were missed, the record says so.',
            ],
          },
          {
            kind: 'note',
            tone: 'info',
            title: 'Where the limits are written down',
            text: 'The public observatory states the scope of every figure it reports, and the research corpus documents the audits that found where earlier versions of these pages overstated their own data.',
          },
        ],
      },
    ],
  },

  /* ── Security ─────────────────────────────────────────────────────────── */
  {
    slug: 'security',
    title: 'Security',
    summary: 'What RELIASTRA stores, what it encrypts, and what the public surfaces can expose.',
    group: 'Reference',
    sections: [
      {
        id: 'what-is-stored',
        heading: 'What is stored',
        blocks: [
          {
            kind: 'fields',
            items: [
              { field: 'Endpoint URLs', def: 'Stored as configured. They appear in incident records and evidence artifacts for your account.' },
              { field: 'Secret header values', def: 'Encrypted at rest. Never returned by any API response; reads report `has_headers` only.' },
              { field: 'Observations', def: 'Timestamp, status, latency, verdict. Not response bodies — the probe never reads them.' },
              { field: 'Evidence artifacts', def: 'Rendered documents, retained 365 days and reachable only by token.' },
            ],
          },
          {
            kind: 'note',
            tone: 'info',
            title: 'Response bodies are never captured',
            text: 'The probe reads status and headers and closes the connection. There is no path by which a response payload reaches RELIASTRA storage.',
          },
        ],
      },
      {
        id: 'credentials',
        heading: 'Credentials',
        blocks: [
          {
            kind: 'list',
            items: [
              'API keys are stored as a prefix plus a hash. The full value is returned exactly once, at creation.',
              'Session tokens are short-lived and rotated on refresh.',
              'Verification tokens carry capability for one artifact. They are unguessable and revocable by regenerating the record.',
              'Admin surfaces are on a separate authentication path from customer accounts.',
            ],
          },
        ],
      },
      {
        id: 'public-surfaces',
        heading: 'What is public',
        blocks: [
          {
            kind: 'p',
            text: 'The observatory publishes measurements for endpoints RELIASTRA probes as part of its own public record. Customer dependencies are never included in it. Nothing in your account appears on any public page unless you explicitly publish it.',
          },
          {
            kind: 'p',
            text: 'The verification endpoint returns hashes and a key reference for one artifact, not the incident. A verifier learns that a document is intact, not what it says.',
          },
        ],
      },
      {
        id: 'reporting',
        heading: 'Reporting a problem',
        blocks: [
          {
            kind: 'p',
            text: 'Security reports go to [security@reliastra.com](mailto:security@reliastra.com). Include a reproduction and the smallest amount of data that demonstrates the issue; do not include customer data you are not authorized to share.',
          },
        ],
      },
    ],
  },
];

/** Every published guide, keyed by slug. */
export const DOCS_BY_SLUG = new Map(DOCS.map((doc) => [doc.slug, doc]));

export function docFor(slug: string): Doc | undefined {
  return DOCS_BY_SLUG.get(slug);
}
