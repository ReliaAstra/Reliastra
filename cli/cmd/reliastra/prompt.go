// Terminal prompts.
//
// Two rules, both about not lying to the operator:
//
//  1. A secret is never accepted as a flag. An argument lands in shell history
//     and in every process listing on the machine, which turns a convenience
//     into a credential leak. It comes from a prompt, or from an environment
//     variable when there is no terminal.
//  2. Nothing destructive happens without a typed confirmation when a person is
//     present, and nothing destructive happens *at all* without `--yes` when
//     there is not. A prompt that reads EOF and proceeds is worse than no
//     prompt, because it looks like it asked.
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// stdinFile is the console input. A variable (rather than os.Stdin inline)
// so tests can feed it without a terminal.
var stdinFile = os.Stdin

// stdinIsTerminal reports whether stdin is a terminal. It is a variable so
// tests can pin it: a test that blocked on a real terminal prompt would hang
// every interactive `go test` run.
var stdinIsTerminal = func() bool {
	info, err := stdinFile.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}

// promptSecret reads a line without echoing it, when the terminal supports
// that. The question goes to standard error so a pipeline capturing stdout
// gets only the command's data.
func promptSecret(question string) (string, error) {
	if !stdinIsTerminal() {
		fmt.Fprint(errSink, question)
		return readStdinLine()
	}
	restore := echoOffStdin()
	secret, err := readStdinLine()
	restore()
	fmt.Fprintln(errSink)
	return secret, err
}

// readStdinLine reads one line from stdin, without the trailing newline.
func readStdinLine() (string, error) {
	reader := bufio.NewReader(stdinFile)
	line, err := reader.ReadString('\n')
	if err != nil && len(line) == 0 {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

// confirm asks a `y`/`n` confirmation for a destructive action.
//
// It returns the answer and whether a terminal was attached: without one the
// caller must have passed `--yes`, which is reported distinctly so the caller
// can explain rather than guess.
func confirm(question string) (confirmed bool, interactive bool) {
	if !stdinIsTerminal() {
		return false, false
	}
	fmt.Fprint(errSink, question)
	answer, err := readStdinLine()
	if err != nil {
		return false, true
	}
	answer = strings.ToLower(strings.TrimSpace(answer))
	return answer == "y" || answer == "yes", true
}

// guardDestructive guards a destructive command.
//
// It returns an exit code when the action must not proceed, or exitOK to
// proceed. The two refusal paths are kept separate in the message: "you did
// not confirm" and "there is no terminal to confirm on" need different fixes.
func guardDestructive(flags flagSet, what string) int {
	if flags.boolean("yes") {
		return exitOK
	}
	confirmed, interactive := confirm(fmt.Sprintf("remove %s? [y/N] ", what))
	if !interactive {
		writeError(fmt.Sprintf("refusing to remove %s without confirmation: no terminal is attached.", what))
		writeError("re-run with --yes if this is intended (for example, from a script).")
		return exitUsage
	}
	if !confirmed {
		write("nothing removed.")
		return exitUsage
	}
	return exitOK
}
