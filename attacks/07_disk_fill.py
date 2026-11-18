# @id: disk-fill
# @title: Fill the disk
# @expect: Security Violation
# @sr: SR-8
# @summary: Writes a giant file in 1 MB chunks. The scratch tmpfs size and RLIMIT_FSIZE stop it long before the host disk is touched.
import os

chunk = os.urandom(1024 * 1024)
written = 0
with open("/sandbox/fill.bin", "wb") as f:
    while True:
        f.write(chunk)
        f.flush()
        written += 1
        if written % 4 == 0:
            print(f"wrote {written} MB", flush=True)
