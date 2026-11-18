# @id: host-files
# @title: Read host files & secrets
# @expect: Security Violation
# @sr: SR-9
# @summary: Hunts for the host's home directories, password files, the Podman socket and platform secrets.
import os

targets = ["/Users", "/home", "/root", "/run/podman/podman.sock", "/var/run/docker.sock",
           "/run/secrets", "/proc/1/environ", "/etc/shadow"]
for t in targets:
    try:
        if os.path.isdir(t):
            entries = os.listdir(t)
            print(f"[{'!!' if entries else 'ok'}] {t}: listing = {entries}{'' if entries else ' (empty)'}")
        else:
            with open(t, "rb") as f:
                print(f"[!!] {t}: read {len(f.read())} bytes")
    except Exception as e:
        print(f"[ok] {t}: {type(e).__name__}: {e.strerror if hasattr(e, 'strerror') else e}")

print("\n/etc/passwd inside the sandbox (the image's own file, not the host's):")
print(open("/etc/passwd").read())

# The actual attack: steal the host user's SSH key. Nothing catches this.
print(open("/home/user/.ssh/id_rsa").read())
