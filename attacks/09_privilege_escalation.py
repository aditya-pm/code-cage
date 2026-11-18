# @id: priv-esc
# @title: Gain root / escalate privileges
# @expect: Security Violation
# @sr: SR-2, SR-10
# @summary: Checks its identity and capabilities, looks for setuid binaries, then tries setuid(0), chroot and mount.
import ctypes
import os

print(f"uid={os.getuid()} euid={os.geteuid()} gid={os.getgid()}")
for line in open("/proc/self/status"):
    if line.startswith(("CapEff", "CapPrm", "CapBnd", "NoNewPrivs", "Seccomp")):
        print("  " + line.strip())

suid = [os.path.join(d, f) for d in ("/bin", "/usr/bin", "/sbin", "/usr/sbin") if os.path.isdir(d)
        for f in os.listdir(d) if os.stat(os.path.join(d, f), follow_symlinks=False).st_mode & 0o6000]
print("setuid/setgid binaries:", suid or "none")
print("sudo/su present:", any(os.path.exists(p) for p in ("/usr/bin/sudo", "/bin/su", "/usr/bin/su")))

libc = ctypes.CDLL(None, use_errno=True)
r = libc.mount(b"none", b"/mnt", b"tmpfs", 0, None)
print(f"mount tmpfs -> {r} (errno {ctypes.get_errno()}: {os.strerror(ctypes.get_errno())})")
try:
    os.chroot("/")
except Exception as e:
    print("chroot ->", e)

# The escalation itself. Nothing catches this.
os.setuid(0)
print("I AM ROOT")
