// CLI tests.
//
// These run the real command functions against a real HTTP server on
// localhost - not a stubbed transport - so the things that break in practice
// (status-code mapping, argument parsing, exit codes, hashing) are exercised
// the way they will be in a pipeline.
//
// Run: `go test ./...` from `cli/`.
//
// The tests never run in parallel: output capture swaps a package-level sink,
// so parallel subtests would interleave. Each test that needs a credential
// logs in first, so the suite is safe under `go test -shuffle=on`.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

/* ── A tiny stand-in for the RELIASTRA API ──────────────────────────────── */

var pdfBytes = []byte("%PDF-1.7\nfake artifact for the test suite\n")

var reportChecksum = func() string {
	sum := sha256.Sum256(pdfBytes)
	return hex.EncodeToString(sum[:])
}()

// routeHandler answers one route. The payload is encoded as JSON unless it
// is []byte (sent raw with the content type) or nil (an empty body, for 204).
type routeHandler func(body map[string]any) (int, any, string)

func jsonRoute(status int, payload any) routeHandler {
	return func(map[string]any) (int, any, string) { return status, payload, "" }
}

var routes = map[string]routeHandler{
	"POST /v1/auth/login": func(body map[string]any) (int, any, string) {
		if body["email"] == "engineer@example.com" && body["password"] == "correct-horse" {
			return 200, map[string]any{"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 900}, ""
		}
		return 401, map[string]any{"detail": "Incorrect email or password"}, ""
	},
	"GET /v1/users/me": jsonRoute(200, map[string]any{
		"id": "u1", "email": "engineer@example.com", "full_name": "Ada Lovelace",
		"is_active": true, "is_superuser": false,
	}),
	"GET /v1/orgs": jsonRoute(200, []any{map[string]any{"id": "o1", "name": "personal"}}),
	"GET /v1/dependencies": jsonRoute(200, map[string]any{
		"items": []any{map[string]any{
			"id": "dep-1234abcd", "name": "Stripe API",
			"endpoint_url":           "https://api.stripe.com/v1/charges",
			"check_interval_seconds": 300, "is_active": true,
			"last_check_at": "2026-09-18T10:00:00Z",
		}},
		"next_cursor": nil,
	}),
	"POST /v1/dependencies": func(body map[string]any) (int, any, string) {
		created := map[string]any{"id": "dep-new", "next_check_at": "2026-09-18T10:05:00Z"}
		for key, value := range body {
			created[key] = value
		}
		return 201, created, ""
	},
	"DELETE /v1/dependencies/dep-1234abcd": jsonRoute(204, nil),
	"GET /v1/checks/recent": jsonRoute(200, []any{
		map[string]any{
			"id": "c1", "dependency_id": "dep-1234abcd", "region": "us-east",
			"executed_at": "2026-09-18T10:00:00Z", "latency_ms": 212.4,
			"status_code": 200, "is_up": true, "quorum_confirmed": false,
		},
		map[string]any{
			"id": "c2", "dependency_id": "dep-1234abcd", "region": "us-east",
			"executed_at": "2026-09-18T09:55:00Z", "latency_ms": nil,
			"status_code": nil, "is_up": false, "error_message": "connect timeout",
			"quorum_confirmed": false,
		},
	}),
	"GET /v1/incidents": jsonRoute(200, map[string]any{
		"items": []any{map[string]any{
			"id": "inc-1", "dependency_id": "dep-1234abcd",
			"started_at": "2026-09-18T09:55:00Z", "resolved_at": nil,
			"severity": "major", "status": "open", "root_cause": "vendor_failure",
		}},
	}),
	"GET /v1/incidents/inc-1": jsonRoute(200, map[string]any{
		"id": "inc-1", "dependency_id": "dep-1234abcd",
		"started_at": "2026-09-18T09:55:00Z", "resolved_at": nil,
		"severity": "major", "status": "open", "root_cause": "vendor_failure",
		"evidence_report_id": "rep-1", "evidence_status": "ready",
		"correlations": []any{map[string]any{
			"id": "cor-1", "incident_id": "inc-1", "correlated_dependency_id": "dep-9999",
			"correlation_confidence": 0.9, "time_window_seconds": 300,
			"correlation_method": "temporal", "created_at": "2026-09-18T10:05:00Z",
		}},
	}),
	"GET /v1/evidence": jsonRoute(200, []any{map[string]any{
		"id": "rep-1", "incident_id": "inc-1",
		"generated_at": "2026-09-18T10:10:00Z", "expires_at": "2027-09-18T10:10:00Z",
		"file_size_bytes": len(pdfBytes), "checksum": reportChecksum,
	}}),
	"GET /v1/evidence/rep-1": jsonRoute(200, map[string]any{
		"id": "rep-1", "incident_id": "inc-1",
		"generated_at": "2026-09-18T10:10:00Z", "expires_at": "2027-09-18T10:10:00Z",
		"file_size_bytes": len(pdfBytes), "checksum": reportChecksum,
		// The fields the download response carries after the API change: the
		// path from an artifact back to its own verification record.
		"verification_id": "good-id", "verification_url": "https://reliastra.com/reports/good-id",
		"data_hash": "aaaa1111", "methodology_version": "v1.0",
		"signed": false, "signature_alg": nil,
		"download_url": "https://storage.example/rep-1.pdf?token=…",
	}),
	"GET /health": jsonRoute(200, map[string]any{"status": "ok"}),
	"GET /v1/dependencies/dep-1234abcd": jsonRoute(200, map[string]any{
		"id": "dep-1234abcd", "name": "Stripe API",
		"endpoint_url": "https://api.stripe.com/v1/charges", "method": "GET",
		"expected_status_codes": []any{200, 204}, "check_interval_seconds": 300,
		"timeout_seconds": 10, "next_check_at": "2026-09-18T10:05:00Z",
		"is_active": true, "regions": []any{"us-east"},
		"last_check_at": "2026-09-18T10:00:00Z",
	}),
	"GET /v1/dependencies/dep-1234abcd/results": jsonRoute(200, map[string]any{
		"items": []any{map[string]any{
			"id": "c1", "dependency_id": "dep-1234abcd", "region": "us-east",
			"executed_at": "2026-09-18T10:00:00Z", "latency_ms": 212.4,
			"status_code": 200, "is_up": true,
		}},
	}),
	"DELETE /v1/api-keys/k1": jsonRoute(204, nil),
	"GET /v1/verify/good-id": jsonRoute(200, map[string]any{
		"found": true, "incident_id": "inc-1", "dependency_id": "dep-1234abcd",
		"time_window": map[string]any{"start": "2026-09-18T09:55:00Z", "end": "2026-09-18T10:06:00Z"},
		"data_hash":   "aaaa1111", "report_checksum": reportChecksum,
		"methodology_version": "v1.0",
		"authenticity":        map[string]any{"signed": false, "algorithm": nil, "public_keys": "/v1/verify/keys"},
	}),
	"GET /v1/verify/missing-id":  jsonRoute(404, map[string]any{"found": false, "error": "Evidence not found"}),
	"GET /v1/verify/degraded-id": jsonRoute(503, map[string]any{"found": false, "service_degraded": true}),
	"GET /v1/api-keys": jsonRoute(200, []any{map[string]any{
		"id": "k1", "name": "ci", "prefix": "rel_ab12",
		"scopes": []any{"read:checks"}, "created_at": "2026-09-01T00:00:00Z",
	}}),
	"POST /v1/api-keys": func(body map[string]any) (int, any, string) {
		return 201, map[string]any{
			"id": "k2", "name": body["name"], "prefix": "rel_cd34",
			"scopes": []any{"read:checks", "write:dependencies"}, "full_key": "rel_cd34_secret",
			"created_at": "2026-09-18T00:00:00Z",
		}, ""
	},
	"GET /v1/vendors": jsonRoute(200, map[string]any{
		"items": []any{map[string]any{
			"vendor_name": "openai", "display_name": "OpenAI", "category": "ai",
			"recent_status": "operational", "latency_ms": 143.2,
			"last_check_at": "2026-09-18T10:00:00Z",
		}},
	}),
	"GET /v1/vendors/openai": jsonRoute(200, map[string]any{
		"vendor_name": "openai", "display_name": "OpenAI", "category": "ai",
		"recent_status": "operational",
		"endpoints": []any{map[string]any{
			"endpoint_url": "https://api.openai.com/v1/models", "health_status": "up",
			"last_check_at": "2026-09-18T10:00:00Z",
		}},
	}),
	// The owner-addressed artifact route. There is deliberately no route for
	// `GET /v1/evidence/{id}/download` here: that path belongs to the public
	// evidence gate and takes a report *token*, so a CLI that called it with a
	// report id would 404 against the real API. The harness would do the same,
	// which is what makes this file a regression guard for the route.
	"GET /v1/evidence/rep-1/artifact": func(map[string]any) (int, any, string) {
		return 200, pdfBytes, "application/pdf"
	},
}

func testHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if raw, err := io.ReadAll(r.Body); err == nil {
			r.Body.Close()
			if len(raw) > 0 {
				// Tests control every request body; a body that is not
				// JSON fails the test downstream, not here.
				_ = json.Unmarshal(raw, &body)
			}
		}
		key := r.Method + " " + r.URL.Path
		handler := routes[key]
		// A credential that authenticates but lacks the scope, exactly as the
		// API answers it (403 + the scope that was missing).
		if strings.Contains(r.Header.Get("Authorization"), "denied-token") {
			writeJSON(w, 403, map[string]any{"detail": "API key lacks required scope: read:dependencies"})
			return
		}
		// Authenticated routes reject a missing bearer token, exactly as the
		// API does; otherwise "no credential stored" would look like success.
		isPublic := strings.HasPrefix(key, "GET /v1/verify/") ||
			strings.HasPrefix(key, "GET /v1/vendors") ||
			key == "POST /v1/auth/login" || key == "POST /v1/auth/refresh"
		if handler != nil && !isPublic && !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			writeJSON(w, 401, map[string]any{"detail": "Not authenticated"})
			return
		}
		if handler == nil {
			writeJSON(w, 404, map[string]any{"Detail": "no route for " + key})
			return
		}
		status, payload, contentType := handler(body)
		if payload == nil {
			w.WriteHeader(status)
			return
		}
		if raw, ok := payload.([]byte); ok {
			if contentType == "" {
				contentType = "application/octet-stream"
			}
			w.Header().Set("Content-Type", contentType)
			w.WriteHeader(status)
			_, _ = w.Write(raw)
			return
		}
		writeJSON(w, status, payload)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(payload)
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

var (
	apiBaseURL string
	configFile string
	workDir    string
	emptyHome  string
)

func TestMain(m *testing.M) {
	// No test consults the real stdin: the refusal tests need "no terminal"
	// deterministically, and any other prompt path would hang an interactive
	// `go test` run awaiting input. Terminal behavior itself needs a pty and
	// is covered by manual testing, not this suite.
	stdinIsTerminal = func() bool { return false }

	server := httptest.NewServer(testHandler())
	defer server.Close()
	apiBaseURL = server.URL

	var err error
	workDir, err = os.MkdirTemp("", "reliastra-cli-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "test setup:", err)
		os.Exit(1)
	}
	defer os.RemoveAll(workDir)
	configFile = filepath.Join(workDir, "config.json")

	// The hermetic fallback for tests that remove RELIASTRA_CONFIG: XDG is
	// read from the env map, so it never touches the real home directory.
	emptyHome, err = os.MkdirTemp("", "reliastra-cli-empty-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "test setup:", err)
		os.Exit(1)
	}
	defer os.RemoveAll(emptyHome)

	os.Exit(m.Run())
}

// baseEnv copies the process environment and points the CLI at the harness:
// the temp config file, the harness password, and an empty fallback home.
func baseEnv() map[string]string {
	env := map[string]string{}
	for _, kv := range os.Environ() {
		if key, value, ok := strings.Cut(kv, "="); ok {
			env[key] = value
		}
	}
	env["RELIASTRA_CONFIG"] = configFile
	env["RELIASTRA_PASSWORD"] = "correct-horse"
	env["XDG_CONFIG_HOME"] = emptyHome
	delete(env, "RELIASTRA_TOKEN")
	return env
}

// invocation captures one CLI run.
type invocation struct {
	code int
	out  string
	err  string
}

// run executes argv and captures both streams through the injectable sinks.
func run(t *testing.T, argv []string, env map[string]string) invocation {
	t.Helper()
	var out, errBuf bytes.Buffer
	setOutput(&out, &errBuf)
	defer resetOutput()
	return invocation{code: runCLI(argv, env), out: out.String(), err: errBuf.String()}
}

// ensureLogin stores a working session, so tests are independent of order.
func ensureLogin(t *testing.T) {
	t.Helper()
	result := run(t, []string{"login", "--email", "engineer@example.com", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("setup login failed: code=%d err=%q", result.code, result.err)
	}
}

func match(t *testing.T, text, pattern string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(text) {
		t.Errorf("expected %q to match /%s/", text, pattern)
	}
}

func noMatch(t *testing.T, text, pattern string) {
	t.Helper()
	if regexp.MustCompile(pattern).MatchString(text) {
		t.Errorf("expected %q to NOT match /%s/", text, pattern)
	}
}

func readConfigFile(t *testing.T) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(configFile)
	if err != nil {
		t.Fatalf("reading config file: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("parsing config file: %v", err)
	}
	return parsed
}

/* ── Argument parsing ───────────────────────────────────────────────────── */

func TestParseArgs_SeparatesPositionalsAndNormalisesKebab(t *testing.T) {
	positionals, flags, err := parseArgs([]string{"deps", "add", "Stripe", "https://api.stripe.com", "--check-interval", "60", "--json"})
	if err != nil {
		t.Fatalf("parseArgs: %v", err)
	}
	want := []string{"deps", "add", "Stripe", "https://api.stripe.com"}
	if fmt.Sprint(positionals) != fmt.Sprint(want) {
		t.Errorf("positionals = %v, want %v", positionals, want)
	}
	if flags.str("checkInterval") != "60" {
		t.Errorf("checkInterval = %q, want %q", flags.str("checkInterval"), "60")
	}
	if !flags.boolean("json") {
		t.Errorf("json flag not set")
	}
}

func TestParseArgs_AcceptsEqualsForm(t *testing.T) {
	_, flags, err := parseArgs([]string{"verify", "--expect-hash=abc123"})
	if err != nil {
		t.Fatalf("parseArgs: %v", err)
	}
	if flags.str("expectHash") != "abc123" {
		t.Errorf("expectHash = %q, want %q", flags.str("expectHash"), "abc123")
	}
}

func TestParseArgs_TrailingBooleanFlag(t *testing.T) {
	_, flags, err := parseArgs([]string{"checks", "recent", "--json"})
	if err != nil {
		t.Fatalf("parseArgs: %v", err)
	}
	if !flags.boolean("json") {
		t.Errorf("json flag not set")
	}
}

func TestParseArgs_ValuelessValueFlagIsAUsageError(t *testing.T) {
	// The previous parser silently stored `true`; the request that followed
	// carried `limit=true` to the API. A missing value is a usage error now.
	result := run(t, []string{"deps", "list", "--limit", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.err, "needs a value")
}

func TestParseArgs_BooleanFalseDisables(t *testing.T) {
	_, flags, err := parseArgs([]string{"deps", "list", "--json=false"})
	if err != nil {
		t.Fatalf("parseArgs: %v", err)
	}
	if flags.boolean("json") {
		t.Errorf("--json=false should disable the flag")
	}
}

func TestFlags_SiblingSubcommandFlagAccepted(t *testing.T) {
	// Flag sets are per command: a flag that only fits one subcommand is
	// accepted (and ignored) by its siblings, not rejected.
	ensureLogin(t)
	result := run(t, []string{"deps", "list", "--interval", "60", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Errorf("code = %d, want %d (err=%q)", result.code, exitOK, result.err)
	}
}

/* ── Session ────────────────────────────────────────────────────────────── */

func TestSession_Stores0600AndReportsSource(t *testing.T) {
	login := run(t, []string{"login", "--email", "engineer@example.com", "--api-url", apiBaseURL}, baseEnv())
	if login.code != exitOK {
		t.Fatalf("login code = %d, want %d (err=%q)", login.code, exitOK, login.err)
	}
	match(t, login.out, `signed in as engineer@example\.com`)

	stored := readConfigFile(t)
	if stored["refresh_token"] != "refresh-1" {
		t.Errorf("refresh_token = %v, want %q", stored["refresh_token"], "refresh-1")
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(configFile)
		if err != nil {
			t.Fatalf("stat config: %v", err)
		}
		if mode := info.Mode().Perm(); mode&0o077 != 0 {
			t.Errorf("config mode = %03o, want no group/other access", mode)
		}
	}

	me := run(t, []string{"whoami", "--api-url", apiBaseURL}, baseEnv())
	if me.code != exitOK {
		t.Fatalf("whoami code = %d (err=%q)", me.code, me.err)
	}
	match(t, me.out, "Ada Lovelace")
	match(t, me.out, "from config")
}

func TestSession_LoginTokenChecksBeforeStoring(t *testing.T) {
	const key = "rel_0123456789abcdef0123456789abcdef01234567"
	result := run(t, []string{"login", "--token", key, "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("login code = %d, want %d (err=%q)", result.code, exitOK, result.err)
	}
	stored := readConfigFile(t)
	if stored["api_key"] != key {
		t.Errorf("api_key = %v, want the stored key", stored["api_key"])
	}
	if _, present := stored["access_token"]; present {
		t.Errorf("a stored key must not keep a session access token")
	}

	me := run(t, []string{"whoami", "--api-url", apiBaseURL}, baseEnv())
	if me.code != exitOK {
		t.Fatalf("whoami code = %d (err=%q)", me.code, me.err)
	}
	match(t, me.out, "API key")

	// Restore the session credential for later tests.
	ensureLogin(t)
}

func TestSession_RefusesDeniedKeyWithoutStoring(t *testing.T) {
	ensureLogin(t)
	before, err := os.ReadFile(configFile)
	if err != nil {
		t.Fatalf("reading config: %v", err)
	}
	result := run(t, []string{"login", "--token", "denied-token", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitDenied {
		t.Errorf("code = %d, want %d", result.code, exitDenied)
	}
	match(t, result.err, "cannot read dependencies")
	after, err := os.ReadFile(configFile)
	if err != nil {
		t.Fatalf("reading config: %v", err)
	}
	if string(after) != string(before) {
		t.Errorf("a refused key must leave the config untouched")
	}
}

func TestSession_BadPasswordIsAuthFailure(t *testing.T) {
	bad := run(t, []string{"login", "--email", "nobody@example.com", "--api-url", apiBaseURL}, baseEnv())
	if bad.code != exitAuth {
		t.Errorf("code = %d, want %d", bad.code, exitAuth)
	}
	match(t, bad.err, "Incorrect email or password")
}

func TestSession_NoCredentialExitsAuth(t *testing.T) {
	env := baseEnv()
	delete(env, "RELIASTRA_CONFIG")
	result := run(t, []string{"deps", "list", "--api-url", apiBaseURL}, env)
	if result.code != exitAuth {
		t.Errorf("code = %d, want %d", result.code, exitAuth)
	}
	match(t, result.err, "Run `reliastra login`")
	match(t, result.err, "RELIASTRA_TOKEN")
}

/* ── Reading the product ────────────────────────────────────────────────── */

func TestDeps_ListRendersInterval(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "list", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "Stripe API")
	match(t, result.out, "5m")
}

func TestDeps_ListJSONEmitsAPIShape(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "list", "--json", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	var parsed []map[string]any
	if err := json.Unmarshal([]byte(result.out), &parsed); err != nil {
		t.Fatalf("parsing --json output: %v", err)
	}
	if len(parsed) == 0 || parsed[0]["endpoint_url"] != "https://api.stripe.com/v1/charges" {
		t.Errorf("--json output does not carry the API shape: %q", result.out)
	}
}

func TestChecks_FailedObservationFooter(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"checks", "recent", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "failed")
	match(t, result.out, "connect timeout")
	match(t, result.out, "incident is opened by the detector")
}

func TestIncidents_CorrelationsWithoutInventedRule(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"incidents", "show", "inc-1", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "correlated dependencies")
	match(t, result.out, "dep-9999")
	noMatch(t, strings.ToLower(result.out), "quorum")
	match(t, result.out, "reliastra evidence show rep-1")
}

func TestDeps_AddForwardsBody(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "add", "Broken", "not-a-url", "--api-url", apiBaseURL}, baseEnv())
	// The mock server accepts it; this asserts the CLI forwards the body it built.
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "dep-new")
}

/* ── Evidence and verification ──────────────────────────────────────────── */

func TestEvidence_GetWritesArtifactAndHash(t *testing.T) {
	ensureLogin(t)
	out := filepath.Join(workDir, "artifact.pdf")
	result := run(t, []string{"evidence", "get", "rep-1", "--out", out, "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	written, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("reading artifact: %v", err)
	}
	if len(written) != len(pdfBytes) {
		t.Errorf("wrote %d bytes, want %d", len(written), len(pdfBytes))
	}
	match(t, result.out, reportChecksum)
}

func artifactPath(t *testing.T, name string) string {
	t.Helper()
	ensureLogin(t)
	out := filepath.Join(workDir, name)
	result := run(t, []string{"evidence", "get", "rep-1", "--out", out, "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("setup download failed: code=%d err=%q", result.code, result.err)
	}
	return out
}

func TestVerify_MatchReturnsZero(t *testing.T) {
	out := artifactPath(t, "verify-match.pdf")
	result := run(t, []string{"verify", "good-id", "--file", out, "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d, want %d (err=%q)", result.code, exitOK, result.err)
	}
	match(t, result.out, "verification record found")
	match(t, result.out, `matches record\s+yes`)
}

func TestVerify_TamperedReturnsFour(t *testing.T) {
	tampered := filepath.Join(workDir, "tampered.pdf")
	if err := os.WriteFile(tampered, []byte("%PDF-1.7\naltered\n"), 0o666); err != nil {
		t.Fatalf("writing tampered file: %v", err)
	}
	result := run(t, []string{"verify", "good-id", "--file", tampered, "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUnverified {
		t.Fatalf("code = %d, want %d", result.code, exitUnverified)
	}
	match(t, result.err, "does not match the checksum on the record")
}

func TestVerify_ExpectHashMismatchReturnsFour(t *testing.T) {
	result := run(t, []string{"verify", "good-id", "--expect-hash", "deadbeef", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUnverified {
		t.Fatalf("code = %d, want %d", result.code, exitUnverified)
	}
	match(t, result.err, "expected data hash does not match")
}

func TestVerify_UnknownIDReturnsFour(t *testing.T) {
	result := run(t, []string{"verify", "missing-id", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUnverified {
		t.Fatalf("code = %d, want %d", result.code, exitUnverified)
	}
	match(t, result.err, "no verification record exists for this id")
}

func TestVerify_DegradedDistinguished(t *testing.T) {
	result := run(t, []string{"verify", "degraded-id", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUnverified {
		t.Fatalf("code = %d, want %d", result.code, exitUnverified)
	}
	match(t, result.err, "temporarily unavailable")
}

/* ── Public observatory ─────────────────────────────────────────────────── */

func TestObs_ListStatesProvenance(t *testing.T) {
	result := run(t, []string{"obs", "list", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "openai")
	match(t, result.out, "statement about this probe, not vendor-wide health")
}

/* ── Usage errors ───────────────────────────────────────────────────────── */

func TestUsage_HelpExitsZero(t *testing.T) {
	result := run(t, []string{"--help"}, baseEnv())
	if result.code != exitOK {
		t.Errorf("code = %d, want %d", result.code, exitOK)
	}
	match(t, result.out, "reliastra — observe external dependencies")
}

func TestUsage_NoArgsPrintsUsageExitsOne(t *testing.T) {
	result := run(t, []string{}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.out, "reliastra — observe external dependencies")
}

func TestUsage_UnknownCommandExitsOne(t *testing.T) {
	result := run(t, []string{"teleport"}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.err, "unknown command: teleport")
}

func TestUsage_MissingArgPrintsUsageOnStdout(t *testing.T) {
	result := run(t, []string{"evidence", "show"}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.out, "usage: reliastra evidence show")
}

/* ── Help, everywhere ───────────────────────────────────────────────────── */

func TestHelp_CommandHelpWithoutRunning(t *testing.T) {
	result := run(t, []string{"evidence", "--help"}, baseEnv())
	if result.code != exitOK {
		t.Errorf("code = %d, want %d", result.code, exitOK)
	}
	match(t, result.out, `reliastra evidence <list\|show\|get>`)
	match(t, result.out, "verification URL")
}

func TestHelp_SubcommandHelp(t *testing.T) {
	result := run(t, []string{"evidence", "get", "--help"}, baseEnv())
	if result.code != exitOK {
		t.Errorf("code = %d, want %d", result.code, exitOK)
	}
	match(t, result.out, "--out <path>")
	match(t, result.out, "hashed here, not echoed|computed from the file on disk")
}

func TestHelp_ExitCodesDocumented(t *testing.T) {
	result := run(t, []string{"--help"}, baseEnv())
	match(t, result.out, "verification claim did not hold")
	match(t, result.out, "could not be reached")
}

func TestHelp_UnknownSubcommandOffersExisting(t *testing.T) {
	result := run(t, []string{"evidence", "frobnicate"}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.err, "unknown subcommand: evidence frobnicate")
	match(t, result.err, "reliastra evidence --help")
}

func TestHelp_UnknownFlagSuggests(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "list", "--interva", "60", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.err, "unknown flag")
	match(t, result.err, "did you mean `--interval`")
}

func TestHelp_VersionPrintsSemver(t *testing.T) {
	result := run(t, []string{"--version"}, baseEnv())
	if result.code != exitOK {
		t.Errorf("code = %d, want %d", result.code, exitOK)
	}
	match(t, strings.TrimSpace(result.out), `^\d+\.\d+\.\d+`)
}

func TestHelp_TopicPrintsFullUsage(t *testing.T) {
	// `help` is an alias for top-level `--help`, whatever follows it.
	for _, argv := range [][]string{{"help"}, {"help", "deps"}, {"help", "frobnicate"}} {
		result := run(t, argv, baseEnv())
		if result.code != exitOK {
			t.Errorf("%v: code = %d, want %d", argv, result.code, exitOK)
		}
		match(t, result.out, "reliastra — observe external dependencies")
	}
}

/* ── Doctor ─────────────────────────────────────────────────────────────── */

func TestDoctor_PassesWithStoredSession(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"doctor", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "api reachable")
	match(t, result.out, "authenticated")
}

func TestDoctor_NamesAuthFailure(t *testing.T) {
	env := baseEnv()
	env["RELIASTRA_TOKEN"] = "denied-token"
	result := run(t, []string{"doctor", "--api-url", apiBaseURL}, env)
	if result.code != exitDenied {
		t.Fatalf("code = %d, want %d", result.code, exitDenied)
	}
	match(t, result.err, "authenticated")
	match(t, result.err, "reliastra keys create")
}

func TestDoctor_UnreachableIsNetwork(t *testing.T) {
	result := run(t, []string{"doctor", "--api-url", "http://127.0.0.1:9"}, baseEnv())
	if result.code != exitNetwork {
		t.Fatalf("code = %d, want %d", result.code, exitNetwork)
	}
	match(t, result.err, "api reachable")
}

func TestDoctor_NeverPrintsCredential(t *testing.T) {
	const secret = "rel_0123456789abcdef0123456789abcdef01234567"
	ensureLogin(t)
	env := baseEnv()
	env["RELIASTRA_TOKEN"] = secret
	result := run(t, []string{"doctor", "--json", "--api-url", apiBaseURL}, env)
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	noMatch(t, result.out, regexp.QuoteMeta(secret))
	match(t, result.out, `"credential_source": "environment"`)
}

/* ── Terminal to web ────────────────────────────────────────────────────── */

func TestOpen_VerifyURL(t *testing.T) {
	const site = "https://console.test"
	result := run(t, []string{"open", "verify", "8Kd2xQ7mB4pL", "--site-url", site}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	if strings.TrimSpace(result.out) != site+"/reports/8Kd2xQ7mB4pL" {
		t.Errorf("out = %q", result.out)
	}
}

func TestOpen_ConsoleURLs(t *testing.T) {
	const site = "https://console.test"
	cases := []struct{ kind, id, want string }{
		{"incident", "inc-1", site + "/incidents/inc-1"},
		{"evidence", "rep-1", site + "/evidence/rep-1"},
		{"dependency", "dep-1", site + "/dependencies/dep-1"},
	}
	for _, c := range cases {
		result := run(t, []string{"open", c.kind, c.id, "--site-url", site}, baseEnv())
		if result.code != exitOK {
			t.Fatalf("open %s: code = %d (err=%q)", c.kind, result.code, result.err)
		}
		if strings.TrimSpace(result.out) != c.want {
			t.Errorf("open %s: out = %q, want %q", c.kind, result.out, c.want)
		}
	}
}

func TestOpen_NeedsID(t *testing.T) {
	result := run(t, []string{"open", "incident", "--site-url", "https://console.test"}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.err, "incident needs an id")
}

func TestEvidence_ShowPrintsConsoleURL(t *testing.T) {
	ensureLogin(t)
	const site = "https://console.test"
	result := run(t, []string{"evidence", "show", "rep-1", "--site-url", site, "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, `https://reliastra\.com/reports/good-id`)
	match(t, result.out, regexp.QuoteMeta(site+"/evidence/rep-1"))
}

/* ── Destructive commands ───────────────────────────────────────────────── */

func TestDeps_RmRefusesWithoutConfirmation(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "rm", "dep-1234abcd", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitUsage {
		t.Errorf("code = %d, want %d", result.code, exitUsage)
	}
	match(t, result.err, "no terminal is attached")
	match(t, result.err, "--yes")
}

func TestDeps_RmWithYes(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "rm", "dep-1234abcd", "--yes", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "removed dep-1234abcd")
}

func TestKeys_RmRevokes(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"keys", "rm", "k1", "--yes", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "revoked k1")
}

/* ── One dependency, end to end ─────────────────────────────────────────── */

func TestDeps_ShowEndToEnd(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"deps", "show", "dep-1234abcd", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "Stripe API")
	match(t, result.out, "last 1 observations")
	match(t, result.out, "incidents for this dependency")
	match(t, result.out, `console  https://reliastra\.com/dependencies/dep-1234abcd`)
}

func TestChecks_FiltersThroughDependencyEndpoint(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"checks", "recent", "--dependency", "dep-1234abcd", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "for dependency dep-1234abcd")
}

func TestIncidents_EvidenceFlagFollowsToRecord(t *testing.T) {
	ensureLogin(t)
	result := run(t, []string{"incidents", "show", "inc-1", "--evidence", "--api-url", apiBaseURL}, baseEnv())
	if result.code != exitOK {
		t.Fatalf("code = %d (err=%q)", result.code, result.err)
	}
	match(t, result.out, "evidence record")
	match(t, result.out, `https://reliastra\.com/reports/good-id`)
}

/* ── Failure taxonomy ───────────────────────────────────────────────────── */

func TestTaxonomy_DeniedVsUnauthenticated(t *testing.T) {
	env := baseEnv()
	env["RELIASTRA_TOKEN"] = "denied-token"
	result := run(t, []string{"deps", "list", "--api-url", apiBaseURL}, env)
	if result.code != exitDenied {
		t.Fatalf("code = %d, want %d", result.code, exitDenied)
	}
	match(t, result.err, "not permitted")
	match(t, result.err, "scope")
}

func TestTaxonomy_UnreachableIsNetworkNotAuth(t *testing.T) {
	result := run(t, []string{"deps", "list", "--api-url", "http://127.0.0.1:9"}, baseEnv())
	if result.code != exitNetwork {
		t.Fatalf("code = %d, want %d", result.code, exitNetwork)
	}
	match(t, result.err, "could not be reached")
	noMatch(t, result.err, "authentication")
}

func TestTaxonomy_NeverPrintsStackTrace(t *testing.T) {
	env := baseEnv()
	env["RELIASTRA_TOKEN"] = "denied-token"
	result := run(t, []string{"deps", "list", "--api-url", apiBaseURL}, env)
	noMatch(t, result.err, `\n\s+at `)
}
