// Evidence, verification, API keys and the public observatory.
//
// `verify` is the command this CLI exists for. Everything else is convenience;
// this one answers the question a recipient of an artifact actually has -
// *is this document what RELIASTRA issued?* - and answers it with a status
// code, so it can gate a pipeline.
//
// The commands around it exist so that question can be reached without leaving
// the terminal: `evidence show` prints the record's public verification URL,
// and `open verify <id>` prints the page a human reads. The verification logic
// itself is never reimplemented here. The API is the authority; the CLI formats
// its answer.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
)

/* ── evidence ───────────────────────────────────────────────────────────── */

func cmdEvidence(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		return listEvidence(ctx)
	}
	sub, rest := ctx.args[0], ctx.args[1:]
	subCtx := &commandContext{flags: ctx.flags, args: rest, client: ctx.client, session: ctx.session, env: ctx.env}
	switch sub {
	case "list":
		return listEvidence(ctx)
	case "show":
		return showEvidence(subCtx)
	case "get", "download":
		return getEvidence(subCtx)
	default:
		return unknownSubcommand("evidence", sub, "evidence list | evidence show <id> | evidence get <id>")
	}
}

func listEvidence(ctx *commandContext) int {
	limit, err := flagInt(ctx.flags, "limit", 50, 0)
	if err != nil {
		writeError(err.Error())
		return exitUsage
	}
	resp, err := ctx.client.get("/v1/evidence", map[string]string{"limit": strconv.Itoa(limit)})
	if err != nil {
		return reportError(err)
	}
	items := listOf(resp.data)

	if ctx.flags.boolean("json") {
		jsonOut(items)
		return exitOK
	}
	columns := []tableColumn{
		{"report", 8, func(e any) any { return strField(e, "id") }},
		{"generated (utc)", 0, func(e any) any { return cliTime(field(e, "generated_at")) }},
		{"expires", 0, func(e any) any { return cliTime(field(e, "expires_at")) }},
		{"size", 0, func(e any) any { return kib(field(e, "file_size_bytes")) }},
		{"sha-256", 16, func(e any) any { return strField(e, "checksum") }},
	}
	if ctx.flags.boolean("web") {
		site := webUrls(ctx.session.siteURL)
		columns = append(columns, tableColumn{"web", 60, func(e any) any { return site.evidence(strField(e, "id")) }})
	}
	renderTable(items, columns, "no evidence records yet — they are issued from a resolved incident")
	if len(items) > 0 {
		hint("`reliastra evidence show <id>` prints the record and its public verification URL;\n`reliastra evidence get <id>` writes the PDF.", ctx.flags)
	}
	return exitOK
}

func showEvidence(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		writeError("evidence report id required")
		write("usage: reliastra evidence show <report-id> [--payload] [--web]")
		return exitUsage
	}
	id := ctx.args[0]
	resp, err := ctx.client.get("/v1/evidence/"+pathEscape(id), nil)
	if err != nil {
		return reportError(err)
	}
	data := asMap(resp.data)
	site := webUrls(ctx.session.siteURL)

	if ctx.flags.boolean("json") {
		jsonOut(data)
		return exitOK
	}

	reportID := strField(data, "id")
	if reportID == "" {
		reportID = id
	}
	renderKV([]kvField{
		{"report", reportID},
		{"incident", strField(data, "incident_id")},
		{"generated", cliTime(field(data, "generated_at"))},
		{"expires", cliTime(field(data, "expires_at"))},
		{"size", kib(field(data, "file_size_bytes"))},
		{"sha-256 (document)", strField(data, "checksum")},
	}, 0)

	if ctx.flags.boolean("payload") {
		// The payload hash and the signature describe the facts rather than the
		// file: one is what the incident data must hash to, the other proves who
		// produced it. They are behind a flag because most readers want the
		// document checksum and the verification URL, not three more hashes.
		renderKV([]kvField{
			{"sha-256 (payload)", strField(data, "data_hash")},
			{"methodology", strField(data, "methodology_version")},
			{"signed", signedLine(data, "no — this deployment issues unsigned artifacts, and the document says so")},
		}, 0)
	}

	write("")
	if verificationURL := strField(data, "verification_url"); verificationURL != "" {
		// The whole point of the record, printed as a URL rather than described:
		// anyone holding the document can paste it and get the hashes re-checked
		// without an account.
		verificationID := strField(data, "verification_id")
		if verificationID == "" {
			verificationID = "<verification-id>"
		}
		write("verify   " + verificationURL)
		write(fmt.Sprintf("api      %s/v1/verify/%s", ctx.client.apiURL, verificationID))
	} else {
		write("verify   —")
		write("         no verification id is recorded for this artifact. Artifacts issued before")
		write("         snapshots were linked cannot be verified against the public record.")
	}
	write("console  " + site.evidence(reportID))
	verificationID := strField(data, "verification_id")
	if verificationID == "" {
		verificationID = "<id>"
	}
	hint(fmt.Sprintf("\nre-check the bytes on disk against the record:\n  reliastra evidence get %s --out artifact.pdf && reliastra verify %s --file artifact.pdf", id, verificationID), ctx.flags)
	return exitOK
}

func getEvidence(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		writeError("evidence report id required")
		write("usage: reliastra evidence get <report-id> [--out file.pdf]")
		return exitUsage
	}
	id := ctx.args[0]
	out := ctx.flags.str("out")
	if out == "" {
		out = fmt.Sprintf("reliastra-evidence-%s.pdf", id)
	}
	// The owner-addressed artifact route, not the public token-addressed
	// `/download` (that one is the evidence gate, and it takes a report token
	// rather than a report id). Streaming here means the CLI never has to follow
	// a presigned URL onto object storage.
	buffer, err := ctx.client.download("/v1/evidence/" + pathEscape(id) + "/artifact")
	if err != nil {
		return reportError(err)
	}
	if err := os.WriteFile(out, buffer, 0o666); err != nil {
		writeError(fmt.Sprintf("could not write --out %q: %s", out, err.Error()))
		return exitUsage
	}

	// The hash of the bytes on disk, computed here rather than echoed from the
	// API: comparing the two is the whole point of writing the file.
	digest := sha256Hex(buffer)

	// Best effort: the record is worth printing, but a failure to read it must
	// not turn a successful download into an error.
	var record map[string]any
	if resp, err := ctx.client.get("/v1/evidence/"+pathEscape(id), nil); err == nil {
		record = asMap(resp.data)
	}

	if ctx.flags.boolean("json") {
		var matchesRecord any
		if checksum := strField(record, "checksum"); checksum != "" {
			matchesRecord = checksum == digest
		}
		var verificationURL any
		if u := strField(record, "verification_url"); u != "" {
			verificationURL = u
		}
		jsonOut(map[string]any{
			"file":             out,
			"bytes":            len(buffer),
			"sha256":           digest,
			"matches_record":   matchesRecord,
			"verification_url": verificationURL,
		})
		return exitOK
	}

	matches := "not checked"
	if checksum := strField(record, "checksum"); checksum != "" {
		if checksum == digest {
			matches = "yes"
		} else {
			matches = "no"
		}
	}
	renderKV([]kvField{
		{"wrote", out},
		{"bytes", len(buffer)},
		{"sha-256", digest},
		{"matches record", matches},
	}, 0)
	if verificationURL := strField(record, "verification_url"); verificationURL != "" {
		write("\nverify   " + verificationURL)
	}
	verificationID := strField(record, "verification_id")
	if verificationID == "" {
		verificationID = "<verification-id>"
	}
	hint(fmt.Sprintf("\nThe record proves what these bytes must hash to. Check them from the record side with:\n  reliastra verify %s --file %s", verificationID, out), ctx.flags)
	return exitOK
}

// sha256Hex returns the hex SHA-256 of the bytes.
func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

/* ── verify ─────────────────────────────────────────────────────────────── */

// cmdVerify checks an artifact against the public verification record.
//
// This command is unauthenticated on purpose - the whole scenario it serves is
// a person who was handed a document and has no RELIASTRA account. It fails
// closed: a missing record, a hash mismatch, or an unreachable service all
// leave the exit code at 4, and only an exact match returns 0.
func cmdVerify(ctx *commandContext) int {
	verificationID := ctx.flags.str("id")
	if verificationID == "" && len(ctx.args) > 0 {
		verificationID = ctx.args[0]
	}
	if verificationID == "" {
		writeError("verification id required")
		write("usage: reliastra verify <verification-id> [--file document.pdf] [--expect-hash <sha256>]")
		write("the id is printed in the artifact footer and encoded in its QR code; `reliastra evidence show <report-id>` prints it too.")
		return exitUsage
	}

	// 404 and 503 are answers to the verification question, not transport
	// failures: "no record" and "cannot check right now" are both cases where the
	// claim did not hold and the exit code must say so. Only 5xx that are not the
	// documented degraded response, or a network failure, propagate as errors.
	public := ctx.client.withoutAuth()
	status := 0
	record := map[string]any{}
	resp, err := public.getNoRefresh("/v1/verify/"+pathEscape(verificationID), nil)
	if err == nil {
		status = resp.statusCode
		record = asMap(resp.data)
	} else {
		switch apiErrStatus(err) {
		case 404:
			status = 404
			record = errorBodyWithFound(err, false, false)
		case 503:
			status = 503
			record = errorBodyWithFound(err, false, true)
		default:
			return reportError(err)
		}
	}

	found := record["found"] == true
	degraded := status == 503 || record["service_degraded"] == true
	problems := []string{}
	if !found && degraded {
		problems = append(problems, "the verification service could not be read, so this record could not be checked")
	} else if !found {
		problems = append(problems, "no verification record exists for this id")
	}

	// ── Local checks, when the caller supplied something to check against ──
	//
	// Only the rendered document is re-hashed here, and only against the
	// checksum the record publishes. The payload hash (data_hash) covers the
	// canonical serialisation of the facts, and the record does not publish a
	// checksum for any payload file, so a "check" of a JSON file this CLI
	// re-serialised itself would be our own encoder agreeing with itself - and
	// would report a mismatch on any float whose shortest representation differs
	// from Python's. Claiming a verification that can produce false accusations
	// is worse than not offering it.
	recomputed := ""
	if ctx.flags.has("file") {
		buffer, err := os.ReadFile(ctx.flags.str("file"))
		if err != nil {
			writeError(fmt.Sprintf("could not read --file %q: %s", ctx.flags.str("file"), err.Error()))
			return exitUsage
		}
		recomputed = sha256Hex(buffer)
		if strField(record, "report_checksum") == "" {
			problems = append(problems, "the record carries no document checksum to compare against")
		} else if strField(record, "report_checksum") != recomputed {
			problems = append(problems, "the file on disk does not match the checksum on the record")
		}
	}
	if expectHash := ctx.flags.str("expectHash"); expectHash != "" {
		// A vacuous assertion must not pass: `--expect-hash` against a record
		// that carries no data hash is a claim that did not hold, not a match.
		if strField(record, "data_hash") == "" {
			problems = append(problems, "the record carries no data hash to compare against")
		} else if expectHash != strField(record, "data_hash") {
			problems = append(problems, "the expected data hash does not match the record")
		}
	}

	ok := found && len(problems) == 0

	if ctx.flags.boolean("json") {
		var local any
		if ctx.flags.has("file") {
			local = map[string]any{"file": ctx.flags.str("file"), "sha256": recomputed}
		}
		jsonOut(map[string]any{
			"verification_id": verificationID,
			"found":           found,
			"ok":              ok,
			"problems":        problems,
			"record":          record,
			"local":           local,
		})
		if ok {
			return exitOK
		}
		return exitUnverified
	}

	if status == 503 {
		writeError("the verification service is temporarily unavailable - this is not a statement about the record")
		return exitUnverified
	}

	if ok {
		heading("verification record found")
	} else {
		heading("verification did not hold")
	}
	if found {
		authenticity := asMap(record["authenticity"])
		retention := asMap(record["retention"])
		rendering := asMap(record["rendering"])
		renderKV([]kvField{
			{"verification id", verificationID},
			{"incident", strField(record, "incident_id")},
			{"dependency", strField(record, "dependency_id")},
			{"window", fmt.Sprintf("%s → %s", orDash(cliTime(field(asMap(record["time_window"]), "start"))), orDash(cliTime(field(asMap(record["time_window"]), "end"))))},
			{"data hash", strField(record, "data_hash")},
			{"document checksum", strField(record, "report_checksum")},
			{"methodology", strField(record, "methodology_version")},
			{"signed", signedAuthenticityLine(authenticity)},
			{"public keys", field(authenticity, "public_keys")},
			{"retention", retentionLine(retention)},
			{"renderer", field(rendering, "renderer")},
		}, 0)
	}
	if recomputed != "" {
		heading("local file")
		matches := "no"
		if strField(record, "report_checksum") == recomputed {
			matches = "yes"
		}
		renderKV([]kvField{
			{"file", ctx.flags.str("file")},
			{"sha-256", recomputed},
			{"matches record", matches},
		}, 0)
	}
	if len(problems) > 0 {
		writeError("")
		for _, problem := range problems {
			writeError("  " + problem)
		}
	}
	write("")
	write("The record proves what the payload must hash to. It does not restate the incident.")
	if ok {
		return exitOK
	}
	return exitUnverified
}

// errorBodyWithFound builds the record for a 404/503 verification answer:
// the found/degraded markers, overlaid with whatever object the error body
// carried.
func errorBodyWithFound(err error, found, degraded bool) map[string]any {
	record := map[string]any{"found": found}
	if degraded {
		record["service_degraded"] = true
	}
	if apiErr, ok := asAPIError(err); ok {
		if body, ok := apiErr.body.(map[string]any); ok {
			for key, value := range body {
				record[key] = value
			}
		}
	}
	return record
}

// signedAuthenticityLine renders the verification record's signature state.
func signedAuthenticityLine(authenticity map[string]any) string {
	if signed, ok := authenticity["signed"].(bool); ok && signed {
		if alg := strField(authenticity, "algorithm"); alg != "" {
			return fmt.Sprintf("yes (%s)", alg)
		}
		return "yes"
	}
	return "no — this deployment issues unsigned artifacts and the document says so"
}

// retentionLine renders the retention state: expiry, horizon, or not recorded.
func retentionLine(retention map[string]any) string {
	if expired, ok := retention["expired"].(bool); ok && expired {
		return "expired " + orDash(cliTime(field(retention, "expires_at")))
	}
	if expires := cliTime(field(retention, "expires_at")); expires != "" {
		return "until " + expires
	}
	return "not recorded"
}

/* ── keys ───────────────────────────────────────────────────────────────── */

func cmdKeys(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		return listKeys(ctx)
	}
	sub, rest := ctx.args[0], ctx.args[1:]
	subCtx := &commandContext{flags: ctx.flags, args: rest, client: ctx.client, session: ctx.session, env: ctx.env}
	switch sub {
	case "list":
		return listKeys(ctx)
	case "create":
		return createKey(subCtx)
	case "rm", "remove", "revoke":
		return removeKey(subCtx)
	default:
		return unknownSubcommand("keys", sub, "keys list | keys create <name> | keys rm <id>")
	}
}

func listKeys(ctx *commandContext) int {
	resp, err := ctx.client.get("/v1/api-keys", nil)
	if err != nil {
		return reportError(err)
	}
	items := listOf(resp.data)
	if ctx.flags.boolean("json") {
		jsonOut(items)
		return exitOK
	}
	renderTable(items, []tableColumn{
		{"name", 0, func(k any) any { return strField(k, "name") }},
		{"id", 8, func(k any) any { return strField(k, "id") }},
		{"prefix", 0, func(k any) any { return strField(k, "prefix") }},
		{"scopes", 44, func(k any) any { return joinList(field(k, "scopes"), ",") }},
		{"last used", 0, func(k any) any { return cliTime(field(k, "last_used_at")) }},
		{"expires", 0, func(k any) any { return cliTime(field(k, "expires_at")) }},
	}, "no API keys — `reliastra keys create ci-deploy`")
	if len(items) > 0 {
		hint("a key is shown once at creation and can be revoked without touching your session.", ctx.flags)
	}
	return exitOK
}

func createKey(ctx *commandContext) int {
	name := ""
	if len(ctx.args) > 0 {
		name = ctx.args[0]
	}
	if name == "" {
		name = ctx.flags.str("name")
	}
	if name == "" {
		writeError("a key name is required")
		write("usage: reliastra keys create <name> [--scopes read:checks,read:incidents]")
		return exitUsage
	}
	body := map[string]any{"name": name}
	if ctx.flags.has("scopes") {
		scopes := []string{}
		for _, part := range strings.Split(ctx.flags.str("scopes"), ",") {
			scopes = append(scopes, strings.TrimSpace(part))
		}
		body["scopes"] = scopes
	}
	resp, err := ctx.client.post("/v1/api-keys", body)
	if err != nil {
		return reportError(err)
	}
	data := asMap(resp.data)
	if ctx.flags.boolean("json") {
		jsonOut(data)
		return exitOK
	}
	renderKV([]kvField{
		{"name", strField(data, "name")},
		{"scopes", joinList(field(data, "scopes"), ", ")},
		{"key", strField(data, "full_key")},
	}, 0)
	write("\nthis is the only time the key is shown. Store it as a secret, not in a shell profile.")
	// The usage line carries the secret itself: it is the data, so it is
	// never suppressed - the key is shown exactly once.
	write(fmt.Sprintf("use it with: RELIASTRA_TOKEN=%s reliastra deps list", strField(data, "full_key")))
	return exitOK
}

func removeKey(ctx *commandContext) int {
	id := ""
	if len(ctx.args) > 0 {
		id = ctx.args[0]
	}
	if id == "" {
		id = ctx.flags.str("name")
	}
	if id == "" {
		writeError("key id required")
		write("usage: reliastra keys rm <key-id> [--yes]   (`reliastra keys list` shows the ids)")
		return exitUsage
	}
	if code := guardDestructive(ctx.flags, "API key "+id); code != exitOK {
		return code
	}

	if _, err := ctx.client.remove("/v1/api-keys/" + pathEscape(id)); err != nil {
		return reportError(err)
	}
	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{"revoked": id})
		return exitOK
	}
	write(fmt.Sprintf("revoked %s", id))
	write("any process using this key stops authenticating immediately.")
	return exitOK
}

/* ── obs ────────────────────────────────────────────────────────────────── */

 // cmdObs serves the public observatory. No credential is read or sent for
 // these calls.
func cmdObs(ctx *commandContext) int {
	if len(ctx.args) == 0 {
		return listObs(ctx)
	}
	sub, rest := ctx.args[0], ctx.args[1:]
	subCtx := &commandContext{flags: ctx.flags, args: rest, client: ctx.client, session: ctx.session, env: ctx.env}
	switch sub {
	case "list":
		return listObs(ctx)
	case "show":
		return showObs(subCtx)
	default:
		return unknownSubcommand("obs", sub, "obs list | obs show <vendor>")
	}
}

func listObs(ctx *commandContext) int {
	limit, err := flagInt(ctx.flags, "limit", 100, 0)
	if err != nil {
		writeError(err.Error())
		return exitUsage
	}
	public := ctx.client.withoutAuth()
	// The JSON catalogue. `/v1/feed/vendors` is the Atom/RSS feed of the same
	// data, and a CLI that parsed XML for a table would be a worse CLI.
	resp, err := public.get("/v1/vendors", map[string]string{"limit": strconv.Itoa(limit)})
	if err != nil {
		return reportError(err)
	}
	items := listOf(resp.data)
	if ctx.flags.boolean("json") {
		jsonOut(items)
		return exitOK
	}
	renderTable(items, []tableColumn{
		{"vendor", 0, func(v any) any { return strField(v, "vendor_name") }},
		{"category", 0, func(v any) any { return strField(v, "category") }},
		{"recent", 0, func(v any) any { return strField(v, "recent_status") }},
		{"latency", 0, func(v any) any { return ms(field(v, "latency_ms")) }},
		{"last observed", 0, func(v any) any { return cliTime(field(v, "last_check_at")) }},
	}, "the public index is empty — no vendor records are published right now")
	write("\nRecent status is derived from the five most recent observations and is a statement about this probe, not vendor-wide health.")
	return exitOK
}

func showObs(ctx *commandContext) int {
	vendor := ""
	if len(ctx.args) > 0 {
		vendor = ctx.args[0]
	}
	if vendor == "" {
		vendor = ctx.flags.str("vendor")
	}
	if vendor == "" {
		writeError("vendor name required")
		write("usage: reliastra obs show <vendor-name> [--web]")
		return exitUsage
	}
	public := ctx.client.withoutAuth()
	resp, err := public.get("/v1/vendors/"+pathEscape(vendor), nil)
	if err != nil {
		return reportError(err)
	}
	data := asMap(resp.data)
	if ctx.flags.boolean("json") {
		jsonOut(data)
		return exitOK
	}
	name := strField(data, "vendor_name")
	if name == "" {
		name = vendor
	}
	var endpoints []any
	if list, ok := field(data, "endpoints").([]any); ok {
		endpoints = list
	} else {
		endpoints = []any{}
	}
	renderKV([]kvField{
		{"vendor", name},
		{"display name", strField(data, "display_name")},
		{"category", strField(data, "category")},
		{"endpoints", len(endpoints)},
		{"recent status", strField(data, "recent_status")},
		{"last observed", cliTime(field(data, "last_check_at"))},
	}, 0)
	if len(endpoints) > 0 {
		heading("endpoints")
		renderTable(endpoints, []tableColumn{
			{"url", 56, func(e any) any { return strField(e, "endpoint_url") }},
			{"health", 0, func(e any) any { return strField(e, "health_status") }},
			{"last observed", 0, func(e any) any { return cliTime(field(e, "last_check_at")) }},
		}, "")
	}
	if ctx.flags.boolean("web") || !ctx.flags.boolean("quiet") {
		write("\npage     " + webUrls(ctx.session.siteURL).vendor(name))
	}
	return exitOK
}
