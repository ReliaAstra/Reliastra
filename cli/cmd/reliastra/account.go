// Session commands: login, logout, whoami.
//
// `login` takes the password from an interactive prompt or from
// `RELIASTRA_PASSWORD` so it can run in a container, and never from a flag:
// a password on a command line lands in shell history and in every process
// listing on the machine.
package main

import (
	"fmt"
)

// cmdLogin stores a session (or an API key) on this machine.
func cmdLogin(ctx *commandContext) int {
	// `login --token <key>` stores a programmatic key instead of opening a
	// session. The key is checked before it is written - storing a credential
	// that does not work is how somebody ends up debugging their config at 2am
	// when the answer is that the key was revoked.
	if ctx.flags.has("token") {
		if ctx.flags.has("email") {
			writeError("--token and --email are different credentials; pass one.")
			return exitUsage
		}
		probe := newClient(ctx.client.apiURL, ctx.flags.str("token"), ctx.env, false)
		if _, err := probe.getNoRefresh("/v1/dependencies", map[string]string{"limit": "1"}); err != nil {
			switch apiErrStatus(err) {
			case 403:
				writeError(fmt.Sprintf("that key is valid but cannot read dependencies: %s", err.Error()))
				writeError("issue one that can: `reliastra keys create <name> --scopes read:dependencies,read:checks,read:incidents,read:evidence`")
				return exitDenied
			case 401:
				writeError("that key was rejected by the API. Check it has not been revoked.")
				return exitAuth
			default:
				return reportError(err)
			}
		}
		token := ctx.flags.str("token")
		apiURL := ctx.client.apiURL
		path := saveConfig(ctx.env, func(config *storedConfig) {
			// A credential switch replaces the credential, not the settings:
			// the session is cleared, the operator's site_url survives.
			config.APIURL = apiURL
			config.APIKey = token
			config.Email = ""
			config.AccessToken = ""
			config.RefreshToken = ""
		})
		if ctx.flags.boolean("json") {
			jsonOut(map[string]any{"stored": path, "api_url": apiURL})
			return exitOK
		}
		write(fmt.Sprintf("stored an API key in %s (mode 0600)", path))
		write("the key is sent as a bearer credential and is never refreshed: revoke it with `reliastra keys rm <id>`.")
		return exitOK
	}

	email := ctx.flags.str("email")
	if email == "" && len(ctx.args) > 0 {
		email = ctx.args[0]
	}
	if email == "" {
		email = ctx.env["RELIASTRA_EMAIL"]
	}
	if email == "" {
		writeError("email required: `reliastra login --email you@example.com`")
		return exitUsage
	}
	// An absent variable prompts; a present-but-empty one does not. The
	// distinction is the caller's way of saying "not interactive, use this".
	password, hasPassword := ctx.env["RELIASTRA_PASSWORD"]
	if !hasPassword {
		answer, err := promptSecret("password: ")
		if err != nil {
			writeError("could not read the password.")
			return exitUsage
		}
		password = answer
	}
	if password == "" {
		writeError("password required (or set RELIASTRA_PASSWORD)")
		return exitUsage
	}

	resp, err := ctx.client.post("/v1/auth/login", map[string]string{"email": email, "password": password})
	if err != nil {
		return reportError(err)
	}
	data := asMap(resp.data)
	apiURL := ctx.client.apiURL
	path := saveConfig(ctx.env, func(config *storedConfig) {
		config.APIURL = apiURL
		config.Email = email
		config.AccessToken = strField(data, "access_token")
		config.RefreshToken = strField(data, "refresh_token")
		config.APIKey = ""
	})

	// `--print-token` writes the access token alone on stdout, for piping into
	// another tool on this machine (`gh auth token`-style). It is explicit
	// because a token on stdout can end up in a log; the warning goes to stderr
	// so a pipeline that captures stdout gets only the token.
	if ctx.flags.boolean("printToken") {
		write(strField(data, "access_token"))
		writeError("the access token is on stdout; the session is also stored on this machine. Treat it as a credential.")
		return exitOK
	}

	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{
			"stored":     path,
			"api_url":    apiURL,
			"email":      email,
			"expires_in": field(data, "expires_in"),
		})
		return exitOK
	}
	write(fmt.Sprintf("signed in as %s", email))
	write(fmt.Sprintf("session stored in %s (mode 0600)", path))
	write(fmt.Sprintf("token expires in %vs; it is refreshed automatically on use", missingCell(field(data, "expires_in"))))
	write("")
	write("next: `reliastra deps list`, or `reliastra doctor` if anything looks wrong.")
	return exitOK
}

// cmdLogout revokes the session and removes it locally.
func cmdLogout(ctx *commandContext) int {
	// Best effort: the server-side revoke is worth attempting, but a failed
	// network call must not leave a token sitting on disk because the CLI
	// refused to finish the job.
	_, _ = ctx.client.post("/v1/auth/logout", map[string]string{})
	path := clearConfig(ctx.env)
	write(fmt.Sprintf("signed out; removed %s", path))
	return exitOK
}

// cmdWhoami shows the account this invocation resolves to.
func cmdWhoami(ctx *commandContext) int {
	// Two kinds of credential can be in play, and they are authorised
	// differently. A session token resolves to a user and an account. An API key
	// deliberately cannot: identity and account surfaces are unmapped for keys
	// ("deny by default"), so asking for them answers 403 - which is the API
	// being correct, not a broken credential. Reporting that as "authentication
	// required" would send someone to re-login for a problem re-login cannot fix.
	keyCredential := isAPIKey(ctx.session.token)

	var user any
	denied := false
	if !keyCredential {
		resp, err := ctx.client.get("/v1/users/me", nil)
		if err != nil {
			if apiErrStatus(err) != 403 {
				return reportError(err)
			}
			denied = true
		} else {
			user = resp.data
		}
	}

	if keyCredential || denied {
		prefix := "—"
		if ctx.session.token != "" {
			shown := ctx.session.token
			if len(shown) > 8 {
				shown = shown[:8]
			}
			prefix = shown + "…"
		}
		if ctx.flags.boolean("json") {
			jsonOut(map[string]any{
				"credential":        "api_key",
				"key_prefix":        prefix,
				"account":           nil,
				"note":              "API keys cannot read account or identity surfaces; sign in for those.",
				"api_url":           ctx.client.apiURL,
				"credential_source": ctx.session.source,
			})
			return exitOK
		}
		renderKV([]kvField{
			{"credential", "API key " + prefix},
			{"account", "— not readable with an API key (identity surfaces are session-only by design)"},
			{"scopes", "— the API does not expose a key’s own scopes to that key"},
			{"api", ctx.client.apiURL},
			{"source", "from " + ctx.session.source},
		}, 0)
		write("\n`reliastra login` stores a session when you need account context.")
		return exitOK
	}

	var orgs []any
	if resp, err := ctx.client.get("/v1/orgs", nil); err == nil {
		orgs = listOf(resp.data)
	} else {
		orgs = []any{}
	}
	var org any
	if len(orgs) > 0 {
		org = orgs[0]
	}

	if ctx.flags.boolean("json") {
		jsonOut(map[string]any{
			"user":              user,
			"organization":      org,
			"api_url":           ctx.client.apiURL,
			"credential_source": ctx.session.source,
		})
		return exitOK
	}
	verified := "no"
	if active, ok := field(user, "is_active").(bool); ok && active {
		verified = "yes"
	}
	renderKV([]kvField{
		{"account", strField(user, "email")},
		{"name", strField(user, "full_name")},
		{"verified", verified},
		{"organization", strField(org, "name")},
		{"api", ctx.client.apiURL},
		{"credential", credentialSourceLine(ctx.session.source)},
	}, 0)
	return exitOK
}

// credentialSourceLine renders where the credential came from, or `—`.
func credentialSourceLine(source string) string {
	if source == "none" {
		return "—"
	}
	return "from " + source
}
