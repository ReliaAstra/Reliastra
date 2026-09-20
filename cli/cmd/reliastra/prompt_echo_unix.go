//go:build !windows

package main

import (
	"os"
	"os/exec"
	"sync"
)

// echoRestoreLast holds the terminal restore for the prompt in progress, so
// the Ctrl+C handler in main can leave the terminal usable. Only one prompt
// ever runs at a time.
var echoRestoreLast struct {
	sync.Mutex
	restore func()
}

func setEchoRestore(restore func()) {
	echoRestoreLast.Lock()
	defer echoRestoreLast.Unlock()
	echoRestoreLast.restore = restore
}

// restoreTerminalEcho re-enables echo after an interrupt. Best effort: by
// the time it runs, the process is already on its way out.
func restoreTerminalEcho() {
	echoRestoreLast.Lock()
	defer echoRestoreLast.Unlock()
	if echoRestoreLast.restore != nil {
		echoRestoreLast.restore()
		echoRestoreLast.restore = nil
	}
}

// stdinIsATTY reports whether f is the session terminal: /dev/tty is the
// controlling terminal, so f answers a person exactly when it is the same
// file. Pipes, files and /dev/null fail the comparison (or /dev/tty refuses
// to open when there is no controlling terminal at all, as in CI).
func stdinIsATTY(f *os.File) bool {
	tty, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil {
		return false
	}
	defer tty.Close()
	stdinInfo, err := f.Stat()
	if err != nil {
		return false
	}
	ttyInfo, err := tty.Stat()
	if err != nil {
		return false
	}
	return os.SameFile(stdinInfo, ttyInfo)
}

// echoOffStdin disables echo on the terminal behind stdin and returns the
// restore function. When `stty` is unavailable the prompt still works, but
// says so: a secret typed at a prompt that promised silence would be a lie.
func echoOffStdin() (restore func()) {
	off := exec.Command("stty", "-echo")
	off.Stdin = stdinFile
	if err := off.Run(); err != nil {
		writeError("warning: could not disable echo; the secret will be visible as you type.")
		return func() {}
	}
	restore = func() {
		on := exec.Command("stty", "echo")
		on.Stdin = stdinFile
		_ = on.Run()
		setEchoRestore(nil)
	}
	setEchoRestore(restore)
	return restore
}
