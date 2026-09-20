// Credential and endpoint resolution.
//
// Precedence, highest first:
//
//	explicit CLI flags      (--api-url, --token)
//	environment             (RELIASTRA_API_URL, RELIASTRA_TOKEN)
//	the config file         (~/.config/reliastra/config.json)
//	the documented default  (https://api.reliastra.com)
//
// The config file holds a refresh token, so it is written with mode 0600 and
// the containing directory with 0700. On a platform where those modes are not
// enforced, `reliastra login` says so rather than implying a protection that
// does not exist.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// defaultAPIURL is the production API base.
const defaultAPIURL = "https://api.reliastra.com"

// defaultSiteURL is the web application's origin.
//
// Commands that identify a resource print the page where a person can read
// it, because the CLI and the web console are two views of the same record
// rather than two products. The default is the production site; a self-hosted
// deployment or a local development server overrides it with `--site-url`,
// RELIASTRA_SITE_URL or `site_url` in the config file.
const defaultSiteURL = "https://reliastra.com"

// configPath returns the XDG-style config location, so a container can
// redirect it in one variable.
func configPath(env map[string]string) string {
	if override := env["RELIASTRA_CONFIG"]; override != "" {
		return override
	}
	base := env["XDG_CONFIG_HOME"]
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil || home == "" {
			home = os.Getenv("HOME")
		}
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "reliastra", "config.json")
}

// storedConfig is the config file's shape. A stored API key is its own
// field, not an `access_token`: the two are refreshed differently, and a key
// written over a session (or the reverse) would silently change which
// credential a later command sends.
type storedConfig struct {
	APIURL       string `json:"api_url,omitempty"`
	SiteURL      string `json:"site_url,omitempty"`
	Email        string `json:"email,omitempty"`
	APIKey       string `json:"api_key,omitempty"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

// readConfig loads the config file. A missing or corrupt file yields an
// empty config: a corrupt config must not wedge every command. The caller
// falls back to environment/defaults and `reliastra login` overwrites it.
func readConfig(env map[string]string) storedConfig {
	var config storedConfig
	raw, err := os.ReadFile(configPath(env))
	if err != nil {
		return config
	}
	var parsed storedConfig
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return config
	}
	return parsed
}

// saveConfig applies mutate to the stored config and writes it back,
// preserving every field the caller did not touch. A token rotation must
// never drop the operator's `site_url`, and storing a credential must never
// drop unrelated settings.
func saveConfig(env map[string]string, mutate func(*storedConfig)) string {
	path := configPath(env)
	config := readConfig(env)
	mutate(&config)
	raw, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return path
	}
	raw = append(raw, '\n')
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	_ = os.WriteFile(path, raw, 0o600)
	// Best effort: Windows and some mounted filesystems ignore these modes;
	// the note on stderr is handled by the login command, not here.
	_ = os.Chmod(filepath.Dir(path), 0o700)
	_ = os.Chmod(path, 0o600)
	return path
}

// clearConfig removes the stored credential, if any.
func clearConfig(env map[string]string) string {
	path := configPath(env)
	_ = os.Remove(path)
	return path
}

// session is the resolved session for one invocation. Source records where
// the credential came from - "which token am I using" is the first question
// in a support thread, and guessing at it wastes everyone's time.
type session struct {
	apiURL  string
	siteURL string
	token   string
	source  string
	config  storedConfig
}

// resolveSession applies the documented precedence to flags, environment
// and the config file.
func resolveSession(flags flagSet, env map[string]string) session {
	file := readConfig(env)
	apiURL := firstNonEmpty(flags.str("apiUrl"), env["RELIASTRA_API_URL"], file.APIURL, defaultAPIURL)
	siteURL := firstNonEmpty(flags.str("siteUrl"), env["RELIASTRA_SITE_URL"], file.SiteURL, defaultSiteURL)
	apiURL = strings.TrimRight(apiURL, "/")
	siteURL = strings.TrimRight(siteURL, "/")

	if token := flags.str("token"); token != "" {
		return session{apiURL: apiURL, siteURL: siteURL, token: token, source: "flag", config: file}
	}
	if token := env["RELIASTRA_TOKEN"]; token != "" {
		return session{apiURL: apiURL, siteURL: siteURL, token: token, source: "environment", config: file}
	}
	if file.APIKey != "" {
		return session{apiURL: apiURL, siteURL: siteURL, token: file.APIKey, source: "config (api key)", config: file}
	}
	if file.AccessToken != "" {
		return session{apiURL: apiURL, siteURL: siteURL, token: file.AccessToken, source: "config", config: file}
	}
	return session{apiURL: apiURL, siteURL: siteURL, token: "", source: "none", config: file}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// siteLinks builds web URLs for the resources the CLI can identify.
//
// One place, so `--web`, `reliastra open` and the hints printed after a
// command cannot drift apart. Every path here is a route that exists in the
// web application.
type siteLinks struct {
	base string
}

func webUrls(siteURL string) siteLinks {
	return siteLinks{base: strings.TrimRight(siteURL, "/")}
}

func (s siteLinks) dashboard() string { return s.base + "/dashboard" }
func (s siteLinks) dependency(id string) string { return s.base + "/dependencies/" + pathEscape(id) }
func (s siteLinks) incident(id string) string { return s.base + "/incidents/" + pathEscape(id) }
func (s siteLinks) evidence(id string) string { return s.base + "/evidence/" + pathEscape(id) }
func (s siteLinks) verification(id string) string { return s.base + "/reports/" + pathEscape(id) }
func (s siteLinks) observatory() string { return s.base + "/observatory" }
func (s siteLinks) vendor(name string) string { return s.base + "/observatory/" + pathEscape(name) }
func (s siteLinks) docs(slug string) string {
	if slug == "" {
		return s.base + "/docs"
	}
	return s.base + "/docs/" + slug
}
func (s siteLinks) quickstart() string { return s.base + "/docs/quickstart" }
func (s siteLinks) methodology() string { return s.base + "/docs/methodology" }
func (s siteLinks) product() string { return s.base + "/product" }
func (s siteLinks) evidenceProduct() string { return s.base + "/product/evidence" }
