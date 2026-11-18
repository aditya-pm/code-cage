# CodeCage: setup and user guide

CodeCage needs **rootless Podman with cgroup v2** (Podman 4.7+ for `podman compose`) and a compose provider. Nothing runs as root, and you never need `sudo` after the packages are installed.

---

## A. Fedora / RHEL / CentOS Stream (fresh machine)

```bash
# 1. Packages (RHEL 9: enable EPEL first for podman-compose)
sudo dnf install -y podman podman-compose git python3 curl

# 2. Start the rootless Podman API socket for YOUR user (not root)
systemctl --user enable --now podman.socket
loginctl enable-linger "$USER"          # keep it running after logout

# 3. Get the code and start everything
git clone <your-repo-url> code-cage && cd code-cage
./codecage up
```

Then open **http://localhost:8080**.

### If `./codecage doctor` warns that a cgroup controller is not delegated

Fedora delegates `cpu`, `memory` and `pids` to users by default. On older systems:

```bash
sudo mkdir -p /etc/systemd/system/user@.service.d
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' | sudo tee /etc/systemd/system/user@.service.d/delegate.conf
sudo systemctl daemon-reload   # then log out and back in
```

---

## B. macOS (Apple Silicon or Intel)

On macOS, Podman runs containers inside a small Fedora VM (`podman machine`). The VM is **rootless by default**, and CodeCage checks for this.

```bash
brew install podman podman-compose
podman machine init --cpus 4 --memory 4096 --disk-size 40
podman machine start
./codecage up
```

Notes:
- Port **5000** is used by macOS AirPlay Receiver, so the local registry is published on **5050**.
- The API container mounts the Podman socket **inside the VM** (`/run/user/<uid>/podman/podman.sock`). `./codecage` discovers this path automatically with `podman info`.

---

## What `./codecage up` does

1. **doctor**: checks that Podman is installed and running, that it is **rootless** (it refuses to continue otherwise), that cgroups are v2 with `cpu`, `memory` and `pids` delegated, and that the socket and a compose provider are available.
2. **build** (first run only): starts the local registry, builds the three runtime images, tags them as `localhost:5050/codecage/runtime-<lang>:1.0`, and pushes them to the registry. It then builds the `api` and `web` images.
3. **compose up**: starts `db`, `registry`, `api` and `web` on the `codecage-net` network.
4. Waits for `/api/health` and prints the Podman version and rootless status.

The first build takes a few minutes because it downloads the base images. Later starts take seconds.

## Everyday commands

```bash
./codecage status     # platform containers, leftover sandboxes (expect 0), network, volumes
./codecage logs       # follow the API log (one JSON line per execution)
./codecage suite      # run the 10 attacks, write reports/security-results.{md,json}
./codecage restart    # stop + start (submission history is kept)
./codecage rebuild    # after editing code or Containerfiles
./codecage down       # stop (history volume is kept)
./codecage reset      # stop and DELETE volumes (asks for confirmation)
```

Configuration overrides go in `.env` (see `.env.example`): `CODECAGE_PORT`, `MAX_CONCURRENT`, `MAX_QUEUE`, `POSTGRES_PASSWORD`. Per-language limits are in `config/languages.yaml`.

---

## Using the web UI

| Page | What you can do |
|---|---|
| **Playground** | Pick a language, write or upload code (⬆), add stdin, then press **Run in sandbox** or ⌘/Ctrl+Enter. The *Sandbox lifecycle* panel shows each step live, with the real container ID. Results show the verdict, a beginner-friendly explanation, exit status and timings, plus stdout, stderr and compiler output. |
| **Attack Lab** | The 10 security-suite attacks. **Launch all attacks** runs them concurrently. Each card turns *Contained* with its verdict, a heartbeat shows the platform stays responsive, and a final check confirms 0 containers were left behind. **Evidence** opens the full output. |
| **History** | Every submission, stored in Postgres. Filter by verdict, open a run to see its full result, or load its code back into the editor. |
| **Sandbox Policy** | Architecture diagram, SR-1…SR-11 with live checks from the Podman host, and runtime image sizes. |

The header always shows: **rootless ✓**, Podman version, sandbox slots in use and queue length, and **live sandboxes** (0 when idle).

## Limits (defaults)

| | Python | C++ | Java |
|---|---|---|---|
| Wall time (run) | 5 s | 3 s | 6 s |
| Compile timeout | 5 s (syntax check) | 15 s | 20 s |
| Memory (no swap) | 256 MB | 256 MB | 384 MB |
| PIDs | 64 | 64 | 128 (JVM threads) |
| CPU | 1 core | 1 core | 1 core |
| Scratch `/sandbox` · `/tmp` | 32 MB · 16 MB | same | same |
| Output kept · kill threshold | 64 KB/stream · 1 MB | same | same |
| Code · stdin size | 64 KB · 32 KB | same | same |
| Concurrency | 4 running + 16 queued; beyond that HTTP 429 | | |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `podman is running ROOTFUL` | `podman machine stop; podman machine set --rootful=false; podman machine start` (macOS) or run as a normal user (Linux) |
| `address already in use :5050/:8080` | Change the port in `compose.yaml` / `.env` (`CODECAGE_PORT`) |
| UI shows *platform unreachable* | `./codecage logs api`. Check that the socket path printed by `./codecage doctor` exists |
| Verdict *Internal Error: image not found* | `./codecage build` |
| Changes to code not visible | `./codecage rebuild` (podman-compose does not recreate running containers on `up`) |
