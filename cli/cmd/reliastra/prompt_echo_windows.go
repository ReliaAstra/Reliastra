//go:build windows

package main

import (
	"sync"
	"syscall"
	"unsafe"
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

// stdinIsATTY reports whether stdin is the console. GetConsoleMode fails
// for redirected stdin (pipes, files, NUL), which is exactly the question
// the confirmation guard asks.
func stdinIsATTY(f *os.File) bool {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getMode := kernel32.NewProc("GetConsoleMode")
	var mode uint32
	ret, _, _ := getMode.Call(uintptr(f.Fd()), uintptr(unsafe.Pointer(&mode)))
	return ret != 0
}

// echoOffStdin clears ENABLE_ECHO_INPUT on the console behind stdin and
// returns the restore function. When the console API is unavailable the
// prompt still works, but says so.
func echoOffStdin() (restore func()) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getMode := kernel32.NewProc("GetConsoleMode")
	setMode := kernel32.NewProc("SetConsoleMode")
	stdin := syscall.Stdin

	var mode uint32
	if ret, _, _ := getMode.Call(uintptr(stdin), uintptr(unsafe.Pointer(&mode))); ret == 0 {
		writeError("warning: could not disable echo; the secret will be visible as you type.")
		return func() {}
	}
	const enableEchoInput = 0x0004
	quiet := mode &^ enableEchoInput
	if ret, _, _ := setMode.Call(uintptr(stdin), uintptr(quiet)); ret == 0 {
		writeError("warning: could not disable echo; the secret will be visible as you type.")
		return func() {}
	}
	restore = func() {
		_, _, _ = setMode.Call(uintptr(stdin), uintptr(mode))
		setEchoRestore(nil)
	}
	setEchoRestore(restore)
	return restore
}
