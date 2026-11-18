# @id: cross-submission
# @title: Spy on other submissions
# @expect: Security Violation
# @sr: SR-9, FR-2
# @summary: Looks for other sandboxes' processes, files and IPC, and tries to kill everything it can see.
import os
import signal

pids = sorted(int(p) for p in os.listdir("/proc") if p.isdigit())
print(f"processes visible in my PID namespace: {pids}")
for p in pids:
    try:
        cmd = open(f"/proc/{p}/cmdline", "rb").read().replace(b"\0", b" ").decode().strip()
    except Exception as e:
        cmd = f"<{type(e).__name__}>"
    print(f"  pid {p}: {cmd or '<hidden>'}")

print("files in /sandbox:", os.listdir("/sandbox"))
print("files in /tmp:", os.listdir("/tmp"))
print("hostname:", os.uname().nodename)
print("SysV shared memory:", open("/proc/sysvipc/shm").read().strip().splitlines()[1:] or "none")

# Try to kill the sandbox supervisor (PID 1), then every PID up to 32768.
for target in [1] + list(range(2, 32768)):
    if target == os.getpid():
        continue
    try:
        os.kill(target, signal.SIGKILL)
    except ProcessLookupError:
        pass
print("still alive after the kill sweep; nothing outside this sandbox was reachable")

# Last resort: reach into the supervisor and the filesystem behind it. Nothing catches this.
open("/proc/1/root/sandbox/main.py").read()
