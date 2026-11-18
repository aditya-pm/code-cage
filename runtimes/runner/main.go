// cage-runner: the in-sandbox supervisor for CodeCage.
//
// It runs as PID 1 inside every execution container (as the unprivileged
// sandbox user). It decodes the submission, compiles it (if the language needs
// it), runs it with a wall-clock limit and output caps, reads the cgroup event
// counters and prints exactly one nonce-prefixed RESULT line for the API.
//
// Being PID 1 matters: signals without a handler (including SIGKILL sent from
// inside the PID namespace) cannot kill the namespace init, so a submission
// cannot take down its own supervisor. The runner also marks itself
// non-dumpable, so the program cannot read its environment (where the nonce
// lives) or write to its file descriptors through /proc.
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const prSetDumpable = 4

type spec struct {
	Nonce            string   `json:"nonce"`
	File             string   `json:"file"`
	Compile          []string `json:"compile"`
	Run              []string `json:"run"`
	CompileTimeoutMs int      `json:"compile_timeout_ms"`
	RunTimeoutMs     int      `json:"run_timeout_ms"`
	OutputCap        int      `json:"output_cap"`
	OutputKill       int64    `json:"output_kill"`
}

type phase struct {
	ExitCode        int    `json:"exit_code"`
	Signal          string `json:"signal,omitempty"`
	TimedOut        bool   `json:"timed_out"`
	OutputLimit     bool   `json:"output_limit"`
	Stdout          string `json:"stdout"`
	Stderr          string `json:"stderr"`
	StdoutTruncated bool   `json:"stdout_truncated"`
	StderrTruncated bool   `json:"stderr_truncated"`
	OutputBytes     int64  `json:"output_bytes"`
	DurationMs      int64  `json:"duration_ms"`
	StartError      string `json:"start_error,omitempty"`
}

type result struct {
	Compile      *phase `json:"compile,omitempty"`
	Run          *phase `json:"run,omitempty"`
	OOMKills     int    `json:"oom_kills"`
	PidsMaxHits  int    `json:"pids_max_hits"`
	RunnerError  string `json:"runner_error,omitempty"`
	UID          int    `json:"uid"`
	RunnerMillis int64  `json:"runner_ms"`
}

var nonce string

func emit(kind, payload string) {
	// Single write so the line is never interleaved.
	os.Stdout.Write([]byte(nonce + " " + kind + " " + payload + "\n"))
}

// capBuffer keeps the first `limit` bytes, counts everything, and fires
// onExceed once the shared total passes `kill`.
type capBuffer struct {
	mu        sync.Mutex
	buf       bytes.Buffer
	limit     int
	truncated bool
	total     *int64
	kill      int64
	onExceed  func()
}

func (c *capBuffer) Write(p []byte) (int, error) {
	c.mu.Lock()
	room := c.limit - c.buf.Len()
	if room > 0 {
		if len(p) > room {
			c.buf.Write(p[:room])
			c.truncated = true
		} else {
			c.buf.Write(p)
		}
	} else if len(p) > 0 {
		c.truncated = true
	}
	c.mu.Unlock()
	if atomic.AddInt64(c.total, int64(len(p))) > c.kill {
		c.onExceed()
	}
	return len(p), nil
}

func (c *capBuffer) String() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return strings.ToValidUTF8(c.buf.String(), "�")
}

func cleanEnv() []string {
	return []string{
		"PATH=/opt/java/bin:/usr/local/bin:/usr/bin:/bin",
		"HOME=/sandbox",
		"TMPDIR=/tmp",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
	}
}

func execPhase(argv []string, stdin []byte, timeout time.Duration, s spec) *phase {
	ph := &phase{}
	var total int64
	var once sync.Once
	var pid int
	var outLimit atomic.Bool
	killGroup := func() {
		if pid > 0 {
			syscall.Kill(-pid, syscall.SIGKILL)
		}
	}
	exceed := func() {
		once.Do(func() {
			outLimit.Store(true)
			killGroup()
		})
	}
	stdout := &capBuffer{limit: s.OutputCap, total: &total, kill: s.OutputKill, onExceed: exceed}
	stderr := &capBuffer{limit: s.OutputCap, total: &total, kill: s.OutputKill, onExceed: exceed}

	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Dir = "/sandbox"
	cmd.Env = cleanEnv()
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	// If a grandchild escapes the process group and keeps the pipes open,
	// stop waiting for it shortly after the main process exits.
	cmd.WaitDelay = 300 * time.Millisecond

	start := time.Now()
	if err := cmd.Start(); err != nil {
		ph.StartError = err.Error()
		ph.ExitCode = 127
		ph.Stderr = err.Error()
		return ph
	}
	pid = cmd.Process.Pid

	var timedOut atomic.Bool
	timer := time.AfterFunc(timeout, func() {
		timedOut.Store(true)
		killGroup()
	})
	err := cmd.Wait()
	timer.Stop()
	ph.DurationMs = time.Since(start).Milliseconds()
	killGroup() // reap anything left in the group

	ph.TimedOut = timedOut.Load()
	ph.OutputLimit = outLimit.Load()
	ph.Stdout = stdout.String()
	ph.Stderr = stderr.String()
	ph.StdoutTruncated = stdout.truncated
	ph.StderrTruncated = stderr.truncated
	ph.OutputBytes = atomic.LoadInt64(&total)

	if cmd.ProcessState != nil {
		if ws, ok := cmd.ProcessState.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
			ph.Signal = sigName(ws.Signal())
			ph.ExitCode = 128 + int(ws.Signal())
		} else {
			ph.ExitCode = cmd.ProcessState.ExitCode()
		}
	} else if err != nil {
		var ee *exec.ExitError
		if !errors.As(err, &ee) {
			ph.StartError = err.Error()
		}
		ph.ExitCode = -1
	}
	return ph
}

func sigName(s syscall.Signal) string {
	names := map[syscall.Signal]string{
		syscall.SIGKILL: "SIGKILL", syscall.SIGSEGV: "SIGSEGV", syscall.SIGABRT: "SIGABRT",
		syscall.SIGFPE: "SIGFPE", syscall.SIGBUS: "SIGBUS", syscall.SIGILL: "SIGILL",
		syscall.SIGXFSZ: "SIGXFSZ", syscall.SIGXCPU: "SIGXCPU", syscall.SIGTERM: "SIGTERM",
		syscall.SIGPIPE: "SIGPIPE", syscall.SIGSYS: "SIGSYS",
	}
	if n, ok := names[s]; ok {
		return n
	}
	return "SIG" + strconv.Itoa(int(s))
}

func cgroupCounter(file, key string) int {
	data, err := os.ReadFile(filepath.Join("/sys/fs/cgroup", file))
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && f[0] == key {
			n, _ := strconv.Atoi(f[1])
			return n
		}
	}
	return 0
}

func decode(name string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(os.Getenv(name))
}

func main() {
	started := time.Now()
	// Make /proc/1/{environ,fd,mem} inaccessible to the (same-uid) program.
	syscall.RawSyscall(syscall.SYS_PRCTL, prSetDumpable, 0, 0)
	// As PID 1, ignore catchable termination signals so the program cannot
	// stop its supervisor with kill(1, ...).
	signal.Ignore(syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP, syscall.SIGQUIT,
		syscall.SIGUSR1, syscall.SIGUSR2, syscall.SIGALRM)

	res := &result{UID: os.Getuid()}
	specRaw, err := decode("CAGE_SPEC")
	var s spec
	if err == nil {
		err = json.Unmarshal(specRaw, &s)
	}
	nonce = s.Nonce
	if nonce == "" {
		nonce = "CAGE"
	}
	finish := func() {
		res.OOMKills = cgroupCounter("memory.events", "oom_kill")
		res.PidsMaxHits = cgroupCounter("pids.events", "max")
		res.RunnerMillis = time.Since(started).Milliseconds()
		out, _ := json.Marshal(res)
		emit("RESULT", string(out))
	}
	if err != nil || len(s.Run) == 0 || s.File == "" {
		res.RunnerError = fmt.Sprintf("invalid sandbox spec: %v", err)
		finish()
		os.Exit(0)
	}
	if s.OutputCap <= 0 {
		s.OutputCap = 64 * 1024
	}
	if s.OutputKill <= 0 {
		s.OutputKill = 1 << 20
	}
	src, err1 := decode("CAGE_SRC")
	stdin, err2 := decode("CAGE_STDIN")
	if err1 != nil || err2 != nil {
		res.RunnerError = "could not decode submission payload"
		finish()
		os.Exit(0)
	}
	// Scrub our own environment; children get a fixed minimal env anyway.
	os.Clearenv()
	os.Setenv("PATH", "/opt/java/bin:/usr/local/bin:/usr/bin:/bin")

	if err := os.WriteFile(filepath.Join("/sandbox", filepath.Base(s.File)), src, 0o644); err != nil {
		res.RunnerError = "could not write source to /sandbox: " + err.Error()
		finish()
		os.Exit(0)
	}

	if len(s.Compile) > 0 {
		emit("PHASE", "compile")
		res.Compile = execPhase(s.Compile, nil, time.Duration(s.CompileTimeoutMs)*time.Millisecond, s)
		if res.Compile.ExitCode != 0 || res.Compile.TimedOut {
			finish()
			os.Exit(0)
		}
	}
	emit("PHASE", "run")
	res.Run = execPhase(s.Run, stdin, time.Duration(s.RunTimeoutMs)*time.Millisecond, s)
	emit("PHASE", "collect")
	finish()
	os.Exit(0)
}
