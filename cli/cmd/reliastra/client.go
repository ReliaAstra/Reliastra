// The HTTP layer.
//
// Two properties matter more than convenience here. A failure is an error,
// not an empty result: the API returns `{"items": []}` for "you have no
// dependencies" and 401 for "your token expired", and a CLI that prints an
// empty table for both teaches its user to distrust it. Status codes are
// mapped onto typed errors instead, and non-2xx responses never reach
// a renderer.
//
// A 401 on an access token is retried once with the refresh token, and the
// rotated pair is persisted. Short access-token lifetimes are normal;
// forcing a re-login every fifteen minutes is not.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// httpTimeout bounds every request, including artifact downloads. A CLI that
// hangs forever on a black-holed connection hangs the CI job around it.
const httpTimeout = 30 * time.Second

// pathEscape escapes one path segment (an id or a vendor name).
func pathEscape(segment string) string {
	return url.PathEscape(segment)
}

// isAPIKey reports whether a credential is a programmatic API key rather
// than a session token.
//
// The distinction matters because the two are authorised differently: the API
// deliberately denies identity and account surfaces to keys ("deny by default
// for anything not mapped to a scope"), so a caller that treats a key like a
// session reports the API's correct refusal as an authentication failure. Keys
// are issued as `rel_` plus hex characters; nothing else uses that prefix.
func isAPIKey(token string) bool {
	if !strings.HasPrefix(token, "rel_") {
		return false
	}
	rest := token[len("rel_"):]
	if len(rest) < 8 {
		return false
	}
	for _, r := range rest {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F') {
			return false
		}
	}
	return true
}

// apiError is a failed API call: the message already reads as a sentence,
// and the status/body/request id let the caller classify it.
type apiError struct {
	message   string
	status    int
	code      string
	body      any
	requestID string
}

func (e *apiError) Error() string { return e.message }

// authError is a 401 or 403: the credential was rejected, expired, or lacks
// a scope. The status distinguishes "log in again" (401) from "this call is
// not permitted" (403).
type authError struct{ apiError }

// networkError is a request that never got an answer: DNS, refused
// connection, TLS, or the timeout.
type networkError struct{ apiError }

// asAPIError unwraps any of the three error types to the shared payload.
func asAPIError(err error) (*apiError, bool) {
	switch e := err.(type) {
	case *apiError:
		return e, true
	case *authError:
		return &e.apiError, true
	case *networkError:
		return &e.apiError, true
	default:
		return nil, false
	}
}

// apiErrStatus returns the HTTP status carried by an API error, or 0.
func apiErrStatus(err error) int {
	if apiErr, ok := asAPIError(err); ok {
		return apiErr.status
	}
	return 0
}

func isAuthError(err error) bool {
	_, ok := err.(*authError)
	return ok
}

func isNetworkError(err error) bool {
	_, ok := err.(*networkError)
	return ok
}

// detailFrom renders a human-readable message for an API error body,
// whatever shape it took.
func detailFrom(body any, status int) string {
	fallback := fmt.Sprintf("request failed with status %d", status)
	if body == nil {
		return fallback
	}
	switch b := body.(type) {
	case string:
		return b
	case map[string]any:
		if detail, ok := b["detail"].(string); ok {
			return detail
		}
		if details, ok := b["detail"].([]any); ok {
			// Pydantic validation errors: "endpoint_url: must start with http://"
			parts := make([]string, 0, len(details))
			for _, item := range details {
				entry, _ := item.(map[string]any)
				if entry == nil {
					continue
				}
				msg, _ := entry["msg"].(string)
				where := []string{}
				if loc, ok := entry["loc"].([]any); ok {
					for _, p := range loc {
						s := fmt.Sprint(p)
						if s != "" && s != "body" {
							where = append(where, s)
						}
					}
				}
				if len(where) > 0 {
					parts = append(parts, strings.Join(where, ".")+": "+msg)
				} else if msg != "" {
					parts = append(parts, msg)
				}
			}
			if len(parts) > 0 {
				return strings.Join(parts, "; ")
			}
			return fallback
		}
		if message, ok := b["error"].(string); ok {
			return message
		}
		if message, ok := b["message"].(string); ok {
			return message
		}
		return fallback
	default:
		return fallback
	}
}

// apiClient talks to one API base with one credential (or none).
type apiClient struct {
	apiURL  string
	env     map[string]string
	persist bool
	http    *http.Client

	// Guarded: one command fans out to concurrent requests, and two
	// simultaneous refreshes must not interleave.
	mu           sync.Mutex
	token        string
	refreshToken string
}

// newClient builds a client. persist controls whether a rotated token pair
// is written back to the config file (--no-persist disables it).
func newClient(apiURL, token string, env map[string]string, persist bool) *apiClient {
	return &apiClient{
		apiURL:  strings.TrimRight(apiURL, "/"),
		token:   token,
		env:     env,
		persist: persist,
		http:    &http.Client{Timeout: httpTimeout},
	}
}

// withoutAuth returns a client that sends no credential. The public
// surfaces (verify, the observatory) use it: their records are public, so
// sending an ambient session would only attach an identity to a call that
// must not have one. It shares the transport and builds fresh credential
// state rather than copying the struct, which would copy the mutex.
func (c *apiClient) withoutAuth() *apiClient {
	return &apiClient{apiURL: c.apiURL, env: c.env, persist: c.persist, http: c.http}
}

// credentials snapshots the tokens under the mutex.
func (c *apiClient) credentials() (token, refresh string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.token, c.refreshToken
}

// apiURLFor joins the base URL and a path.
func (c *apiClient) apiURLFor(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return c.apiURL + path
}

// apiResponse is a decoded API answer: the raw body, the decoded data (nil
// for an empty body), and the status code.
type apiResponse struct {
	data       any
	statusCode int
}

func decodeBody(raw []byte) any {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var data any
	if err := decoder.Decode(&data); err != nil {
		return string(raw)
	}
	return data
}

// request performs one JSON request. A 401 retries once through the refresh
// token (unless retryOnAuth is false); any other non-2xx becomes a typed
// error. Query values that are empty are omitted.
func (c *apiClient) request(path, method string, body any, query map[string]string, headers map[string]string, retryOnAuth bool) (*apiResponse, error) {
	token, refresh := c.credentials()
	target := c.apiURLFor(path)
	if len(query) > 0 {
		params := url.Values{}
		for key, value := range query {
			if value == "" {
				continue
			}
			params.Set(key, value)
		}
		if encoded := params.Encode(); encoded != "" {
			target += "?" + encoded
		}
	}

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, &apiError{message: fmt.Sprintf("could not encode request: %s", err.Error()), code: "api_error"}
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, target, reader)
	if err != nil {
		return nil, &networkError{apiError{message: fmt.Sprintf("could not reach %s (%s)", c.apiURL, err.Error()), code: "network_error"}}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "reliastra-cli/"+versionString())
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, &networkError{apiError{message: fmt.Sprintf("could not reach %s (%s)", c.apiURL, err.Error()), code: "network_error"}}
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, &networkError{apiError{message: fmt.Sprintf("could not read the reply from %s (%s)", c.apiURL, err.Error()), code: "network_error"}}
	}

	requestID := resp.Header.Get("X-Request-Id")
	parsed := decodeBody(raw)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return &apiResponse{data: parsed, statusCode: resp.StatusCode}, nil
	}

	// One refresh attempt. A second 401 means the refresh token is dead too
	// and the operator must log in again - retrying a third time would only
	// hide it.
	if resp.StatusCode == 401 && retryOnAuth && refresh != "" {
		if rotated, refreshErr := c.refresh(); refreshErr == nil && rotated {
			return c.request(path, method, body, query, headers, false)
		}
	}

	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, &authError{apiError{message: detailFrom(parsed, resp.StatusCode), status: resp.StatusCode, code: "auth_required", body: parsed, requestID: requestID}}
	}
	return nil, &apiError{message: detailFrom(parsed, resp.StatusCode), status: resp.StatusCode, code: "api_error", body: parsed, requestID: requestID}
}

// get performs a GET request.
func (c *apiClient) get(path string, query map[string]string) (*apiResponse, error) {
	return c.request(path, http.MethodGet, nil, query, nil, true)
}

// getNoRefresh performs a GET request that must not trigger a token refresh:
// probes and public reads, where a 401 is the answer rather than a prompt.
func (c *apiClient) getNoRefresh(path string, query map[string]string) (*apiResponse, error) {
	return c.request(path, http.MethodGet, nil, query, nil, false)
}

// post performs a POST request with a JSON body.
func (c *apiClient) post(path string, body any) (*apiResponse, error) {
	return c.request(path, http.MethodPost, body, nil, nil, true)
}

// patch performs a PATCH request with a JSON body.
func (c *apiClient) patch(path string, body any) (*apiResponse, error) {
	return c.request(path, http.MethodPatch, body, nil, nil, true)
}

// remove performs a DELETE request.
func (c *apiClient) remove(path string) (*apiResponse, error) {
	return c.request(path, http.MethodDelete, nil, nil, nil, true)
}

// refresh exchanges the refresh token and persists the rotated pair. It
// reports false (rather than an error) when there is nothing to rotate with
// or the exchange fails: the caller turns that into "log in again".
func (c *apiClient) refresh() (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.refreshToken == "" {
		return false, nil
	}
	payload, err := json.Marshal(map[string]string{"refresh_token": c.refreshToken})
	if err != nil {
		return false, nil
	}
	req, err := http.NewRequest(http.MethodPost, c.apiURLFor("/v1/auth/refresh"), bytes.NewReader(payload))
	if err != nil {
		return false, nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "reliastra-cli/"+versionString())
	resp, err := c.http.Do(req)
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, nil
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, nil
	}
	var data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return false, nil
	}
	if data.AccessToken == "" {
		return false, nil
	}
	c.token = data.AccessToken
	if data.RefreshToken != "" {
		c.refreshToken = data.RefreshToken
	}
	if c.persist {
		apiURL, access, refresh := c.apiURL, c.token, c.refreshToken
		saveConfig(c.env, func(config *storedConfig) {
			config.APIURL = apiURL
			config.AccessToken = access
			config.RefreshToken = refresh
		})
	}
	return true, nil
}

// download fetches the raw bytes of a stored artifact (the evidence PDF). A
// 401 retries once through the refresh token, exactly like a JSON request:
// an expired access token must not turn a download into an error when every
// other command would have refreshed past it.
func (c *apiClient) download(path string) ([]byte, error) {
	return c.downloadAttempt(path, true)
}

func (c *apiClient) downloadAttempt(path string, retryOnAuth bool) ([]byte, error) {
	token, refresh := c.credentials()
	req, err := http.NewRequest(http.MethodGet, c.apiURLFor(path), nil)
	if err != nil {
		return nil, &networkError{apiError{message: fmt.Sprintf("could not reach %s (%s)", c.apiURL, err.Error()), code: "network_error"}}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "reliastra-cli/"+versionString())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, &networkError{apiError{message: fmt.Sprintf("could not reach %s (%s)", c.apiURL, err.Error()), code: "network_error"}}
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, &networkError{apiError{message: fmt.Sprintf("could not read the reply from %s (%s)", c.apiURL, err.Error()), code: "network_error"}}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return raw, nil
	}
	if resp.StatusCode == 401 && retryOnAuth && refresh != "" {
		if rotated, refreshErr := c.refresh(); refreshErr == nil && rotated {
			return c.downloadAttempt(path, false)
		}
	}
	parsed := decodeBody(raw)
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, &authError{apiError{message: detailFrom(parsed, resp.StatusCode), status: resp.StatusCode, code: "auth_required", body: parsed}}
	}
	return nil, &apiError{message: detailFrom(parsed, resp.StatusCode), status: resp.StatusCode, code: "api_error", body: parsed}
}
