// Help text, per command.
//
// Why this file exists rather than one big banner: the first thing an engineer
// does with an unfamiliar tool is type its name at the thing they are about to
// do - `reliastra evidence get --help`. When every `--help` printed the same
// top-level list, that habit returned the table of contents instead of the
// answer, and the only way to learn a flag was to read the README or guess.
//
// Every entry follows the same shape, so the eye always knows where to look:
//
//	<one line: what it does>
//	usage
//	what it prints
//	flags specific to it
//	examples that actually run
//
// The examples are checked by the test suite against the parser, so a command
// that is renamed cannot leave a stale example behind in its own help.
package main

import (
	"strings"
)

// flagDoc is one `name  description` row.
type flagDoc struct {
	name        string
	description string
}

// globalFlagsHelp documents the flags every command accepts. Documented once,
// referenced everywhere.
var globalFlagsHelp = []flagDoc{
	{"--json", "Machine-readable output. This is the API’s own shape, unrenamed."},
	{"--quiet", "Suppress the explanatory lines; data only."},
	{"--api-url <url>", "Override the API base for this invocation."},
	{"--site-url <url>", "Override the web origin used for links."},
	{"--token <token>", "Bearer token or API key for this invocation only."},
	{"--no-persist", "Do not write a rotated token pair back to the config file."},
	{"-h, --help", "Help for this command."},
	{"-v, --version", "Print the version and exit."},
}

func formatBody(entry helpEntry) string {
	lines := []string{entry.description, "", "Usage", "  " + entry.usage}
	if len(entry.prints) > 0 {
		lines = append(lines, "", "Output")
		for _, p := range entry.prints {
			lines = append(lines, "  "+p)
		}
	}
	if len(entry.args) > 0 {
		lines = append(lines, "", "Arguments")
		lines = append(lines, formatRows(entry.args)...)
	}
	if len(entry.flags) > 0 {
		lines = append(lines, "", "Flags")
		lines = append(lines, formatRows(entry.flags)...)
	}
	if len(entry.notes) > 0 {
		lines = append(lines, "", "Notes")
		for _, n := range entry.notes {
			lines = append(lines, "  "+n)
		}
	}
	if len(entry.examples) > 0 {
		lines = append(lines, "", "Examples")
		for _, e := range entry.examples {
			lines = append(lines, "  "+e)
		}
	}
	return strings.Join(lines, "\n")
}

// formatRows renders `name  description` rows, descriptions aligned.
//
// The command names here run longer than a terminal's eighth column, so the
// padding is capped: past that the description simply follows on the same line
// rather than being pushed to a ragged far edge.
func formatRows(rows []flagDoc) []string {
	width := 0
	for _, row := range rows {
		if len(row.name) > width {
			width = len(row.name)
		}
	}
	if width > 30 {
		width = 30
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		if len(row.name) > width {
			out = append(out, "  "+row.name+"\n  "+strings.Repeat(" ", width)+"  "+row.description)
		} else {
			out = append(out, "  "+padRight(row.name, width)+"  "+row.description)
		}
	}
	return out
}

// exitCodesHelp is the exit-code table. Printed by `--help`.
var exitCodesHelp = []flagDoc{
	{"0", "Success."},
	{"1", "Usage error, or invalid or contradictory configuration."},
	{"2", "The API returned an error (validation, not found, upstream failure)."},
	{"3", "Authentication required, rejected, or expired."},
	{"4", "A verification claim did not hold."},
	{"5", "Authenticated, but not permitted to do this."},
	{"6", "The API could not be reached at all."},
}

var environmentHelp = []flagDoc{
	{"RELIASTRA_TOKEN", "Bearer token or API key. Same as --token."},
	{"RELIASTRA_API_URL", "API base URL. Same as --api-url."},
	{"RELIASTRA_SITE_URL", "Web origin used for links. Same as --site-url."},
	{"RELIASTRA_CONFIG", "Path to the config file."},
	{"RELIASTRA_PASSWORD", "Password for a non-interactive `login`."},
	{"RELIASTRA_EMAIL", "Account email for `login` when --email is not passed."},
	{"NO_COLOR", "Accepted and ignored: this CLI emits no colour in any mode."},
}

func formatTable(rows []flagDoc) []string {
	width := 0
	for _, row := range rows {
		if len(row.name) > width {
			width = len(row.name)
		}
	}
	if width > 22 {
		width = 22
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, "  "+padRight(row.name, width)+"  "+row.description)
	}
	return out
}

// helpEntry is one `--help` answer: what the command does, its usage, what
// it prints, its arguments and flags, notes, and examples that run.
type helpEntry struct {
	description string
	usage       string
	prints      []string
	args        []flagDoc
	flags       []flagDoc
	notes       []string
	examples    []string
}

// helpEntries is the per-command help. Keyed by `"command"` and
// `"command subcommand"`. (The frontend docs test reads these keys out of the
// source, so keep the `"command" or "command subcommand": {` shape.)
var helpEntries = map[string]helpEntry{
	"login": {
		description: "Store a session for this machine. Prompts for the password; never takes it as a flag.",
		usage:       "reliastra login [--email <email>] [--token <api-key>]",
		prints:      []string{"Where the credential was written, and when it expires."},
		flags:       []flagDoc{
			{"--email <email>", "Account email. Falls back to RELIASTRA_EMAIL."},
			{"--token <api-key>", "Store an API key instead of signing in. Useful on a build runner where no email is available."},
			{"--print-token", "Write the access token alone on stdout, for piping to another tool on this machine. Not for CI logs."},
		},
		notes: []string{
			"The password is read from an interactive prompt, or from RELIASTRA_PASSWORD for",
			"automation. It is never accepted as a flag: an argument lands in shell history and",
			"in every process listing on the machine.",
			"The access token is refreshed automatically and rotated in place. An API key is not",
			"refreshed, because a key is not a session.",
		},
		examples: []string{
			"reliastra login",
			"reliastra login --email you@example.com",
			"RELIASTRA_PASSWORD=… reliastra login --email you@example.com   # CI",
		},
	},

	"logout": {
		description: "Revoke the session server-side and delete the stored credential.",
		usage:       "reliastra logout",
		notes:       []string{
			"The local credential is removed even if the API cannot be reached, so a network",
			"outage cannot leave a token on disk.",
		},
	},

	"whoami": {
		description: "Show which account this invocation resolves to, and where the credential came from.",
		usage:       "reliastra whoami [--json]",
		notes:       []string{
			"Answers \"which token am I actually using\" - the first question in most support",
			"threads - by naming the source: flag, environment, or the config file.",
		},
		examples: []string{"reliastra whoami", "reliastra whoami --json | jq -r .account.email"},
	},

	"doctor": {
		description: "Check the local configuration, the credential and the API, and say what is wrong.",
		usage:       "reliastra doctor [--json]",
		prints:      []string{
			"One line per check, with `ok`, `warn` or `fail`, then a diagnosis and a next step.",
		},
		notes: []string{
			"No credential is required: an unauthenticated run still reports whether the API is",
			"reachable, which is the difference between \"my token is wrong\" and \"my network is\".",
			"Exits 0 when everything essential passes, 3 when authentication is the failure, and",
			"6 when the API cannot be reached.",
		},
		examples: []string{
			"reliastra doctor",
			"reliastra doctor --json | jq .checks",
		},
	},

	"deps": {
		description: "The endpoints RELIASTRA probes on this account.",
		usage:       "reliastra deps <list|show|add|rm> [arguments]",
		prints:      []string{"list  a table of dependencies with their interval and last observation"},
		notes:       []string{"A dependency is an HTTP endpoint plus what counts as a good response for it."},
		examples:    []string{"reliastra deps list", "reliastra deps show 4b2e1c9d"},
	},

	"deps list": {
		description: "List the dependencies being probed, with their most recent observation.",
		usage:       "reliastra deps list [--limit 100] [--web]",
		flags:       []flagDoc{
			{"--limit <n>", "Maximum rows. Default 100."},
			{"--web", "Print the console URL for each dependency."},
		},
		examples: []string{
			"reliastra deps list",
			`reliastra deps list --json | jq -r '.[] | "\(.name)\t\(.endpoint_url)"'`,
		},
	},

	"deps show": {
		description: "One dependency: configuration, recent observations, and its incident history.",
		usage:       "reliastra deps show <dependency-id> [--observations 20] [--web]",
		flags:       []flagDoc{
			{"--observations <n>", "How many recent observations to print. Default 10."},
			{"--web", "Also print the console URL for this dependency."},
		},
		examples: []string{
			"reliastra deps show 4b2e1c9d",
			"reliastra deps show 4b2e1c9d --observations 50 --json | jq .observations",
		},
	},

	"deps add": {
		description: "Start probing an endpoint.",
		usage:       "reliastra deps add <name> <url> [--interval 300] [--expect 200] [--method GET] [--timeout 10]",
		args:        []flagDoc{
			{"name", "A label you will recognise in a list."},
			{"url", "An http(s) URL. Private, loopback and metadata addresses are refused."},
		},
		flags: []flagDoc{
			{"--interval <seconds>", "Check interval. Default 300."},
			{"--expect <codes>", "Comma-separated expected status codes. Default 200."},
			{"--method <method>", "HTTP method. Default GET."},
			{"--timeout <seconds>", "Per-request deadline. Default 10, maximum 300."},
		},
		notes: []string{
			"The first observation appears on the next scheduled check, not immediately.",
		},
		examples: []string{
			`reliastra deps add "Payments API" https://api.example.com/health`,
			`reliastra deps add "Auth" https://auth.example.com/.well-known/jwks.json --interval 60 --expect 200`,
		},
	},

	"deps rm": {
		description: "Stop probing an endpoint. Observations already recorded are kept.",
		usage:       "reliastra deps rm <dependency-id> [--yes]",
		flags:       []flagDoc{{"--yes", "Skip the confirmation prompt (required when not a terminal)."}},
		examples:    []string{"reliastra deps rm 4b2e1c9d --yes"},
	},

	"checks": {
		description: "Raw observations, newest first.",
		usage:       "reliastra checks recent [--limit 50] [--dependency <id>]",
		prints:      []string{"One row per probe: when, from which region label, up or failed, latency, detail."},
		flags:       []flagDoc{
			{"--limit <n>", "Maximum rows. Default 50."},
			{"--dependency <id>", "Only observations for one dependency."},
		},
		notes: []string{
			"These are observations, not verdicts. A failed row is a fact about one probe; an",
			"incident is opened by the detector after consecutive failures and is reported by",
			"`reliastra incidents`.",
		},
		examples: []string{
			"reliastra checks recent",
			`reliastra checks recent --json | jq '[.[] | select(.is_up == false)] | length'`,
		},
	},

	"checks recent": {
		description: "Raw observations, newest first.",
		usage:       "reliastra checks recent [--limit 50] [--dependency <id>]",
		prints:      []string{"One row per probe: when, from which region label, up or failed, latency, detail."},
		flags:       []flagDoc{
			{"--limit <n>", "Maximum rows. Default 50."},
			{"--dependency <id>", "Only observations for one dependency."},
		},
		notes: []string{
			"These are observations, not verdicts. A failed row is a fact about one probe; an",
			"incident is opened by the detector after consecutive failures and is reported by",
			"`reliastra incidents`.",
		},
		examples: []string{
			"reliastra checks recent",
			`reliastra checks recent --json | jq '[.[] | select(.is_up == false)] | length'`,
		},
	},

	"incidents": {
		description: "Incidents the detector opened, and what happened in their windows.",
		usage:       "reliastra incidents <list|show|correlate> [arguments]",
		examples:    []string{"reliastra incidents list --status open", "reliastra incidents show 9f1c8b0e"},
	},

	"incidents list": {
		description: "Incidents, newest first.",
		usage:       "reliastra incidents list [--status open|resolved] [--limit 25] [--dependency <id>] [--web]",
		flags:       []flagDoc{
			{"--status <status>", "Filter by open or resolved."},
			{"--limit <n>", "Maximum rows. Default 25."},
			{"--dependency <id>", "Only incidents for one dependency."},
			{"--web", "Print the console URL for each incident."},
		},
		examples: []string{
			"reliastra incidents list --status open",
			`reliastra incidents list --json | jq -r ".[] | [.id, .severity, .started_at] | @tsv"`,
		},
	},

	"incidents show": {
		description: "One incident: window, severity, evidence record, and any correlated dependencies.",
		usage:       "reliastra incidents show <incident-id> [--web] [--json]",
		flags:       []flagDoc{
			{"--web", "Also print the console URL for this incident."},
			{"--evidence", "Fetch and print the evidence record for this incident, if one exists."},
		},
		notes: []string{
			"The detection rule that fired and the attribution verdict live inside the evidence",
			"record. `--evidence` follows that link for you; the record is also reachable with",
			"`reliastra evidence show <report-id>`.",
		},
		examples: []string{
			"reliastra incidents show 9f1c8b0e",
			"reliastra incidents show 9f1c8b0e --evidence",
			"reliastra incidents show 9f1c8b0e --json | jq .correlations",
		},
	},

	"incidents correlate": {
		description: "Align a dependency degradation with this incident window and score the overlap.",
		usage:       "reliastra incidents correlate <incident-id> [--json]",
		notes:       []string{
			"Deterministic and versioned: five weighted signals, published weights, and a",
			"methodology version on the result. A score is an alignment between two timelines -",
			"it is not a statement of cause, and the output says so.",
		},
	},

	"evidence": {
		description: "The compiled records RELIASTRA issues for resolved incidents.",
		usage:       "reliastra evidence <list|show|get> [arguments]",
		notes:       []string{
			"An evidence record is the artifact you hand to someone who was not in the room:",
			"the window, every observation in it, the detector’s rule, the attribution result,",
			"and the hashes that let a third party check none of it changed.",
			"`reliastra evidence show <id>` prints its verification URL, which needs no account.",
		},
		examples: []string{"reliastra evidence list", "reliastra evidence show 7c1d0a5f"},
	},

	"evidence list": {
		description: "Evidence records issued for this account, newest first.",
		usage:       "reliastra evidence list [--limit 50] [--web]",
		flags:       []flagDoc{
			{"--limit <n>", "Maximum rows. Default 50."},
			{"--web", "Print the console URL for each record."},
		},
		examples: []string{"reliastra evidence list", `reliastra evidence list --json | jq -r ".[].checksum"`},
	},

	"evidence show": {
		description: "One evidence record: window, size, document checksum, and how to verify it.",
		usage:       "reliastra evidence show <report-id> [--web] [--json]",
		flags:       []flagDoc{
			{"--web", "Also print the console URL for this record."},
			{"--payload", "Print the canonical payload hash and signature details too."},
		},
		prints: []string{
			"The public verification URL, which is the whole point of the record: it opens a page",
			"that re-checks the hashes without an account and without trusting the reader.",
		},
		examples: []string{
			"reliastra evidence show 7c1d0a5f",
			"reliastra evidence show 7c1d0a5f --json | jq -r .verification_url",
		},
	},

	"evidence get": {
		description: "Write the artifact (PDF) to a file, and print the hash of the bytes on disk.",
		usage:       "reliastra evidence get <report-id> [--out <path>]",
		flags:       []flagDoc{
			{"--out <path>", "Where to write it. Default reliastra-evidence-<id>.pdf."},
		},
		notes: []string{
			"The SHA-256 printed is computed from the file on disk, not echoed from the API.",
			"Comparing the two is the only way to know the transfer was faithful.",
		},
		examples: []string{
			"reliastra evidence get 7c1d0a5f --out incident-2026-09-14.pdf",
			"reliastra evidence get 7c1d0a5f | grep sha-256",
		},
	},

	"verify": {
		description: "Check a document against the public verification record. Needs no account.",
		usage:       "reliastra verify <verification-id> [--file <document.pdf>] [--expect-hash <sha256>] [--json]",
		args:        []flagDoc{
			{"verification-id", "The id printed in the artifact footer and encoded in its QR code."},
		},
		flags: []flagDoc{
			{"--file <path>", "Also hash this file and compare it with the recorded checksum."},
			{"--expect-hash <sha256>", "Assert the payload hash the record must carry."},
			{"--id <verification-id>", "Alternative to the positional argument."},
		},
		notes: []string{
			"Fails closed. A missing record, a changed file, an unreachable service and a hash",
			"mismatch all exit 4; only an exact match exits 0. That makes it usable directly as",
			"a gate in a pipeline, with no wrapper script.",
			"Unauthenticated on purpose: the scenario it serves is somebody who was handed a",
			"document and has no RELIASTRA account. No credential is read or sent, even when",
			"one is configured.",
		},
		examples: []string{
			"reliastra verify 8Kd2xQ7mB4pL",
			"reliastra verify 8Kd2xQ7mB4pL --file incident-2026-09-14.pdf",
			"reliastra verify 8Kd2xQ7mB4pL --json   # inspect .problems on failure",
		},
	},

	"keys": {
		description: "API keys for CI, scripts and other services.",
		usage:       "reliastra keys <list|create|rm> [arguments]",
		notes:       []string{
			"A key is scoped, independently revocable, and is not a session: it is never",
			"refreshed, and it is shown exactly once when created.",
		},
		examples: []string{
			"reliastra keys list",
			"reliastra keys create ci-deploy --scopes read:checks,read:incidents",
		},
	},

	"keys list": {
		description: "API keys for this account: names, scopes, and last use.",
		usage:       "reliastra keys list [--json]",
		prints:      []string{"One row per key. The secret itself is never shown again after creation."},
		examples:    []string{"reliastra keys list"},
	},

	"keys create": {
		description: "Issue an API key. The secret is printed once and never stored by us.",
		usage:       "reliastra keys create <name> [--scopes <list>]",
		flags:       []flagDoc{
			{"--name <name>", "The key name. Alternative to the positional argument."},
			{"--scopes <list>", "Comma-separated. Default read:checks, read:incidents, read:evidence, read:dependencies."},
		},
		notes: []string{
			"The full key is printed to stdout. Do not paste it into a shell profile or a",
			"committed file: put it in your CI secret store and expose it as RELIASTRA_TOKEN.",
		},
	},

	"keys rm": {
		description: "Revoke an API key immediately.",
		usage:       "reliastra keys rm <key-id> [--yes]",
	},

	"obs": {
		description: "The public observatory: the endpoints RELIASTRA probes on its own record.",
		usage:       "reliastra obs <list|show> [arguments]",
		notes:       []string{
			"Unauthenticated. These are not your dependencies and are never mixed with them;",
			"the public pipeline stores observations and opens no incidents. No credential is",
			"read or sent, even when one is configured.",
		},
		examples: []string{"reliastra obs list", "reliastra obs show openai"},
	},

	"obs list": {
		description: "The public vendor index: recent state per probe, no account needed.",
		usage:       "reliastra obs list [--limit 100] [--json]",
		flags:       []flagDoc{
			{"--limit <n>", "Maximum rows. Default 100."},
		},
		notes: []string{
			"Recent status is derived from the five most recent observations and is a statement",
			"about one probe, not vendor-wide health.",
		},
		examples: []string{"reliastra obs list"},
	},

	"obs show": {
		description: "One vendor record: endpoints, recent state, and the last observation.",
		usage:       "reliastra obs show <vendor> [--web] [--json]",
		flags:       []flagDoc{
			{"--vendor <name>", "The vendor name. Alternative to the positional argument."},
			{"--web", "Also print the public observatory URL for this vendor."},
		},
		examples: []string{
			"reliastra obs show openai",
			`reliastra obs show openai --json | jq ".endpoints[] | .endpoint_url"`,
		},
	},

	"open": {
		description: "Print - or open - the web page for a resource the CLI can identify.",
		usage:       "reliastra open <incident|evidence|verify|dependency|observatory|docs> [id]",
		args:        []flagDoc{
			{"incident <id>", "The console page where the incident window is charted."},
			{"evidence <id>", "The console page for one evidence record."},
			{"verify <id>", "The public verification page for a verification id. No account needed."},
			{"dependency <id>", "The console page for one dependency."},
			{"observatory [vendor]", "The public observatory, or one vendor’s record."},
			{"docs [slug]", "The documentation, or one guide."},
		},
		flags: []flagDoc{
			{"--browser", "Open it with the system browser instead of printing it."},
			{"--print", "Print it. This is the default and is correct for scripts and CI."},
		},
		notes: []string{
			"Printing is the default because a headless machine has no browser, and because a",
			"URL on stdout is what a pipeline can use. `--browser` is the convenience.",
		},
		examples: []string{
			"reliastra open verify 8Kd2xQ7mB4pL",
			"reliastra open incident 9f1c8b0e --browser",
			`open "$(reliastra open evidence 7c1d0a5f)"`,
		},
	},
}

// helpFor returns the help entry for a command, preferring the subcommand
// entry when one exists. A missing subcommand entry falls back to the
// command entry, so `checks recent --help` answers from `checks`.
func helpFor(command, subcommand string) *helpEntry {
	if command != "" && subcommand != "" {
		if entry, ok := helpEntries[command+" "+subcommand]; ok {
			copy := entry
			return &copy
		}
	}
	if command != "" {
		if entry, ok := helpEntries[command]; ok {
			copy := entry
			return &copy
		}
	}
	return nil
}

// fullUsage renders the top-level help: the command list, the global flags,
// the environment, the exit codes, and examples.
func fullUsage() string {
	lines := []string{
		"reliastra — observe external dependencies, and verify what they did",
		"",
		"Usage",
		"  reliastra <command> [subcommand] [args] [flags]",
		"  reliastra <command> --help          help for one command",
		"",
		"Commands",
		"  login                     Store a session on this machine",
		"  logout                    Revoke the session and remove it locally",
		"  whoami                    Show the account this invocation resolves to",
		"  doctor                    Check config, credential and API, and name the failure",
		"",
		"  deps list                 Dependencies being probed",
		"  deps show <id>            One dependency, its observations and its incidents",
		"  deps add <name> <url>     Start probing an endpoint",
		"  deps rm <id>              Stop probing an endpoint",
		"",
		"  checks recent             Observations, newest first",
		"",
		"  incidents list            Incidents, newest first",
		"  incidents show <id>       One incident: window, severity, correlations",
		"  incidents correlate <id>  Score a dependency's degradation against this window",
		"",
		"  evidence list             Evidence records issued for this account",
		"  evidence show <id>        One record: window, checksum, verification URL",
		"  evidence get <id>         Write the artifact to a file",
		"  verify <verification-id>  Check a document against the public record",
		"  keys list | create | rm   API keys for CI and other services",
		"",
		"  obs list | show <vendor>  The public observatory",
		"",
		"  open <kind> [id]          Print the web page for a resource",
		"",
		"Try",
		"  reliastra deps --help",
		"  reliastra evidence show --help",
		"  reliastra verify --help",
		"",
		"Flags",
	}
	lines = append(lines, formatTable(globalFlagsHelp)...)
	lines = append(lines, "", "Environment")
	lines = append(lines, formatTable(environmentHelp)...)
	lines = append(lines, "", "Exit codes")
	lines = append(lines, formatTable(exitCodesHelp)...)
	lines = append(lines,
		"",
		"Examples",
		"  reliastra login",
		`  reliastra deps add "Payments API" https://api.example.com/health --interval 60`,
		"  reliastra checks recent --limit 20",
		"  reliastra incidents list --status open --web",
		"  reliastra evidence show 7c1d0a5f            # prints the public verification URL",
		"  reliastra verify 8Kd2xQ7mB4pL --file incident.pdf   # exits 4 on mismatch",
		"  reliastra evidence list --json | jq -r '.[].checksum'",
	)
	return strings.Join(lines, "\n")
}
