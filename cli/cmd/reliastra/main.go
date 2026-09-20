// Command reliastra is the RELIASTRA command-line client: the endpoints
// being probed, what each probe recorded, what the detector concluded, the
// evidence record that follows, and the public verification of that record.
//
// Design rules, in order of importance. Every command that prints data
// supports `--json`, and the JSON is the API's own shape: scripts and
// humans get the same truth.
//
// Exit codes are meaningful, because the interesting use of this tool is
// inside a pipeline:
//
//	0  success
//	1  usage error, or invalid configuration
//	2  the API returned an error (validation, not found, upstream failure)
//	3  authentication is required, rejected, or expired
//	4  a verification claim did not hold
//	5  authenticated, but not permitted to do this
//	6  the API could not be reached at all
//
// `reliastra verify <id> --expect-hash <sha256>` therefore works as a CI
// gate without a wrapper script, and a pipeline can tell "the record does
// not match" (4) from "the network is down" (6) without parsing prose.
//
// Nothing is buffered silently and nothing is invented: a field the API did
// not return prints as `—`, never as `0`, `unknown`, or `null`.
//
// No dependencies. A monitoring client that cannot install on a build
// runner is not a monitoring client. This module uses the Go standard
// library only (see go.mod: it has no requirements).
//
// `--help` works everywhere, including mid-command
// (`reliastra evidence get --help`), and the text explains what the command
// prints, not only its flags.
//
// Standard output carries the answer and its synopsis: data, usage
// lines and the prose a command prints about its own result. Errors, fixes
// and prompts go to standard error, so a failing invocation never pollutes
// a pipeline with a half-answer.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
)

// version is the CLI version. Release builds override it with
// `go build -ldflags "-X main.version=1.2.3"`.
var version = "0.2.0"

// Exit codes. The numbers are the contract: pipelines branch on them.
const (
	exitOK         = 0
	exitUsage      = 1
	exitAPI        = 2
	exitAuth       = 3
	exitUnverified = 4
	exitDenied     = 5
	exitNetwork    = 6
	// exitInterrupt follows the shell convention for Ctrl+C (128 + SIGINT).
	exitInterrupt  = 130
)

// commandFunc runs one top-level command. The args are the positionals after
// the command name; the return value is the process exit code.
type commandFunc func(ctx *commandContext) int

// commandTable lists every top-level command. (The frontend docs test reads
// this table out of the source, so keep the `"name": handler,` shape.)
var commandTable = map[string]commandFunc{
	"login":     cmdLogin,
	"logout":    cmdLogout,
	"whoami":    cmdWhoami,
	"doctor":    cmdDoctor,
	"deps":      cmdDeps,
	"checks":    cmdChecks,
	"incidents": cmdIncidents,
	"evidence":  cmdEvidence,
	"verify":    cmdVerify,
	"keys":      cmdKeys,
	"obs":       cmdObs,
	"open":      cmdOpen,
}

// commandContext is everything a command needs: parsed input on the way in,
// resolved session and API client for the work.
type commandContext struct {
	flags   flagSet
	args    []string
	client  *apiClient
	session session
	env     map[string]string
}

/* ── Argument parsing ───────────────────────────────────────────────────── */

// booleanFlags never take a value. (Read by the frontend docs test; keep the
// `"name": true,` shape.)
var booleanFlags = map[string]bool{
	"json":        true,
	"help":        true,
	"version":     true,
	"quiet":       true,
	"no-persist":  true,
	"web":         true,
	"browser":     true,
	"yes":         true,
	"print":       true,
	"evidence":    true,
	"payload":     true,
	"print-token": true,
	// Accepted by the parser as a boolean for parity with the historic CLI;
	// no command takes it, so the flag validator still rejects it. Without
	// this entry `--follow <value>` would swallow the value instead of
	// leaving it positional.
	"follow":      true,
}

// flagSet holds the flags that were actually passed. A flag that was not
// passed is absent, which is how a command tells `--limit 0` from no
// `--limit` at all.
type flagSet struct {
	vals map[string]string
}

func newFlagSet() flagSet {
	return flagSet{vals: map[string]string{}}
}

// has reports whether the flag was passed, in any form.
func (f flagSet) has(name string) bool {
	_, ok := f.vals[name]
	return ok
}

// str returns the flag's value, or "" when it was not passed.
func (f flagSet) str(name string) string {
	return f.vals[name]
}

// boolean reports whether a boolean flag was passed and left enabled.
// `--flag=false` parses to "false" and reports false.
func (f flagSet) boolean(name string) bool {
	v, ok := f.vals[name]
	return ok && v != "false"
}

// camelCase converts a kebab-case flag name to its lookup key:
// `check-interval` becomes `checkInterval`. Only a lowercase letter after a
// dash is folded; anything else keeps the dash, exactly like the regular
// expression the previous parser used.
func camelCase(dashed string) string {
	var out strings.Builder
	upper := false
	for _, r := range dashed {
		if r == '-' {
			if upper {
				out.WriteByte('-')
			}
			upper = true
			continue
		}
		if upper && r >= 'a' && r <= 'z' {
			out.WriteByte(byte(r - ('a' - 'A')))
			upper = false
			continue
		}
		upper = false
		out.WriteRune(r)
	}
	if upper {
		out.WriteByte('-')
	}
	return out.String()
}

// dashed converts a lookup key back to flag form: `apiUrl` becomes `api-url`.
func dashed(camel string) string {
	var out strings.Builder
	for _, r := range camel {
		if r >= 'A' && r <= 'Z' {
			out.WriteByte('-')
			out.WriteString(strings.ToLower(string(r)))
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}

// parseArgs splits argv into positional arguments and flags.
//
// Deliberately minimal: `--flag value`, `--flag=value`, `-h`, `-v`, and `--`
// to end flag parsing. Two failures are usage errors rather than guesses: a
// value flag with no value, and an empty `--flag=`. A typo'd flag that
// silently does nothing is how a script ends up asserting the wrong thing,
// and a missing value that silently becomes `true` once sent `limit=true`
// to the API.
func parseArgs(argv []string) ([]string, flagSet, error) {
	positionals := []string{}
	flags := newFlagSet()
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		if arg == "--" {
			positionals = append(positionals, argv[i+1:]...)
			break
		}
		if strings.HasPrefix(arg, "--") {
			name, inline, hasInline := strings.Cut(arg[2:], "=")
			key := camelCase(name)
			if hasInline {
				if booleanFlags[name] {
					// `--json=false` disables; anything else is a typo.
					switch strings.ToLower(inline) {
					case "true", "1":
						flags.vals[key] = "true"
					case "false", "0":
						flags.vals[key] = "false"
					default:
						return nil, flags, fmt.Errorf("flag --%s takes no value (did you mean --%s=false?)", name, name)
					}
				} else {
					if inline == "" {
						return nil, flags, fmt.Errorf("flag --%s needs a value", name)
					}
					flags.vals[key] = inline
				}
				continue
			}
			if booleanFlags[name] {
				flags.vals[key] = "true"
				continue
			}
			next := ""
			hasNext := i+1 < len(argv)
			if hasNext {
				next = argv[i+1]
			}
			if !hasNext || strings.HasPrefix(next, "--") {
				return nil, flags, fmt.Errorf("flag --%s needs a value", name)
			}
			flags.vals[key] = next
			i++
			continue
		}
		if arg == "-h" {
			flags.vals["help"] = "true"
			continue
		}
		if arg == "-v" {
			flags.vals["version"] = "true"
			continue
		}
		positionals = append(positionals, arg)
	}
	return positionals, flags, nil
}

/* ── Flag tables ─────────────────────────────────────────────────────────────── */

// globalFlags are accepted by every command.
var globalFlags = []string{"json", "help", "version", "quiet", "apiUrl", "siteUrl", "token", "noPersist"}

// commandFlags is the closed set of flags each command understands. Anything
// else is a usage error.
//
// A closed set is what makes "you typed `--interva`" a message instead of a
// silently ignored argument; the cost is that this table has to be updated
// alongside the commands, which the test suite enforces by checking every
// flag documented in help.go against it. The set is per command, not per
// subcommand: a flag that only fits one subcommand is accepted and ignored
// by its siblings, the way the previous parser behaved.
var commandFlags = map[string][]string{
	"login":     {"email", "token", "printToken"},
	"logout":    {},
	"whoami":    {},
	"doctor":    {},
	"deps":      {"limit", "observations", "interval", "expect", "method", "timeout", "region", "web", "yes"},
	"checks":    {"limit", "dependency"},
	"incidents": {"limit", "status", "web", "evidence", "dependency"},
	"evidence":  {"limit", "out", "web", "payload"},
	"verify":    {"id", "file", "expectHash"},
	"keys":      {"name", "scopes", "yes"},
	"obs":       {"limit", "vendor", "web"},
	"open":      {"browser", "print"},
}

// allowedFlags returns the flag keys accepted for an invocation: the globals,
// the command's own table, and any `"command subcommand"` extension entries.
func allowedFlags(command, sub string) map[string]bool {
	allowed := map[string]bool{}
	for _, key := range globalFlags {
		allowed[key] = true
	}
	for _, key := range commandFlags[command] {
		allowed[key] = true
	}
	for _, key := range commandFlags[command+" "+sub] {
		allowed[key] = true
	}
	return allowed
}

/* ── Suggestions ────────────────────────────────────────────────────────── */

// levenshtein is the edit distance, small and local: only used for suggestions.
func levenshtein(a, b string) int {
	rows := make([][]int, len(a)+1)
	for i := range rows {
		rows[i] = make([]int, len(b)+1)
		rows[i][0] = i
	}
	for j := 0; j <= len(b); j++ {
		rows[0][j] = j
	}
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			cost := 0
			if a[i-1] != b[j-1] {
				cost = 1
			}
			rows[i][j] = min3(rows[i-1][j]+1, rows[i][j-1]+1, rows[i-1][j-1]+cost)
		}
	}
	return rows[len(a)][len(b)]
}

func min3(a, b, c int) int {
	if a > b {
		a = b
	}
	if a > c {
		a = c
	}
	return a
}

// suggest returns the closest known name, when it is close enough to be a
// typo rather than a guess.
func suggest(input string, candidates []string) string {
	best := ""
	bestDistance := -1
	for _, candidate := range candidates {
		d := levenshtein(input, candidate)
		if bestDistance == -1 || d < bestDistance {
			best, bestDistance = candidate, d
		}
	}
	if best == "" {
		return ""
	}
	limit := 2
	if len(input) <= 5 {
		limit = 1
	}
	if bestDistance <= limit {
		return best
	}
	return ""
}

/* ── Entry point ────────────────────────────────────────────────────────── */

func versionString() string {
	return version
}

// runCLI is the testable entry point: it runs argv against env and returns
// the process exit code. Output goes through the replaceable sinks in
// output.go so tests capture it without touching the real streams.
func runCLI(argv []string, env map[string]string) int {
	positionals, flags, err := parseArgs(argv)
	if err != nil {
		writeError(err.Error())
		if len(positionals) > 0 {
			if _, known := commandTable[positionals[0]]; known {
				writeError(fmt.Sprintf("\nRun `reliastra %s --help` for the flags this command takes.", positionals[0]))
			} else {
				writeError("\nRun `reliastra --help` for the command list.")
			}
		} else {
			writeError("\nRun `reliastra --help` for the command list.")
		}
		return exitUsage
	}

	if flags.boolean("version") {
		write(versionString())
		return exitOK
	}

	if len(positionals) == 0 {
		if flags.boolean("help") {
			write(fullUsage())
			return exitOK
		}
		write(fullUsage())
		return exitUsage
	}
	name := positionals[0]
	rest := positionals[1:]
	if name == "help" {
		write(fullUsage())
		return exitOK
	}

	command, known := commandTable[name]
	if !known {
		candidates := make([]string, 0, len(commandTable))
		for candidate := range commandTable {
			candidates = append(candidates, candidate)
		}
		sort.Strings(candidates)
		writeError(fmt.Sprintf("unknown command: %s", name))
		if guess := suggest(name, candidates); guess != "" {
			writeError(fmt.Sprintf("did you mean `reliastra %s`?", guess))
		}
		writeError("\nRun `reliastra --help` for the command list.")
		return exitUsage
	}

	// Reject unknown flags before doing anything with them. Global flags are
	// always accepted; the rest come from the subcommand's own table.
	subcommand := ""
	if len(rest) > 0 {
		subcommand = rest[0]
	}
	allowed := allowedFlags(name, subcommand)
	unknown := []string{}
	for key := range flags.vals {
		if !allowed[key] {
			unknown = append(unknown, key)
		}
	}
	sort.Strings(unknown)
	if len(unknown) > 0 {
		rendered := make([]string, len(unknown))
		for i, key := range unknown {
			rendered[i] = "--" + dashed(key)
		}
		word := "unknown flag"
		if len(rendered) > 1 {
			word = "unknown flags"
		}
		writeError(fmt.Sprintf("%s for `%s`: %s", word, name, strings.Join(rendered, ", ")))
		known := []string{}
		for key := range allowed {
			known = append(known, dashed(key))
		}
		sort.Strings(known)
		if guess := suggest(dashed(unknown[0]), known); guess != "" {
			writeError(fmt.Sprintf("did you mean `--%s`?", guess))
		}
		writeError(fmt.Sprintf("\nRun `reliastra %s --help` for the flags this command takes.", name))
		return exitUsage
	}

	if flags.boolean("help") {
		return helpOrError(name, subcommand)
	}

	session := resolveSession(flags, env)
	client := newClient(session.apiURL, session.token, env, !flags.boolean("noPersist"))
	if session.source == "config" {
		// Only a stored session carries a refresh token. A flag or
		// environment credential refreshes nothing: falling back to a
		// stored session's refresh token would silently run the invocation
		// as a different credential than the one it was given.
		client.refreshToken = session.config.RefreshToken
	}

	ctx := &commandContext{
		flags:   flags,
		args:    rest,
		client:  client,
		session: session,
		env:     env,
	}
	if code := command(ctx); code != exitOK {
		return code
	}
	return exitOK
}

// helpOrError prints `--help` for a command, or the usage error that names
// what was not understood.
func helpOrError(command, subcommand string) int {
	if entry := helpFor(command, subcommand); entry != nil {
		write(formatBody(*entry))
		return exitOK
	}
	// A command exists but the subcommand does not: `reliastra evidence frobnicate`.
	if parent := helpFor(command, ""); parent != nil && subcommand != "" {
		candidates := []string{}
		for key := range helpEntries {
			if strings.HasPrefix(key, command+" ") {
				candidates = append(candidates, strings.TrimPrefix(key, command+" "))
			}
		}
		sort.Strings(candidates)
		writeError(fmt.Sprintf("unknown subcommand: %s %s", command, subcommand))
		if guess := suggest(subcommand, candidates); guess != "" {
			writeError(fmt.Sprintf("did you mean `reliastra %s %s`?", command, guess))
		}
		writeError(fmt.Sprintf("\nRun `reliastra %s --help` for the subcommands.", command))
		return exitUsage
	}
	return exitOK
}

// unknownSubcommand is the shared handler for the command functions: the
// subcommand is not one this command implements. The form line goes to
// stdout, where a caller can capture the shape of the command; the error and
// the pointer to the full help go to stderr.
func unknownSubcommand(command, sub, form string) int {
	writeError(fmt.Sprintf("unknown subcommand: %s %s", command, sub))
	write(fmt.Sprintf("  %s", form))
	writeError(fmt.Sprintf("run `reliastra %s --help` for the full form.", command))
	return exitUsage
}

// reportError turns a thrown error into one actionable message and the right exit code.
//
// The taxonomy is the point: authentication, permission, a missing resource, a
// validation failure, the network and an unexpected API fault are six different
// situations, and an operator (or a pipeline) needs to be able to tell them
// apart without reading the prose. No stack traces are printed - a stack from
// this tool describes our code, not the caller's problem.
func reportError(err error) int {
	status := apiErrStatus(err)

	// 403 before 401: a permission failure is not an authentication failure. The
	// API answers both with an auth-shaped error as far as transport is
	// concerned, but conflating them sends an operator to `reliastra login`
	// when their key simply lacks a scope - a fix that cannot work.
	if status == 403 {
		writeError(fmt.Sprintf("not permitted: %s", err.Error()))
		writeError("this credential is valid but not permitted to make this call. If it is an API key, reissue it with the scope in the message: `reliastra keys create <name> --scopes <list>`; `reliastra keys list` shows what it carries now.")
		return exitDenied
	}

	if isAuthError(err) || status == 401 {
		writeError(fmt.Sprintf("authentication required: %s", err.Error()))
		writeError("the credential was rejected or has expired. Run `reliastra login`, or set RELIASTRA_TOKEN for this invocation.")
		return exitAuth
	}

	if isNetworkError(err) {
		writeError(err.Error())
		writeError("the API could not be reached. Check the connection, then `reliastra doctor`; a self-hosted API needs --api-url or RELIASTRA_API_URL.")
		return exitNetwork
	}

	if status == 404 {
		writeError(fmt.Sprintf("not found: %s", err.Error()))
		writeError("nothing exists under that id for this account. Ids are scoped to the account that owns them, so a valid id from elsewhere reads the same way.")
		return exitAPI
	}

	if status == 422 || status == 400 {
		writeError(fmt.Sprintf("invalid request: %s", err.Error()))
		writeError("run `reliastra --help` for the accepted form, or `reliastra doctor` to check the configuration.")
		return exitAPI
	}

	if apiErr, ok := asAPIError(err); ok {
		suffix := ""
		if apiErr.requestID != "" {
			suffix = fmt.Sprintf(" (request id %s)", apiErr.requestID)
		}
		writeError(fmt.Sprintf("request failed: %s%s", apiErr.message, suffix))
		if apiErr.status == 429 {
			writeError("the API is rate limiting this credential; retry after the window in the Retry-After header.")
		} else if apiErr.status >= 500 {
			writeError(fmt.Sprintf("the API returned %d; this is not a problem with your invocation. Check the status page.", apiErr.status))
		}
		return exitAPI
	}

	writeError(err.Error())
	return exitAPI
}

// loadEnv snapshots the process environment into a map.
func loadEnv() map[string]string {
	env := map[string]string{}
	for _, kv := range os.Environ() {
		key, value, _ := strings.Cut(kv, "=")
		env[key] = value
	}
	return env
}

func main() {
	// Ctrl+C exits 130 by the shell convention, after restoring the terminal
	// when a secret prompt left echo disabled.
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt)
	go func() {
		<-signals
		restoreTerminalEcho()
		os.Exit(exitInterrupt)
	}()
	os.Exit(runCLI(os.Args[1:], loadEnv()))
}
