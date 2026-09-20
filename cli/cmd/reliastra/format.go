// Value formatting shared by the commands.
//
// The API decodes into untyped values (objects, arrays, strings, numbers,
// booleans, null), and every renderer below treats a missing value as `—`.
// Helpers return "" for "not present" so table cells and kv rows render the
// dash; composed strings (a window, a severity/status pair) use orDash for
// each part, so a missing half never prints as `null`.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// asMap reads an object value, tolerating anything else as empty.
func asMap(v any) map[string]any {
	if obj, ok := v.(map[string]any); ok {
		return obj
	}
	return map[string]any{}
}

// field reads one key out of an object value, or nil when absent.
func field(obj any, key string) any {
	return asMap(obj)[key]
}

// strField reads one string field out of an object value, or "".
func strField(obj any, key string) string {
	s, _ := field(obj, key).(string)
	return s
}

// numField reads one numeric field out of an object value.
func numField(obj any, key string) (float64, bool) {
	return asNumber(field(obj, key))
}

// asNumber reads a numeric value in whatever shape decoding produced.
func asNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}

// listOf unwraps a list response: a bare array, or the `items` (or `data`)
// member of an envelope. Anything else is an empty list, not an error.
func listOf(data any) []any {
	if list, ok := data.([]any); ok {
		return list
	}
	if obj, ok := data.(map[string]any); ok {
		if items, ok := obj["items"].([]any); ok {
			return items
		}
		if items, ok := obj["data"].([]any); ok {
			return items
		}
	}
	return []any{}
}

// orDash renders one half of a composed string: the value, or `—`.
func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

// cliTime renders an ISO timestamp as `2026-09-18 10:00:00Z`: the `T`
// becomes a space and fractional seconds are dropped. Missing or
// non-string values render as "" so the caller can show `—`.
func cliTime(v any) string {
	s, ok := v.(string)
	if !ok || s == "" {
		return ""
	}
	s = strings.Replace(s, "T", " ", 1)
	if i := strings.Index(s, "."); i >= 0 {
		s = s[:i] + "Z"
	}
	return s
}

// ms renders milliseconds as `212 ms`, or "" when missing.
func ms(v any) string {
	n, ok := asNumber(v)
	if !ok {
		return ""
	}
	return strconv.FormatInt(int64(math.Round(n)), 10) + " ms"
}

// yesNo renders a boolean as `yes`/`no`, or "" when missing.
func yesNo(v any) string {
	b, ok := v.(bool)
	if !ok {
		return ""
	}
	if b {
		return "yes"
	}
	return "no"
}

// interval renders seconds as a compact duration: 60 → 1m, 300 → 5m,
// 86400 → 24h. Missing or zero renders as "".
func interval(v any) string {
	n, ok := asNumber(v)
	if !ok || n == 0 {
		return ""
	}
	if n < 60 {
		return strconv.FormatFloat(n, 'f', -1, 64) + "s"
	}
	if n < 3600 {
		return strconv.FormatInt(int64(math.Round(n/60)), 10) + "m"
	}
	return strconv.FormatInt(int64(math.Round(n/3600)), 10) + "h"
}

// kib renders a byte count as `12 KiB`, or "" when missing.
func kib(v any) string {
	n, ok := asNumber(v)
	if !ok {
		return ""
	}
	return strconv.FormatInt(int64(math.Round(n/1024)), 10) + " KiB"
}

// joinList renders a string list with the separator, tolerating a missing
// or non-list value as "".
func joinList(v any, sep string) string {
	list, ok := v.([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(list))
	for _, item := range list {
		parts = append(parts, fmt.Sprint(item))
	}
	return strings.Join(parts, sep)
}

// flagInt reads a numeric flag with a default and a minimum. A value that
// is not a number, or below the minimum, is a usage error that names the
// flag: the API must never receive `limit=true` because a value was
// forgotten, or `expected_status_codes: [null]` because a code was mistyped.
func flagInt(flags flagSet, name string, def, min int) (int, error) {
	raw := flags.str(name)
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, fmt.Errorf("invalid --%s: %q is not a whole number", dashed(name), raw)
	}
	if n < min {
		return 0, fmt.Errorf("invalid --%s: want %d or more, got %d", dashed(name), min, n)
	}
	return n, nil
}

// flagExpectCodes reads `--expect` as a list of HTTP status codes, or nil
// when the flag was not passed.
func flagExpectCodes(flags flagSet) ([]int, error) {
	raw := flags.str("expect")
	if raw == "" {
		return nil, nil
	}
	codes := []int{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		n, err := strconv.Atoi(part)
		if err != nil || n < 100 || n > 599 {
			return nil, fmt.Errorf("invalid --expect: %q is not a status code (want 100-599)", part)
		}
		codes = append(codes, n)
	}
	return codes, nil
}
