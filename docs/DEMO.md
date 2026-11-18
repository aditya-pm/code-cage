# Viva demo script (about 8 minutes)

This follows Section 12 of the project description step by step. Before the viva, run `./codecage up` once so the images are cached, then `./codecage down`.

**Screen layout:** a terminal on the left and the browser at http://localhost:8080 on the right.

---

### 1. Start the whole platform with one command (≈ 30 s)

```bash
./codecage up
```

Point out these lines in the output:
- `SR-1 rootless mode: true`, and the `cpu`, `memory` and `pids` cgroup controllers being delegated.
- The four containers starting: `codecage-db`, `codecage-registry`, `codecage-api`, `codecage-web`.
- `API healthy: podman 6.x, rootless=True, fedora …, seccomp=True, selinux=True`.

Optional proof that nothing runs as root:

```bash
ps -o user,pid,cmd -C conmon | head -3        # Linux host: conmon runs as YOUR user
./codecage images                              # runtime images: 55 MB / 175 MB / 68 MB, in the local registry
```

### 2. A normal submission in each language → *Success* (≈ 1 min)

In the **Playground**, run the Python template (stdin `Ada Linus Grace`), then **C++** (sum and max), then **Java** (Fibonacci).

Talk over the **Sandbox lifecycle** panel as it runs: `podman create` with a real container ID → start (cage-runner is PID 1, uid 10001) → compile → execute → collect → `podman rm -f`. Each run takes under a second.

### 3. Compile error and runtime error (≈ 1 min)

- **C++:** delete a semicolon → **Compilation Error**. The compiler tab shows `main.cpp:3:35: error: expected ';'`, and *Execute* shows as *skipped*.
- **Python:** `print(1/0)` → **Runtime Error** with a `ZeroDivisionError` traceback in stderr.
- *(optional)* **C++:** `int *p = nullptr; *p = 1;` → **Runtime Error: SIGSEGV**, with an explanation a beginner can follow.

### 4. Attacks, safely contained (≈ 2–3 min)

Open the **Attack Lab** and press **Launch all attacks**.

- All 10 run at once. The header shows `slots 4/4` and a queue, demonstrating the concurrency limit (FR-7).
- The **platform heartbeat** stays at a few milliseconds, showing the host remains responsive.
- Every card flips to **Contained**, and the banner ends with **0 sandbox containers left behind**.

Open **Evidence** on the four attacks the spec asks for:

| Attack | What to show |
|---|---|
| Infinite loop | TLE, `137 (SIGKILL)`, run time exactly 3.00 s |
| Fork bomb | "hit the 64-process limit (≈60 process creations were refused)" |
| Network | stdout: `interfaces: ['lo']`, then ENETUNREACH for TCP, UDP and IPv6 |
| Host files | `/Users`, `/home`, `/root` and the Podman socket not found; `/proc/1/environ` permission denied |

While the attacks run, you can prove the host is fine in the terminal:

```bash
podman machine ssh uptime        # macOS; on Linux just: uptime
```

The terminal version of the same suite also writes the report evidence:

```bash
./codecage suite                 # 10/10 contained, leftover 0, loadavg before → after
```

### 5. No leftover containers (≈ 20 s)

```bash
podman ps -a --filter label=codecage.sandbox=1     # empty
./codecage status                                   # "0 sandbox containers, nothing left behind"
```

The header badge **live sandboxes 0** shows the same thing.

### 6. Restart, then show that history persisted (≈ 1 min)

```bash
./codecage restart
```

Reload the browser and open **History**. Every run from the demo is still there, including the verdict counters and attack runs. Click one to show its stored output, then use **Load into editor**.

Explain why: Postgres keeps its data on the named volume `codecage-pgdata` (`podman volume ls`), which survives the containers being destroyed and recreated.

---

## Likely viva questions

**How does the API create containers without root?** It talks to the *user's* rootless Podman REST socket, which is bind-mounted into the API container. Every sandbox it creates is rootless, so container root maps to an unprivileged subuid on the host.

**Why not mount the code into the container?** Bind mounts expose host paths (SR-9) and behave differently on macOS. Instead, the code and stdin are passed as base64 env vars, and the runner writes them into the sandbox's own tmpfs.

**Can the program fake its verdict?** Results are only accepted on a line prefixed with a random per-run nonce. The runner is PID 1 and non-dumpable, so the program cannot read `/proc/1/environ` (where the nonce lives) or write to its file descriptors. The kernel also ignores SIGKILL sent to a namespace's init from inside the namespace, as attack 10 shows.

**How is MLE detected?** From the cgroup's own `memory.events` (`oom_kill` counter) and Podman's `OOMKilled` flag, plus language-level signals such as `MemoryError`, `OutOfMemoryError` and `std::bad_alloc`.

**What stops a fork bomb from freezing the host?** `pids.max` in the container's cgroup. The suite records the refused forks from `pids.events`, and the CPU quota (`--cpus 1`) limits the rest.
