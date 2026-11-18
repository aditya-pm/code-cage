# @id: fork-bomb
# @title: Fork bomb
# @expect: Security Violation, Time Limit Exceeded
# @sr: SR-6
# @summary: Classic exponential fork bomb. The PID cgroup limit caps the number of processes, so the host never notices.
import os

print("Detonating fork bomb...", flush=True)
while True:
    os.fork()
