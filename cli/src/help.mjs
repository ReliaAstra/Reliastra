/**
 * Help text, per command.
 *
 * Why this file exists rather than one big banner: the first thing an engineer
 * does with an unfamiliar tool is type its name at the thing they are about to
 * do - `reliastra evidence get --help`. When every `--help` printed the same
 * top-level list, that habit returned the table of contents instead of the
 * answer, and the only way to learn a flag was to read the README or guess.
 *
 * Every entry follows the same shape, so the eye always knows where to look:
 *
 *   <one line: what it does>
 *   usage
 *   what it prints
 *   flags specific to it
 *   examples that actually run
 *
 * The examples are checked by the test suite against the parser, so a command
 * that is renamed cannot leave a stale example behind in its own help.
 */

/** Flags every command accepts. Documented once, referenced everywhere. */
export const GLOBAL_FLAGS = [
  ['--json', 'Machine-readable output. This is the API’s own shape, unrenamed.'],
  ['--quiet', 'Suppress the explanatory lines; data only.'],
  ['--api-url <url>', 'Override the API base for this invocation.'],
  ['--site-url <url>', 'Override the web origin used for links.'],
  ['--token <token>', 'Bearer token or API key for this invocation only.'],
  ['-h, --help', 'Help for this command.'],
];

export function formatBody({
  description,
  usage,
  prints = [],
  args = [],
  flags = [],
  examples = [],
  notes = [],
}) {
  const lines = [description, '', 'Usage', `  ${usage}`];

  if (prints.length) {
    lines.push('', 'Output', ...prints.map((p) => `  ${p}`));
  }
  if (args.length) {
    lines.push('', 'Arguments', ...formatRows(args));
  }
  if (flags.length) {
    lines.push('', 'Flags', ...formatRows(flags));
  }
  if (notes.length) {
    lines.push('', 'Notes', ...notes.map((n) => `  ${n}`));
  }
  if (examples.length) {
    lines.push('', 'Examples', ...examples.map((e) => `  ${e}`));
  }
  return lines.join('\n');
}

/**
 * `name  description` rows, descriptions aligned.
 *
 * The command names here run longer than a terminal's eighth column, so the
 * padding is capped: past that the description simply follows on the same line
 * rather than being pushed to a ragged far edge.
 */
function formatRows(rows) {
  const width = Math.min(Math.max(...rows.map(([name]) => name.length)), 30);
  return rows.map(([name, description]) =>
    name.length > width
      ? `  ${name}\n  ${' '.repeat(width)}  ${description}`
      : `  ${name.padEnd(width)}  ${description}`
  );
}

/** The exit-code table. Printed by `--help` and by `reliastra doctor`. */
export const EXIT_CODES = [
  ['0', 'Success.'],
  ['1', 'Usage error, or invalid or contradictory configuration.'],
  ['2', 'The API returned an error (validation, not found, upstream failure).'],
  ['3', 'Authentication required, rejected, or expired.'],
  ['4', 'A verification claim did not hold.'],
  ['5', 'Authenticated, but not permitted to do this.'],
  ['6', 'The API could not be reached at all.'],
];

export const ENVIRONMENT = [
  ['RELIASTRA_TOKEN', 'Bearer token or API key. Same as --token.'],
  ['RELIASTRA_API_URL', 'API base URL. Same as --api-url.'],
  ['RELIASTRA_SITE_URL', 'Web origin used for links. Same as --site-url.'],
  ['RELIASTRA_CONFIG', 'Path to the config file.'],
  ['RELIASTRA_PASSWORD', 'Password for a non-interactive `login`.'],
  ['NO_COLOR', 'Accepted and ignored: this CLI emits no colour in any mode.'],
];

export function formatTable(rows) {
  const width = Math.min(Math.max(...rows.map(([name]) => name.length)), 22);
  return rows.map(([name, description]) => `  ${name.padEnd(width)}  ${description}`);
}

/** Per-command help. Keyed by `"<command>"` and `"<command> <subcommand>"`. */
export const HELP = {
  login: {
    description:
      'Store a session for this machine. Prompts for the password; never takes it as a flag.',
    usage: 'reliastra login [--email <email>] [--token <api-key>]',
    prints: ['Where the credential was written, and when it expires.'],
    flags: [
      ['--email <email>', 'Account email. Falls back to RELIASTRA_EMAIL.'],
      [
        '--token <api-key>',
        'Store an API key instead of signing in. Useful on a build runner where no email is available.',
      ],
      [
        '--print-token',
        'Write the access token alone on stdout, for piping to another tool on this machine. Not for CI logs.',
      ],
    ],
    notes: [
      'The password is read from an interactive prompt, or from RELIASTRA_PASSWORD for',
      'automation. It is never accepted as a flag: an argument lands in shell history and',
      'in every process listing on the machine.',
      'The access token is refreshed automatically and rotated in place. An API key is not',
      'refreshed, because a key is not a session.',
    ],
    examples: [
      'reliastra login',
      'reliastra login --email you@example.com',
      'RELIASTRA_PASSWORD=… reliastra login --email you@example.com   # CI',
    ],
  },

  logout: {
    description: 'Revoke the session server-side and delete the stored credential.',
    usage: 'reliastra logout',
    notes: [
      'The local credential is removed even if the API cannot be reached, so a network',
      'outage cannot leave a token sitting on disk.',
    ],
  },

  whoami: {
    description:
      'Show which account this invocation resolves to, and where the credential came from.',
    usage: 'reliastra whoami [--json]',
    notes: [
      'Answers "which token am I actually using" - the first question in most support',
      'threads - by naming the source: flag, environment, or the config file.',
    ],
    examples: ['reliastra whoami', 'reliastra whoami --json | jq -r .account.email'],
  },

  doctor: {
    description:
      'Check the local configuration, the credential and the API, and say what is wrong.',
    usage: 'reliastra doctor [--json]',
    prints: [
      'One line per check, with `ok`, `warn` or `fail`, then a diagnosis and a next step.',
    ],
    notes: [
      'No credential is required: an unauthenticated run still reports whether the API is',
      'reachable, which is the difference between "my token is wrong" and "my network is".',
      'Exits 0 when everything essential passes, 3 when authentication is the failure, and',
      '6 when the API cannot be reached.',
    ],
    examples: [
      'reliastra doctor',
      'reliastra doctor --json | jq .checks',
    ],
  },

  deps: {
    description: 'The endpoints RELIASTRA probes on this account.',
    usage: 'reliastra deps <list|show|add|rm> [arguments]',
    prints: ['list  a table of dependencies with their interval and last observation'],
    notes: ['A dependency is an HTTP endpoint plus what counts as a good response for it.'],
    examples: ['reliastra deps list', 'reliastra deps show 4b2e1c9d'],
  },

  'deps list': {
    description: 'List the dependencies being probed, with their most recent observation.',
    usage: 'reliastra deps list [--limit 100]',
    flags: [['--limit <n>', 'Maximum rows. Default 100.']],
    examples: [
      'reliastra deps list',
      'reliastra deps list --json | jq -r \'.[] | "\\(.name)\\t\\(.endpoint_url)"\'',
    ],
  },

  'deps show': {
    description:
      'One dependency: configuration, recent observations, and its incident history.',
    usage: 'reliastra deps show <dependency-id> [--observations 20] [--web]',
    flags: [
      ['--observations <n>', 'How many recent observations to print. Default 10.'],
      ['--web', 'Also print the console URL for this dependency.'],
    ],
    examples: [
      'reliastra deps show 4b2e1c9d',
      'reliastra deps show 4b2e1c9d --observations 50 --json | jq .observations',
    ],
  },

  'deps add': {
    description: 'Start probing an endpoint.',
    usage:
      'reliastra deps add <name> <url> [--interval 300] [--expect 200] [--method GET] [--timeout 10]',
    args: [
      ['name', 'A label you will recognise in a list.'],
      ['url', 'An http(s) URL. Private, loopback and metadata addresses are refused.'],
    ],
    flags: [
      ['--interval <seconds>', 'Check interval. Default 300.'],
      ['--expect <codes>', 'Comma-separated expected status codes. Default 200.'],
      ['--method <method>', 'HTTP method. Default GET.'],
      ['--timeout <seconds>', 'Per-request deadline. Default 10, maximum 300.'],
    ],
    notes: [
      'The first observation appears on the next scheduled check, not immediately.',
    ],
    examples: [
      'reliastra deps add "Payments API" https://api.example.com/health',
      'reliastra deps add "Auth" https://auth.example.com/.well-known/jwks.json --interval 60 --expect 200',
    ],
  },

  'deps rm': {
    description: 'Stop probing an endpoint. Observations already recorded are kept.',
    usage: 'reliastra deps rm <dependency-id> [--yes]',
    flags: [['--yes', 'Skip the confirmation prompt (required when not a terminal).']],
    examples: ['reliastra deps rm 4b2e1c9d --yes'],
  },

  checks: {
    description: 'Raw observations, newest first.',
    usage: 'reliastra checks recent [--limit 50] [--dependency <id>]',
    prints: ['One row per probe: when, from which region label, up or failed, latency, detail.'],
    flags: [
      ['--limit <n>', 'Maximum rows. Default 50.'],
      ['--dependency <id>', 'Only observations for one dependency.'],
    ],
    notes: [
      'These are observations, not verdicts. A failed row is a fact about one probe; an',
      'incident is opened by the detector after consecutive failures and is reported by',
      '`reliastra incidents`.',
    ],
    examples: [
      'reliastra checks recent',
      'reliastra checks recent --json | jq \'[.[] | select(.is_up == false)] | length\'',
    ],
  },

  incidents: {
    description: 'Incidents the detector opened, and what happened in their windows.',
    usage: 'reliastra incidents <list|show|correlate> [arguments]',
    examples: ['reliastra incidents list --status open', 'reliastra incidents show 9f1c8b0e'],
  },

  'incidents list': {
    description: 'Incidents, newest first.',
    usage: 'reliastra incidents list [--status open|resolved] [--limit 25] [--web]',
    flags: [
      ['--status <status>', 'Filter by open or resolved.'],
      ['--limit <n>', 'Maximum rows. Default 25.'],
      ['--web', 'Print the console URL for each incident.'],
    ],
    examples: [
      'reliastra incidents list --status open',
      'reliastra incidents list --json | jq -r ".[] | [.id, .severity, .started_at] | @tsv"',
    ],
  },

  'incidents show': {
    description:
      'One incident: window, severity, evidence record, and any correlated dependencies.',
    usage: 'reliastra incidents show <incident-id> [--web] [--json]',
    flags: [
      ['--web', 'Also print the console URL for this incident.'],
      ['--evidence', 'Fetch and print the evidence record for this incident, if one exists.'],
    ],
    notes: [
      'The detection rule that fired and the attribution verdict live inside the evidence',
      'record. `--evidence` follows that link for you; the record is also reachable with',
      '`reliastra evidence show <report-id>`.',
    ],
    examples: [
      'reliastra incidents show 9f1c8b0e',
      'reliastra incidents show 9f1c8b0e --evidence',
      'reliastra incidents show 9f1c8b0e --json | jq .correlations',
    ],
  },

  'incidents correlate': {
    description:
      'Align a dependency degradation with this incident window and score the overlap.',
    usage: 'reliastra incidents correlate <incident-id> [--json]',
    notes: [
      'Deterministic and versioned: five weighted signals, published weights, and a',
      'methodology version on the result. A score is an alignment between two timelines -',
      'it is not a statement of cause, and the output says so.',
    ],
  },

  evidence: {
    description: 'The compiled records RELIASTRA issues for resolved incidents.',
    usage: 'reliastra evidence <list|show|get> [arguments]',
    notes: [
      'An evidence record is the artifact you hand to someone who was not in the room:',
      'the window, every observation in it, the detector’s rule, the attribution result,',
      'and the hashes that let a third party check none of it changed.',
      '`reliastra evidence show <id>` prints its verification URL, which needs no account.',
    ],
    examples: ['reliastra evidence list', 'reliastra evidence show 7c1d0a5f'],
  },

  'evidence list': {
    description: 'Evidence records issued for this account, newest first.',
    usage: 'reliastra evidence list [--limit 50] [--web]',
    flags: [
      ['--limit <n>', 'Maximum rows. Default 50.'],
      ['--web', 'Print the console URL for each record.'],
    ],
    examples: ['reliastra evidence list', 'reliastra evidence list --json | jq -r ".[].checksum"'],
  },

  'evidence show': {
    description:
      'One evidence record: window, size, document checksum, and how to verify it.',
    usage: 'reliastra evidence show <report-id> [--web] [--json]',
    flags: [
      ['--web', 'Also print the console URL for this record.'],
      ['--payload', 'Print the canonical payload hash and signature details too.'],
    ],
    prints: [
      'The public verification URL, which is the whole point of the record: it opens a page',
      'that re-checks the hashes without an account and without trusting the reader.',
    ],
    examples: [
      'reliastra evidence show 7c1d0a5f',
      'reliastra evidence show 7c1d0a5f --json | jq -r .verification_url',
    ],
  },

  'evidence get': {
    description: 'Write the artifact (PDF) to a file, and print the hash of the bytes on disk.',
    usage: 'reliastra evidence get <report-id> [--out <path>]',
    flags: [
      ['--out <path>', 'Where to write it. Default reliastra-evidence-<id>.pdf.'],
    ],
    notes: [
      'The SHA-256 printed is computed from the file on disk, not echoed from the API.',
      'Comparing the two is the only way to know the transfer was faithful.',
    ],
    examples: [
      'reliastra evidence get 7c1d0a5f --out incident-2026-09-14.pdf',
      'reliastra evidence get 7c1d0a5f | grep sha-256',
    ],
  },

  verify: {
    description:
      'Check a document against the public verification record. Needs no account.',
    usage:
      'reliastra verify <verification-id> [--file <document.pdf>] [--expect-hash <sha256>] [--json]',
    args: [
      ['verification-id', 'The id printed in the artifact footer and encoded in its QR code.'],
    ],
    flags: [
      ['--file <path>', 'Also hash this file and compare it with the recorded checksum.'],
      ['--expect-hash <sha256>', 'Assert the payload hash the record must carry.'],
      ['--id <verification-id>', 'Alternative to the positional argument.'],
    ],
    notes: [
      'Fails closed. A missing record, a changed file, an unreachable service and a hash',
      'mismatch all exit 4; only an exact match exits 0. That makes it usable directly as',
      'a gate in a pipeline, with no wrapper script.',
      'Unauthenticated on purpose: the scenario it serves is somebody who was handed a',
      'document and has no RELIASTRA account.',
    ],
    examples: [
      'reliastra verify 8Kd2xQ7mB4pL',
      'reliastra verify 8Kd2xQ7mB4pL --file incident-2026-09-14.pdf',
      'reliastra verify 8Kd2xQ7mB4pL --json   # inspect .problems on failure',
    ],
  },

  keys: {
    description: 'API keys for CI, scripts and other services.',
    usage: 'reliastra keys <list|create|rm> [arguments]',
    notes: [
      'A key is scoped, independently revocable, and is not a session: it is never',
      'refreshed, and it is shown exactly once when created.',
    ],
    examples: [
      'reliastra keys list',
      'reliastra keys create ci-deploy --scopes read:checks,read:incidents',
    ],
  },

  'keys create': {
    description: 'Issue an API key. The secret is printed once and never stored by us.',
    usage: 'reliastra keys create <name> [--scopes <list>]',
    flags: [
      [
        '--scopes <list>',
        'Comma-separated. Default read:checks, read:incidents, read:evidence, read:dependencies.',
      ],
    ],
    notes: [
      'The full key is printed to stdout. Do not paste it into a shell profile or a',
      'committed file: put it in your CI secret store and expose it as RELIASTRA_TOKEN.',
    ],
  },

  'keys rm': {
    description: 'Revoke an API key immediately.',
    usage: 'reliastra keys rm <key-id> [--yes]',
  },

  obs: {
    description: 'The public observatory: the endpoints RELIASTRA probes on its own record.',
    usage: 'reliastra obs <list|show> [arguments]',
    notes: [
      'Unauthenticated. These are not your dependencies and are never mixed with them;',
      'the public pipeline stores observations and opens no incidents.',
    ],
    examples: ['reliastra obs list', 'reliastra obs show openai'],
  },

  'obs show': {
    description: 'One vendor record: endpoints, recent state, and the last observation.',
    usage: 'reliastra obs show <vendor> [--web] [--json]',
    flags: [['--web', 'Also print the public observatory URL for this vendor.']],
    examples: [
      'reliastra obs show openai',
      'reliastra obs show openai --json | jq ".endpoints[] | .endpoint_url"',
    ],
  },

  open: {
    description: 'Print - or open - the web page for a resource the CLI can identify.',
    usage: 'reliastra open <incident|evidence|verify|dependency|observatory|docs> [id]',
    args: [
      ['incident <id>', 'The console page where the incident window is charted.'],
      ['evidence <id>', 'The console page for one evidence record.'],
      ['verify <id>', 'The public verification page for a verification id. No account needed.'],
      ['dependency <id>', 'The console page for one dependency.'],
      ['observatory [vendor]', 'The public observatory, or one vendor’s record.'],
      ['docs [slug]', 'The documentation, or one guide.'],
    ],
    flags: [
      ['--browser', 'Open it with the system browser instead of printing it.'],
      ['--print', 'Print it. This is the default and is correct for scripts and CI.'],
    ],
    notes: [
      'Printing is the default because a headless machine has no browser, and because a',
      'URL on stdout is what a pipeline can use. `--browser` is the convenience.',
    ],
    examples: [
      'reliastra open verify 8Kd2xQ7mB4pL',
      'reliastra open incident 9f1c8b0e --browser',
      'open "$(reliastra open evidence 7c1d0a5f)"',
    ],
  },
};

/** Everything a `--help` anywhere can need. */
export function helpFor(command, subcommand) {
  return (
    (command && subcommand && HELP[`${command} ${subcommand}`]) ||
    (command && HELP[command]) ||
    null
  );
}
