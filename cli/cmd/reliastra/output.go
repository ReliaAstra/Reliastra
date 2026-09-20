// Output.
//
// Every command renders twice: once for a person (table, kv, line) and once
// for a program (`--json`). The rule that keeps the two honest is that
// `--json` writes the API's own shape - no renaming, no derived fields, no
// dropped nulls - so `reliastra ... --json | jq` behaves like the API call
// it stands for. Object keys print in alphabetical order, which keeps the
// output deterministic; the shape is unchanged.
//
// No colour is emitted. A CLI whose output is unreadable when piped into a
// file or a CI log is a CLI that gets its output re-parsed by hand.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf8"
)

// Output sinks.
//
// Commands never touch os.Stdout directly. A test replaces these to capture
// output, which is why this indirection exists rather than a clever trick
// around the global stream: patching the file descriptor also swallows the
// test reporter's own output, and a suite that hides its own failures is
// worse than no suite.
var (
	outSink io.Writer = os.Stdout
	errSink io.Writer = os.Stderr
)

// setOutput redirects the sinks; tests use it to capture output.
func setOutput(stdout, stderr io.Writer) {
	if stdout != nil {
		outSink = stdout
	}
	if stderr != nil {
		errSink = stderr
	}
}

// resetOutput restores the real streams.
func resetOutput() {
	outSink = os.Stdout
	errSink = os.Stderr
}

// write prints a line on standard output.
func write(text string) {
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
		}
	fmt.Fprint(outSink, text)
}

// writeError prints a line on standard error.
func writeError(text string) {
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	fmt.Fprint(errSink, text)
}

// jsonOut writes a value as indented JSON. HTML escaping is disabled: the
// API's own strings print verbatim rather than with `<` turned into \u003c.
func jsonOut(value any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(value); err != nil {
		writeError(fmt.Sprintf("could not encode output: %s", err.Error()))
		return
	}
	write(buf.String())
}

// tableColumn is one column of a fixed-width table: a header, an optional
// width cap, and how to read the cell out of a row.
type tableColumn struct {
	header string
	max    int
	value  func(row any) any
}

// missingCell renders a field the API did not return. It is never `0`,
// `unknown`, or `null`: those all claim a knowledge the CLI does not have.
func missingCell(value any) string {
	if value == nil {
		return "—"
	}
	switch v := value.(type) {
	case string:
		if v == "" {
			return "—"
		}
		return v
	case json.Number:
		return v.String()
	default:
		return fmt.Sprint(v)
	}
}

// renderTable prints a fixed-width column table. Widths follow the longest
// cell, capped per column (48 by default). Widths count runes, not bytes,
// so the `—` and `…` this renderer emits do not throw the padding off.
func renderTable(rows []any, columns []tableColumn, empty string) {
	if len(rows) == 0 {
		write(empty)
		return
	}
	cell := func(row any, col tableColumn) string {
		return missingCell(col.value(row))
	}
	widths := make([]int, len(columns))
	for i, col := range columns {
		longest := utf8.RuneCountInString(col.header)
		for _, row := range rows {
			if n := utf8.RuneCountInString(cell(row, col)); n > longest {
				longest = n
			}
		}
		cap := col.max
		if cap == 0 {
			cap = 48
		}
		if longest > cap {
			longest = cap
		}
		widths[i] = longest
	}

	line := func(values []string) string {
		padded := make([]string, len(values))
		for i, value := range values {
			text := value
			if utf8.RuneCountInString(text) > widths[i] {
				text = string([]rune(text)[:widths[i]-1]) + "…"
			}
			padded[i] = text + strings.Repeat(" ", widths[i]-utf8.RuneCountInString(text))
		}
		return strings.TrimRight(strings.Join(padded, "  "), " ")
	}

	headers := make([]string, len(columns))
	separators := make([]string, len(columns))
	for i, col := range columns {
		headers[i] = strings.ToUpper(col.header)
		separators[i] = strings.Repeat("─", widths[i])
	}
	write(line(headers))
	write(line(separators))
	for _, row := range rows {
		cells := make([]string, len(columns))
		for i, col := range columns {
			cells[i] = cell(row, col)
		}
		write(line(cells))
	}
}

// kvField is one row of an aligned `key  value` block.
type kvField struct {
	key   string
	value any
}

// renderKV prints an aligned `key  value` block for a single record.
func renderKV(pairs []kvField, indent int) {
	pad := strings.Repeat(" ", indent)
	width := 0
	for _, pair := range pairs {
		if len(pair.key) > width {
			width = len(pair.key)
		}
	}
	lines := make([]string, 0, len(pairs))
	for _, pair := range pairs {
		rendered := missingCell(pair.value)
		parts := strings.Split(rendered, "\n")
		head := fmt.Sprintf("%s%s  %s", pad, padRight(pair.key, width), parts[0])
		chunk := []string{head}
		for _, rest := range parts[1:] {
			chunk = append(chunk, fmt.Sprintf("%s%s  %s", pad, strings.Repeat(" ", width), rest))
		}
		lines = append(lines, strings.Join(chunk, "\n"))
	}
	write(strings.Join(lines, "\n"))
}

func padRight(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}

// heading prints a section heading for multi-part output.
func heading(text string) {
	write("\n" + text)
}

// hint prints a "where to go next" line after a successful command.
//
// Suppressed by `--quiet` and by `--json`: a machine-readable document with
// a trailing prose line is not JSON, and a quiet run asked for data only.
func hint(text string, flags flagSet) {
	if text == "" || flags.boolean("quiet") || flags.boolean("json") {
		return
	}
	write("\n" + text)
}
