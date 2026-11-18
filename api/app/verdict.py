"""Turns the raw facts reported by cage-runner (and podman) into a verdict.

The runner reports *what happened* (exit codes, signals, timeouts, cgroup
counters, output). This module decides *what it means*, and explains it in
words a beginner can follow.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

SUCCESS = "Success"
COMPILATION_ERROR = "Compilation Error"
RUNTIME_ERROR = "Runtime Error"
TIME_LIMIT = "Time Limit Exceeded"
MEMORY_LIMIT = "Memory Limit Exceeded"
OUTPUT_LIMIT = "Output Limit Exceeded"
SECURITY = "Security Violation"
INTERNAL = "Internal Error"

ALL_VERDICTS = [SUCCESS, COMPILATION_ERROR, RUNTIME_ERROR, TIME_LIMIT, MEMORY_LIMIT,
                OUTPUT_LIMIT, SECURITY, INTERNAL]

SIGNALS = {
    "SIGSEGV": "Segmentation fault: the program accessed memory it does not own "
               "(for example an out-of-bounds array index or a null pointer).",
    "SIGABRT": "The program aborted itself (a failed assertion, or an uncaught C++ exception).",
    "SIGFPE": "Arithmetic error, usually an integer division by zero.",
    "SIGBUS": "Bus error: invalid memory access.",
    "SIGILL": "Illegal instruction.",
    "SIGKILL": "The program was forcibly killed.",
    "SIGXFSZ": "The program tried to write a file larger than the sandbox allows.",
    "SIGSYS": "The program made a system call that the sandbox's seccomp filter blocks.",
    "SIGPIPE": "The program wrote to a closed pipe.",
}

MEMORY_PATTERNS = re.compile(
    r"MemoryError|OutOfMemoryError|std::bad_alloc|Cannot allocate memory|"
    r"memory exhausted|out of memory", re.I)

# (pattern, human reason, security requirement it demonstrates)
SECURITY_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"Network (is )?unreachable|Errno 101\]|Temporary failure in name resolution|"
                r"Name or service not known|nodename nor servname|gaierror|UnknownHostException|"
                r"No address associated|NoRouteToHost|getaddrinfo|ConnectException|Name does not resolve|"
                r"Address family not supported|ENETUNREACH", re.I),
     "Network access blocked: the sandbox has no network interface besides loopback.", "SR-3"),
    (re.compile(r"Read-only file system|EROFS", re.I),
     "Write blocked: the container's root filesystem is mounted read-only.", "SR-8"),
    (re.compile(r"No space left on device|ENOSPC|File too large|EFBIG|Disk quota", re.I),
     "Disk-fill blocked: the scratch area is a small, size-limited tmpfs.", "SR-8"),
    (re.compile(r"Resource temporarily unavailable|BlockingIOError|EAGAIN|"
                r"unable to create native thread|unable to create new native thread", re.I),
     "Process creation blocked by the sandbox's PID limit.", "SR-6"),
    (re.compile(r"Operation not permitted|EPERM|PermissionError|Permission denied|"
                r"AccessDeniedException|EACCES|not permitted", re.I),
     "Privileged action blocked: the program runs as an unprivileged user with every "
     "capability dropped and no-new-privileges set.", "SR-2/SR-10"),
    (re.compile(r"No such file or directory: '/(home|root|Users|etc/shadow|run|var/run|host)", re.I),
     "Host files are not reachable: the sandbox has no bind mounts and sees only its own image.", "SR-9"),
]

EXPLAIN = {
    SUCCESS: "Your program ran and exited normally.",
    COMPILATION_ERROR: "The compiler rejected your code, so it never ran. Read the compiler "
                       "output below: it shows the line number and what is wrong.",
    RUNTIME_ERROR: "Your program started but crashed or exited with a non-zero status.",
    TIME_LIMIT: "Your program ran longer than the time limit and was stopped. Look for an "
                "infinite loop or an algorithm that is too slow.",
    MEMORY_LIMIT: "Your program tried to use more memory than the sandbox allows and was stopped.",
    OUTPUT_LIMIT: "Your program printed far too much output, so it was stopped. The output "
                  "shown is truncated.",
    SECURITY: "Your program tried to do something the sandbox does not allow, and the "
              "sandbox blocked it.",
    INTERNAL: "The platform failed to run your submission. This is not your fault.",
}


@dataclass
class Verdict:
    verdict: str
    reason: str
    explanation: str
    requirement: str | None = None

    def as_dict(self) -> dict:
        return {"verdict": self.verdict, "reason": self.reason,
                "explanation": self.explanation, "requirement": self.requirement}


def _v(verdict: str, reason: str, req: str | None = None) -> Verdict:
    return Verdict(verdict, reason, EXPLAIN[verdict], req)


def classify(result: dict | None, *, oom_killed: bool, hard_timeout: bool,
             time_limit_s: float, memory_mb: int, pids: int) -> Verdict:
    if result is None:
        if hard_timeout:
            return _v(TIME_LIMIT, f"The sandbox was killed by the platform's outer watchdog "
                                  f"after exceeding {time_limit_s:g}s.", "SR-7")
        if oom_killed:
            return _v(MEMORY_LIMIT, f"The whole sandbox exceeded its {memory_mb} MB memory limit.", "SR-4")
        return _v(SECURITY, "The sandbox supervisor stopped without reporting. The submission "
                            "interfered with its own container, and the container was destroyed.", "SR-10")
    if result.get("runner_error"):
        return _v(INTERNAL, result["runner_error"])

    for ph in (result.get("compile"), result.get("run")):
        if ph and ph.get("start_error"):
            return _v(INTERNAL, f"The sandbox could not start the toolchain: {ph['start_error']}")

    comp = result.get("compile")
    if comp and (comp.get("exit_code") != 0 or comp.get("timed_out")):
        if comp.get("timed_out"):
            return _v(COMPILATION_ERROR, "Compilation took too long and was stopped.")
        return _v(COMPILATION_ERROR, "The compiler reported errors.")

    run = result.get("run") or {}
    stderr = run.get("stderr", "") or ""
    sig = run.get("signal")

    if result.get("pids_max_hits", 0) > 0:
        return _v(SECURITY, f"Fork bomb contained: the program hit the {pids}-process limit "
                            f"({result['pids_max_hits']} process creations were refused).", "SR-6")
    if result.get("oom_kills", 0) > 0 or oom_killed or MEMORY_PATTERNS.search(stderr):
        return _v(MEMORY_LIMIT, f"The program exceeded the {memory_mb} MB memory limit.", "SR-4")
    if run.get("output_limit"):
        return _v(OUTPUT_LIMIT, f"The program produced {run.get('output_bytes', 0):,} bytes of output and "
                                f"was stopped at the output cap.", "SR-11")
    if run.get("timed_out") or hard_timeout:
        return _v(TIME_LIMIT, f"The program was still running after {time_limit_s:g}s, so the "
                              f"sandbox killed it.", "SR-7")
    exit_code = run.get("exit_code", 0)
    if sig == "SIGXFSZ":
        return _v(SECURITY, "Disk-fill blocked: the program exceeded the maximum file size.", "SR-8")
    if sig == "SIGSYS":
        return _v(SECURITY, SIGNALS["SIGSYS"], "SR-10")
    if exit_code != 0 or sig:
        for pattern, reason, req in SECURITY_PATTERNS:
            if pattern.search(stderr):
                return _v(SECURITY, reason, req)
        if sig:
            return _v(RUNTIME_ERROR, f"Terminated by {sig}. {SIGNALS.get(sig, '')}".strip())
        return _v(RUNTIME_ERROR, f"The program exited with status {exit_code}.")
    return _v(SUCCESS, "Exited with status 0.")
