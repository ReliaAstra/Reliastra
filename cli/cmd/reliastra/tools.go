// `doctor` and `open`: the two commands that exist because the CLI and the web
// application are views of one record.
//
// `doctor` answers the question that otherwise costs a support round-trip -
// *is this my configuration, my credential, or my network?* It never needs a
// valid credential to say something useful, because "the API is unreachable"
// and "your token is rejected" are different problems with different owners.
//
// `open` turns any identifier the CLI prints into the page where a person can
// read it. It prints by default: a build runner has no browser, and a URL on
// stdout is composable (`open "$(reliastra open evidence …)"`).
package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

/* ── doctor ─────────────────────────────────────────────────────────────── */

// doctorCheck is one line of the doctor report. Essential decides the exit
// code: a missing site URL degrades links but does not break anything, so it
// warns; an unreachable API is the whole product.
type doctorCheck struct {
	Name      string  `json:"name"`
	Status    string  `json:"status"`
	Detail    string  `json:"detail"`
	Fix       *string `json:"fix"`
	Essential bool    `json:"essential"`
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

type doctorReporter struct {
	checks []doctorCheck
}

func (r *doctorReporter) add(name, status, detail, fix string, essential bool) {
	r.checks = append(r.checks, doctorCheck{
		Name:      name,
		Status:    status,
		Detail:    detail,
		Fix:       strPtr(fix),
		Essential: essential,
	})
}

func cmdDoctor(ctx *commandContext) int {
	site := webUrls(ctx.session.siteURL)
	reporter := &doctorReporter{}

	// ── Local configuration ──
	path := configPath(ctx.env)
	if info, err := os.Stat(path); err != nil {
		reporter.add("config file", "warn", fmt.Sprintf("not present at %s (this is normal before the first login)", path), "reliastra login --email you@example.com", false)
	} else if mode := info.Mode().Perm(); mode&0o077 != 0 {
		// A credential any other user on the machine can read is the one local
		// failure worth shouting about, and it is invisible without a stat.
		reporter.add("config file", "fail", fmt.Sprintf("%s is mode %03o; a credential should be 0600", path, mode), "chmod 600 "+path, true)
	} else {
		reporter.add("config file", "ok", fmt.Sprintf("%s (mode %03o)", path, mode), "", false)
	}

	// ── Credential resolution ──
	if ctx.session.source == "none" {
		reporter.add("credential", "warn", "none found: no flag, no RELIASTRA_TOKEN, no stored session", "reliastra login --email you@example.com", false)
	} else {
		// The value is never printed - only where it came from. A token in a
		// terminal scrollback or a CI log is a credential leak with a long tail.
		reporter.add("credential", "ok", "from "+ctx.session.source, "", false)
	}

	reporter.add("api url", "ok", ctx.client.apiURL, "", false)
	reporter.add("web url", "ok", ctx.session.siteURL, "", false)

	// ── Reachability, then identity ──
	// Deliberately unauthenticated first: an authenticated call against an
	// unreachable host says "network error", and the operator learns less than
	// they would from a separate reachability check.
	reachable := false
	if _, err := ctx.client.getNoRefresh("/health", nil); err == nil {
		reachable = true
		reporter.add("api reachable", "ok", ctx.client.apiURL+"/health answered", "", false)
	} else if isAuthError(err) {
		// Some deployments protect /health; an auth challenge still proves the
		// host answered, which is the question being asked here.
		reachable = true
		reporter.add("api reachable", "ok", ctx.client.apiURL+" answered (health is gated)", "", false)
	} else {
		reporter.add("api reachable", "fail", err.Error(), "check the network, then `--api-url` / RELIASTRA_API_URL", true)
	}

	authKind := ""
	if reachable && ctx.session.source != "none" {
		// Which endpoint proves the credential depends on what the credential can
		// reach. A session token can read its own identity; an API key cannot,
		// by design, so it proves itself against a read it is meant to make.
		keyCredential := isAPIKey(ctx.session.token)
		probePath := "/v1/users/me"
		probeWhat := "identity"
		var probeQuery map[string]string
		if keyCredential {
			probePath = "/v1/dependencies"
			probeWhat = "a dependency read"
			probeQuery = map[string]string{"limit": "1"}
		}
		resp, err := ctx.client.getNoRefresh(probePath, probeQuery)
		if err == nil {
			if keyCredential {
				shown := ctx.session.token
				if len(shown) > 8 {
					shown = shown[:8]
				}
				reporter.add("authenticated", "ok", "API key "+shown+"… authenticates", "", false)
			} else {
				email := strField(resp.data, "email")
				if email == "" {
					email = "this account"
				}
				reporter.add("authenticated", "ok", "as "+email, "", false)
			}
		} else {
			status := apiErrStatus(err)
			detail := err.Error()
			fix := "retry; if it persists, check the status page"
			authKind = "other"
			if status == 403 {
				detail = fmt.Sprintf("the credential authenticates but was refused %s: %s", probeWhat, err.Error())
				fix = "the API key is missing a scope this read needs. Issue one that carries it: `reliastra keys create <name> --scopes read:dependencies,read:incidents,read:evidence,read:checks`"
				authKind = "denied"
			} else if status == 401 || isAuthError(err) {
				detail = "the credential was rejected"
				fix = "reliastra login --email you@example.com  (or refresh RELIASTRA_TOKEN)"
				authKind = "auth"
			}
			reporter.add("authenticated", "fail", detail, fix, true)
		}
	}

	// ── Links the CLI will print ──
	if !strings.HasPrefix(site.quickstart(), "http") {
		reporter.add("web origin", "fail", fmt.Sprintf("%s is not an absolute URL", ctx.session.siteURL), "set --site-url or RELIASTRA_SITE_URL", true)
	}

	failed := []doctorCheck{}
	for _, check := range reporter.checks {
		if check.Status == "fail" {
			failed = append(failed, check)
		}
	}
	unreachable := false
	for _, check := range failed {
		if check.Name == "api reachable" {
			unreachable = true
		}
	}
	exit := exitOK
	switch {
	case unreachable:
		exit = exitNetwork
	case authKind == "denied":
		exit = exitDenied
	case authKind == "auth":
		exit = exitAuth
	case len(failed) > 0:
		exit = exitAPI
	}

	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{
			"ok":                len(failed) == 0,
			"api_url":           ctx.client.apiURL,
			"site_url":          ctx.session.siteURL,
			"credential_source": ctx.session.source,
			"checks":            reporter.checks,
			"exit_code":         exit,
		})
		return exit
	}

	write("reliastra doctor")
	write("")
	width := 0
	for _, check := range reporter.checks {
		if len(check.Name) > width {
			width = len(check.Name)
		}
	}
	if width > 20 {
		width = 20
	}
	symbol := map[string]string{"ok": "ok  ", "warn": "warn", "fail": "fail"}
	for _, check := range reporter.checks {
		write(fmt.Sprintf("  %s  %s  %s", symbol[check.Status], padRight(check.Name, width), check.Detail))
	}

	if len(failed) > 0 {
		write("")
		for _, check := range failed {
			writeError(fmt.Sprintf("  %s: %s", check.Name, check.Detail))
			if check.Fix != nil {
				writeError("    → " + *check.Fix)
			}
		}
	} else {
		write("\n  everything essential passed.")
	}
	return exit
}

/* ── open ───────────────────────────────────────────────────────────────── */

// openTargets are the resource kinds `open` understands.
var openTargets = []string{"incident", "evidence", "verify", "dependency", "observatory", "docs"}

// openURL builds the web URL for a resource kind and optional id.
func openURL(kind, id, siteURL string) string {
	site := webUrls(siteURL)
	switch kind {
	case "incident":
		if id != "" {
			return site.incident(id)
		}
		return site.dashboard()
	case "evidence":
		if id != "" {
			return site.evidence(id)
		}
		return site.evidenceProduct()
	case "verify":
		if id != "" {
			return site.verification(id)
		}
		return site.evidenceProduct()
	case "dependency":
		if id != "" {
			return site.dependency(id)
		}
		return site.dashboard()
	case "observatory":
		if id != "" {
			return site.vendor(id)
		}
		return site.observatory()
	case "docs":
		return site.docs(id)
	default:
		return ""
	}
}

// launch hands a URL to the platform opener. Detached, and its failure is
// not ours.
func launch(url string) {
	command := "xdg-open"
	args := []string{url}
	switch runtime.GOOS {
	case "darwin":
		command = "open"
	case "windows":
		command = "cmd"
		args = []string{"/c", "start", "", url}
	}
	child := exec.Command(command, args...)
	// No opener on this machine is fine: the URL has already been printed,
	// so the operator loses nothing; a non-zero exit here would be a lie
	// about the command having failed.
	_ = child.Start()
}

func cmdOpen(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		write("usage: reliastra open <incident|evidence|verify|dependency|observatory|docs> [id] [--browser]")
		return exitUsage
	}
	kind, id := ctx.args[0], ""
	if len(ctx.args) > 1 {
		id = ctx.args[1]
	}
	known := false
	for _, target := range openTargets {
		if target == kind {
			known = true
		}
	}
	if !known {
		writeError(fmt.Sprintf("unknown target: %s", kind))
		write("known targets: " + strings.Join(openTargets, ", "))
		return exitUsage
	}
	switch kind {
	case "incident", "evidence", "verify", "dependency":
		if id == "" {
			writeError(fmt.Sprintf("%s needs an id: reliastra open %s <id>", kind, kind))
			return exitUsage
		}
	}

	url := openURL(kind, id, ctx.session.siteURL)
	if url == "" {
		writeError(fmt.Sprintf("no web page is known for %s", kind))
		return exitUsage
	}

	if ctx.flags.boolean("json") {
		var idOut any
		if id != "" {
			idOut = id
		}
		jsonOut(map[string]any{"url": url, "kind": kind, "id": idOut, "opened": ctx.flags.boolean("browser")})
	} else {
		write(url)
	}
	if ctx.flags.boolean("browser") {
		launch(url)
	}
	return exitOK
}
