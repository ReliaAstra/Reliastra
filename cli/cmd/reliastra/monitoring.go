// Dependencies, observations and incidents.
//
// These commands are the shape of the product: what is being probed, what each
// probe recorded, and what the detector concluded from a run of probes. The
// output never merges those three into a single "health" number, because they
// answer different questions and a reader needs to see which one they are
// looking at.
//
// Every command that identifies an object prints how to reach that object in
// the web console - `--web` on the list commands, and a closing line on the
// detail commands. The terminal is the fast path; the console is where the
// window is charted and the artifact is readable, and the CLI should not
// pretend otherwise.
package main

import (
	"fmt"
	"strconv"
	"sync"
)

/* ── deps ───────────────────────────────────────────────────────────────── */

func cmdDeps(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		return listDeps(ctx)
	}
	sub, rest := ctx.args[0], ctx.args[1:]
	subCtx := &commandContext{flags: ctx.flags, args: rest, client: ctx.client, session: ctx.session, env: ctx.env}
	switch sub {
	case "list":
		return listDeps(ctx)
	case "show":
		return showDep(subCtx)
	case "add":
		return addDep(subCtx)
	case "rm", "remove":
		return removeDep(subCtx)
	default:
		return unknownSubcommand("deps", sub, "deps list | deps show <id> | deps add <name> <url> | deps rm <id>")
	}
}

func listDeps(ctx *commandContext) int {
	limit, err := flagInt(ctx.flags, "limit", 100, 0)
	if err != nil {
		writeError(err.Error())
		return exitUsage
	}
	resp, err := ctx.client.get("/v1/dependencies", map[string]string{"limit": strconv.Itoa(limit)})
	if err != nil {
		return reportError(err)
	}
	items := listOf(resp.data)

	if ctx.flags.boolean("json") {
		jsonOut(items)
		return exitOK
	}
	columns := []tableColumn{
		{"id", 8, func(d any) any { return strField(d, "id") }},
		{"name", 28, func(d any) any { return strField(d, "name") }},
		{"endpoint", 52, func(d any) any { return strField(d, "endpoint_url") }},
		{"every", 0, func(d any) any { return interval(field(d, "check_interval_seconds")) }},
		{"active", 0, func(d any) any { return yesNo(field(d, "is_active")) }},
		{"last check", 0, func(d any) any { return cliTime(field(d, "last_check_at")) }},
	}
	if ctx.flags.boolean("web") {
		site := webUrls(ctx.session.siteURL)
		columns = append(columns, tableColumn{"web", 60, func(d any) any { return site.dependency(strField(d, "id")) }})
	}
	renderTable(items, columns, "no dependencies are being probed yet — `reliastra deps add \"Name\" https://…`")
	if len(items) > 0 {
		hint("`reliastra deps show <id>` for one dependency; `reliastra open dependency <id> --browser` for the console view.", ctx.flags)
	}
	return exitOK
}

// showDep prints one dependency, with its recent observations and its
// incidents.
//
// Three requests, issued together: the configuration, the observations, and
// any incidents the detector opened for it. They are independent reads, and
// running the dependency on the incidents endpoint (rather than pulling the
// account's whole incident history) is exactly what that filter is for.
func showDep(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		writeError("dependency id required")
		write("usage: reliastra deps show <dependency-id> [--observations 10] [--web]")
		return exitUsage
	}
	id := ctx.args[0]
	observationsLimit, err := flagInt(ctx.flags, "observations", 10, 0)
	if err != nil {
		writeError(err.Error())
		return exitUsage
	}
	path := "/v1/dependencies/" + pathEscape(id)

	var dep any
	var depErr error
	var observations []any
	observationsFailed := false
	var incidents []any
	incidentsFailed := false
	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		resp, err := ctx.client.get(path, nil)
		if err != nil {
			depErr = err
			return
		}
		dep = resp.data
	}()
	go func() {
		defer wg.Done()
		resp, err := ctx.client.get(path+"/results", map[string]string{"limit": strconv.Itoa(observationsLimit)})
		if err != nil {
			observationsFailed = true
			return
		}
		observations = listOf(resp.data)
	}()
	go func() {
		defer wg.Done()
		resp, err := ctx.client.get("/v1/incidents", map[string]string{"dependency_id": id, "limit": "5"})
		if err != nil {
			incidentsFailed = true
			return
		}
		incidents = listOf(resp.data)
	}()
	wg.Wait()
	if depErr != nil {
		return reportError(depErr)
	}

	var observationsOut any = observations
	if observationsFailed {
		observationsOut = nil
	}
	var incidentsOut any = incidents
	if incidentsFailed {
		incidentsOut = nil
	}
	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{"dependency": dep, "observations": observationsOut, "incidents": incidentsOut})
		return exitOK
	}

	method := "GET"
	if m, ok := asMap(dep)["method"].(string); ok {
		method = m
	}
	renderKV([]kvField{
		{"dependency", strField(dep, "id")},
		{"name", strField(dep, "name")},
		{"endpoint", fmt.Sprintf("%s %s", method, orDash(strField(dep, "endpoint_url")))},
		{"expects", joinList(field(dep, "expected_status_codes"), ", ")},
		{"interval", interval(field(dep, "check_interval_seconds"))},
		{"timeout", timeoutSeconds(field(dep, "timeout_seconds"))},
		{"next check", cliTime(field(dep, "next_check_at"))},
		{"active", yesNo(field(dep, "is_active"))},
		{"region label", joinList(field(dep, "regions"), ", ")},
	}, 0)

	if !observationsFailed {
		heading(fmt.Sprintf("last %d observations", len(observations)))
		renderTable(observations, []tableColumn{
			{"executed (utc)", 0, func(c any) any { return cliTime(field(c, "executed_at")) }},
			{"result", 0, func(c any) any { return upOrFailed(field(c, "is_up")) }},
			{"status", 0, func(c any) any { return field(c, "status_code") }},
			{"latency", 0, func(c any) any { return ms(field(c, "latency_ms")) }},
			{"detail", 40, func(c any) any { return strField(c, "error_message") }},
		}, "no observations recorded yet")
	} else {
		heading("observations unavailable")
		write("the observation list could not be read; the dependency itself is above.")
	}

	if !incidentsFailed {
		heading(fmt.Sprintf("incidents for this dependency (%d)", len(incidents)))
		renderTable(incidents, []tableColumn{
			{"id", 8, func(i any) any { return strField(i, "id") }},
			{"started (utc)", 0, func(i any) any { return cliTime(field(i, "started_at")) }},
			{"resolved", 0, func(i any) any { return cliTime(field(i, "resolved_at")) }},
			{"severity", 0, func(i any) any { return strField(i, "severity") }},
			{"status", 0, func(i any) any { return strField(i, "status") }},
		}, "none — no incident has been opened for this dependency")
	}

	write("\nconsole  " + webUrls(ctx.session.siteURL).dependency(strField(dep, "id")))
	return exitOK
}

// timeoutSeconds renders `10s`, or "" when missing or zero.
func timeoutSeconds(v any) string {
	n, ok := asNumber(v)
	if !ok || n == 0 {
		return ""
	}
	return strconv.FormatFloat(n, 'f', -1, 64) + "s"
}

// upOrFailed renders a probe boolean. Anything but an explicit true is a
// failure: a missing verdict is not an "up".
func upOrFailed(v any) string {
	if up, ok := v.(bool); ok && up {
		return "up"
	}
	return "failed"
}

func addDep(ctx *commandContext) int {
	if len(ctx.args) < 2 {
		writeError("a name and a URL are both required")
		write("usage: reliastra deps add <name> <url> [--interval 300] [--expect 200,204] [--method GET]")
		return exitUsage
	}
	name, endpointURL := ctx.args[0], ctx.args[1]
	body := map[string]any{
		"name":         name,
		"endpoint_url": endpointURL,
		"method":       "GET",
		// One observation point is deployed; the scheduler label is not a
		// choice the operator makes, so the CLI defaults it.
		"regions":      []string{"us-east"},
	}
	if ctx.flags.has("region") {
		body["regions"] = []string{ctx.flags.str("region")}
	}
	if ctx.flags.has("method") {
		body["method"] = ctx.flags.str("method")
	}
	if ctx.flags.has("interval") {
		n, err := flagInt(ctx.flags, "interval", 0, 1)
		if err != nil {
			writeError(err.Error())
			return exitUsage
		}
		body["check_interval_seconds"] = n
	}
	if ctx.flags.has("expect") {
		codes, err := flagExpectCodes(ctx.flags)
		if err != nil {
			writeError(err.Error())
			return exitUsage
		}
		body["expected_status_codes"] = codes
	}
	if ctx.flags.has("timeout") {
		n, err := flagInt(ctx.flags, "timeout", 0, 1)
		if err != nil {
			writeError(err.Error())
			return exitUsage
		}
		body["timeout_seconds"] = n
	}

	resp, err := ctx.client.post("/v1/dependencies", body)
	if err != nil {
		return reportError(err)
	}
	data := asMap(resp.data)
	if ctx.flags.boolean("json") {
		jsonOut(data)
		return exitOK
	}
	renderKV([]kvField{
		{"id", strField(data, "id")},
		{"name", strField(data, "name")},
		{"endpoint", strField(data, "endpoint_url")},
		{"interval", interval(field(data, "check_interval_seconds"))},
		{"next check", cliTime(field(data, "next_check_at"))},
	}, 0)
	hint(fmt.Sprintf("first observations appear on the next scheduled check.\nwatch them with `reliastra checks recent`; `reliastra deps show %s` has the configuration.", strField(data, "id")), ctx.flags)
	return exitOK
}

func removeDep(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		writeError("dependency id required")
		write("usage: reliastra deps rm <dependency-id> [--yes]")
		return exitUsage
	}
	id := ctx.args[0]
	if code := guardDestructive(ctx.flags, "dependency "+id); code != exitOK {
		return code
	}

	if _, err := ctx.client.remove("/v1/dependencies/" + pathEscape(id)); err != nil {
		return reportError(err)
	}
	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{"deleted": id})
		return exitOK
	}
	write(fmt.Sprintf("removed %s", id))
	write("observations already recorded are kept; only future probes stop.")
	return exitOK
}

/* ── checks ─────────────────────────────────────────────────────────────── */

func cmdChecks(ctx *commandContext) int {
	if len(ctx.args) > 0 && ctx.args[0] != "recent" {
		return unknownSubcommand("checks", ctx.args[0], "checks recent [--limit 50] [--dependency <id>]")
	}

	limit, err := flagInt(ctx.flags, "limit", 50, 0)
	if err != nil {
		writeError(err.Error())
		return exitUsage
	}
	// `/v1/checks/recent` is org-wide; scoping to one dependency uses the
	// dependency's own results endpoint, which is the same data by the route
	// that owns it rather than a client-side filter.
	var resp *apiResponse
	if dependency := ctx.flags.str("dependency"); dependency != "" {
		resp, err = ctx.client.get("/v1/dependencies/"+pathEscape(dependency)+"/results", map[string]string{"limit": strconv.Itoa(limit)})
	} else {
		resp, err = ctx.client.get("/v1/checks/recent", map[string]string{"limit": strconv.Itoa(limit)})
	}
	if err != nil {
		return reportError(err)
	}
	items := listOf(resp.data)

	if ctx.flags.boolean("json") {
		jsonOut(items)
		return exitOK
	}
	renderTable(items, []tableColumn{
		{"executed (utc)", 0, func(c any) any { return cliTime(field(c, "executed_at")) }},
		{"result", 0, func(c any) any { return upOrFailed(field(c, "is_up")) }},
		{"status", 0, func(c any) any { return field(c, "status_code") }},
		{"latency", 0, func(c any) any { return ms(field(c, "latency_ms")) }},
		{"detail", 40, func(c any) any { return strField(c, "error_message") }},
		{"dep", 8, func(c any) any { return strField(c, "dependency_id") }},
	}, "no observations recorded yet")
	if !ctx.flags.boolean("quiet") {
		scope := ""
		if dependency := ctx.flags.str("dependency"); dependency != "" {
			scope = " for dependency " + dependency
		}
		plural := "s"
		if len(items) == 1 {
			plural = ""
		}
		region := "—"
		if len(items) > 0 {
			if r := strField(items[0], "region"); r != "" {
				region = r
			}
		}
		heading(fmt.Sprintf("%d observation%s%s · newest first · region label \"%s\"", len(items), plural, scope, region))
		write("A failed observation is a fact about one probe. An incident is opened by the detector, not by this list.")
	}
	return exitOK
}

/* ── incidents ──────────────────────────────────────────────────────────── */

func cmdIncidents(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		return listIncidents(ctx)
	}
	sub, rest := ctx.args[0], ctx.args[1:]
	subCtx := &commandContext{flags: ctx.flags, args: rest, client: ctx.client, session: ctx.session, env: ctx.env}
	switch sub {
	case "list":
		return listIncidents(ctx)
	case "show":
		return showIncident(subCtx)
	case "correlate":
		return correlateIncident(subCtx)
	default:
		return unknownSubcommand("incidents", sub, "incidents list | incidents show <id> | incidents correlate <id>")
	}
}

func listIncidents(ctx *commandContext) int {
	limit, err := flagInt(ctx.flags, "limit", 25, 0)
	if err != nil {
		writeError(err.Error())
		return exitUsage
	}
	query := map[string]string{"limit": strconv.Itoa(limit)}
	if status := ctx.flags.str("status"); status != "" {
		query["status"] = status
	}
	if dependency := ctx.flags.str("dependency"); dependency != "" {
		query["dependency_id"] = dependency
	}
	resp, err := ctx.client.get("/v1/incidents", query)
	if err != nil {
		return reportError(err)
	}
	items := listOf(resp.data)

	if ctx.flags.boolean("json") {
		jsonOut(items)
		return exitOK
	}
	columns := []tableColumn{
		{"id", 8, func(i any) any { return strField(i, "id") }},
		{"started (utc)", 0, func(i any) any { return cliTime(field(i, "started_at")) }},
		{"resolved", 0, func(i any) any { return cliTime(field(i, "resolved_at")) }},
		{"severity", 0, func(i any) any { return strField(i, "severity") }},
		{"status", 0, func(i any) any { return strField(i, "status") }},
		{"root cause", 0, func(i any) any { return strField(i, "root_cause") }},
	}
	if ctx.flags.boolean("web") {
		site := webUrls(ctx.session.siteURL)
		columns = append(columns, tableColumn{"web", 60, func(i any) any { return site.incident(strField(i, "id")) }})
	}
	renderTable(items, columns, "no incidents recorded — which is a result, not a missing page")
	if len(items) > 0 {
		hint("`reliastra incidents show <id>` for the window and correlations; `--web` prints the console URLs.", ctx.flags)
	}
	return exitOK
}

func showIncident(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		writeError("incident id required")
		write("usage: reliastra incidents show <incident-id> [--evidence] [--web]")
		return exitUsage
	}
	id := ctx.args[0]
	resp, err := ctx.client.get("/v1/incidents/"+pathEscape(id), nil)
	if err != nil {
		return reportError(err)
	}
	data := asMap(resp.data)

	// `--evidence` follows the link the record carries rather than making the
	// operator copy an id between two commands: dependency → incident → evidence
	// → verification is one path, and each step should hand over the next.
	var evidence any
	if ctx.flags.boolean("evidence") && strField(data, "evidence_report_id") != "" {
		evidenceResp, evidenceErr := ctx.client.get("/v1/evidence/"+pathEscape(strField(data, "evidence_report_id")), nil)
		if evidenceErr != nil {
			writeError(fmt.Sprintf("the evidence record %s could not be read: %s", strField(data, "evidence_report_id"), evidenceErr.Error()))
		} else {
			evidence = evidenceResp.data
		}
	}

	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{"incident": data, "evidence": evidence})
		return exitOK
	}

	resolved := cliTime(field(data, "resolved_at"))
	if resolved == "" {
		resolved = "open"
	}
	renderKV([]kvField{
		{"incident", strField(data, "id")},
		{"dependency", strField(data, "dependency_id")},
		{"window", fmt.Sprintf("%s → %s", orDash(cliTime(field(data, "started_at"))), resolved)},
		{"severity / status", fmt.Sprintf("%s / %s", orDash(strField(data, "severity")), orDash(strField(data, "status")))},
		{"root cause", strField(data, "root_cause")},
		{"description", strField(data, "description")},
		{"evidence record", strField(data, "evidence_report_id")},
		{"evidence status", strField(data, "evidence_status")},
	}, 0)

	var correlations []any
	if list, ok := field(data, "correlations").([]any); ok {
		correlations = list
	}
	if len(correlations) > 0 {
		heading("correlated dependencies")
		renderTable(correlations, []tableColumn{
			{"dependency", 12, func(c any) any { return strField(c, "correlated_dependency_id") }},
			{"method", 0, func(c any) any { return strField(c, "correlation_method") }},
			{"confidence", 0, func(c any) any { return field(c, "correlation_confidence") }},
			{"window", 0, func(c any) any { return correlationWindow(field(c, "time_window_seconds")) }},
		}, "")
		write("  alignment between two timelines, not a statement of cause.")
	}

	if evidence != nil {
		record := asMap(evidence)
		heading("evidence record")
		renderKV([]kvField{
			{"report", strField(record, "id")},
			{"generated", cliTime(field(record, "generated_at"))},
			{"expires", cliTime(field(record, "expires_at"))},
			{"sha-256 (document)", strField(record, "checksum")},
			{"sha-256 (payload)", strField(record, "data_hash")},
			{"methodology", strField(record, "methodology_version")},
			{"signed", signedLine(record, "no — this deployment issues unsigned artifacts")},
		}, 0)
		if verificationURL := strField(record, "verification_url"); verificationURL != "" {
			write("\nverify   " + verificationURL)
		}
	}

	write("\nconsole  " + webUrls(ctx.session.siteURL).incident(strField(data, "id")))
	if evidence == nil && strField(data, "evidence_report_id") != "" {
		hint(fmt.Sprintf("the detection rule and attribution verdict are inside the evidence record:\n  reliastra evidence show %s", strField(data, "evidence_report_id")), ctx.flags)
	} else if strField(data, "evidence_report_id") == "" {
		hint("no evidence record is attached; one is issued when the incident resolves.", ctx.flags)
	}
	return exitOK
}

// correlationWindow renders `300s`, or "" when the window is missing.
func correlationWindow(v any) string {
	n, ok := asNumber(v)
	if !ok {
		return ""
	}
	return strconv.FormatFloat(n, 'f', -1, 64) + "s"
}

// signedLine renders the signature state: `yes (alg)` when signed, or the
// deployment's unsigned-artifact notice otherwise.
func signedLine(record map[string]any, unsignedNotice string) string {
	if signed, ok := record["signed"].(bool); ok && signed {
		if alg := strField(record, "signature_alg"); alg != "" {
			return fmt.Sprintf("yes (%s)", alg)
		}
		return "yes"
	}
	return unsignedNotice
}

func correlateIncident(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		writeError("incident id required")
		write("usage: reliastra incidents correlate <incident-id>")
		return exitUsage
	}
	id := ctx.args[0]
	resp, err := ctx.client.post("/v1/incidents/"+pathEscape(id)+"/correlate", map[string]string{})
	if err != nil {
		return reportError(err)
	}
	var results []any
	if list, ok := resp.data.([]any); ok {
		results = list
	} else if list, ok := field(resp.data, "correlations").([]any); ok {
		results = list
	} else {
		results = []any{resp.data}
	}
	if ctx.flags.boolean("json") {
		jsonOut(resp.data)
		return exitOK
	}
	renderTable(results, []tableColumn{
		{"dependency", 0, func(r any) any {
			if name := strField(r, "dependency_name"); name != "" {
				return name
			}
			return strField(r, "dependency_id")
		}},
		{"classification", 0, func(r any) any { return strField(r, "classification") }},
		{"confidence", 0, func(r any) any { return field(r, "confidence_score") }},
	}, "no dependency degradation overlapped this incident window")
	write("\nScores come from five weighted signals with a published methodology version.\nAn overlap is an alignment between two timelines — it is not a statement of cause.")
	return exitOK
}
