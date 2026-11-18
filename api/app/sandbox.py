"""The execution sandbox: one fresh, hardened, rootless Podman container per run.

Lifecycle (FR-2, FR-4, Objective 1):
    create → start → stream runner markers → wait → inspect → force-remove

All calls are blocking (docker SDK speaking Podman's Docker-compatible REST API
over the rootless user socket), so the scheduler runs them in worker threads.
"""
from __future__ import annotations

import base64
import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

import docker
from docker.errors import APIError, NotFound
from docker.types import Ulimit

from .config import Language, settings

log = logging.getLogger("codecage.sandbox")

LABEL = "codecage.sandbox"
EventFn = Callable[[str, dict], None]

_client: docker.DockerClient | None = None
_client_lock = threading.Lock()


def client() -> docker.DockerClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = docker.DockerClient(base_url=settings.podman_url, timeout=120)
        return _client


def podman_info() -> dict:
    """libpod /info: version, rootless flag, cgroup controllers (SR-1 evidence)."""
    api = client().api
    r = api.get(f"{api.base_url}/v4.0.0/libpod/info", timeout=10)
    r.raise_for_status()
    info = r.json()
    host = info.get("host", {})
    return {
        "version": info.get("version", {}).get("Version"),
        "api_version": info.get("version", {}).get("APIVersion"),
        "rootless": host.get("security", {}).get("rootless"),
        "seccomp": host.get("security", {}).get("seccompEnabled"),
        "selinux": host.get("security", {}).get("selinuxEnabled"),
        "cgroup_version": host.get("cgroupVersion"),
        "cgroup_controllers": host.get("cgroupControllers", []),
        "kernel": host.get("kernel"),
        "os": host.get("distribution", {}).get("distribution"),
        "os_version": host.get("distribution", {}).get("version"),
        "arch": host.get("arch"),
    }


def list_sandboxes() -> list[dict]:
    out = []
    for c in client().containers.list(all=True, filters={"label": f"{LABEL}=1"}):
        out.append({"id": c.short_id, "name": c.name, "status": c.status,
                    "submission": c.labels.get("codecage.submission"),
                    "language": c.labels.get("codecage.language")})
    return out


def remove_sandboxes(keep: set[str] | None = None) -> int:
    """Janitor: force-remove labelled sandboxes not belonging to an active run."""
    keep = keep or set()
    removed = 0
    for c in client().containers.list(all=True, filters={"label": f"{LABEL}=1"}):
        if c.labels.get("codecage.submission") in keep:
            continue
        try:
            c.remove(force=True)
            removed += 1
        except (NotFound, APIError):
            pass
    return removed


def image_sizes(langs: dict[str, Language]) -> dict[str, int | None]:
    sizes: dict[str, int | None] = {}
    for lid, lang in langs.items():
        try:
            sizes[lid] = client().images.get(lang.image).attrs.get("Size")
        except Exception:  # noqa: BLE001
            sizes[lid] = None
    return sizes


@dataclass
class RunOutcome:
    result: dict | None
    container_id: str | None
    oom_killed: bool
    hard_timeout: bool
    exit_code: int | None
    wall_ms: int
    error: str | None = None
    raw_log_tail: str = ""
    timings: dict = field(default_factory=dict)


def _b64(data: str | bytes) -> str:
    if isinstance(data, str):
        data = data.encode()
    return base64.b64encode(data).decode()


def execute(submission_id: str, lang: Language, code: str, stdin: str, emit: EventFn) -> RunOutcome:
    """Run one submission in a brand-new container and always destroy it."""
    nonce = secrets.token_hex(16)
    spec = {
        "nonce": nonce, "file": lang.file, "compile": lang.compile, "run": lang.run,
        "compile_timeout_ms": int(lang.compile_timeout_s * 1000),
        "run_timeout_ms": int(lang.time_limit_s * 1000),
        "output_cap": lang.output_cap_kb * 1024, "output_kill": lang.output_kill_kb * 1024,
    }
    mem = f"{lang.memory_mb}m"
    hard_limit = lang.compile_timeout_s + lang.time_limit_s + 15
    t0 = time.monotonic()
    container = None
    hard_timeout = False
    result: dict | None = None
    log_tail = ""
    timings: dict = {}

    try:
        emit("creating", {"image": lang.image})
        container = client().containers.create(
            image=lang.image,
            name=f"codecage-sbx-{submission_id[:12]}",
            labels={LABEL: "1", "codecage.submission": submission_id, "codecage.language": lang.id},
            environment={"CAGE_SPEC": _b64(json.dumps(spec)), "CAGE_SRC": _b64(code),
                         "CAGE_STDIN": _b64(stdin)},
            user=settings.sandbox_user,                     # SR-2 non-root inside
            network_mode="none",                            # SR-3 no network
            mem_limit=mem, memswap_limit=mem,               # SR-4 memory, no swap
            nano_cpus=int(lang.cpus * 1e9),                 # SR-5 CPU quota
            pids_limit=lang.pids,                           # SR-6 fork bombs
            read_only=True,                                 # SR-8 read-only rootfs
            tmpfs={                                         # SR-8 small scratch areas
                "/sandbox": f"rw,exec,nosuid,nodev,size={lang.scratch_mb}m,mode=1777",
                "/tmp": f"rw,noexec,nosuid,nodev,size={lang.tmp_mb}m,mode=1777",
                # Shadow Podman's default subscription mount (mounts.conf →
                # /run/secrets) so no host directory is visible at all (SR-9).
                "/run/secrets": "ro,nosuid,nodev,noexec,size=4k,mode=0555",
            },
            cap_drop=["ALL"],                               # SR-10 no capabilities
            security_opt=["no-new-privileges"],             # SR-10 no escalation
            ulimits=[Ulimit(name="nofile", soft=lang.open_files, hard=lang.open_files),
                     Ulimit(name="fsize", soft=lang.max_file_mb << 20, hard=lang.max_file_mb << 20),
                     Ulimit(name="core", soft=0, hard=0)],
            ipc_mode="private",                             # SR-9/test 10: no shared IPC
            stdin_open=False, tty=False, detach=True,
            # SR-9: no volumes, no bind mounts, no secrets, no devices.
        )
        timings["created_ms"] = int((time.monotonic() - t0) * 1000)
        emit("created", {"container_id": container.short_id, "name": container.name})

        watchdog = threading.Timer(hard_limit, _hard_kill, args=(container,))
        watchdog.daemon = True
        container.start()
        watchdog.start()
        timings["started_ms"] = int((time.monotonic() - t0) * 1000)
        emit("started", {"container_id": container.short_id})

        # Follow the runner's nonce-prefixed markers live. Only lines carrying
        # this run's secret nonce are trusted.
        buf = b""
        prefix = nonce.encode() + b" "
        for chunk in container.logs(stream=True, follow=True, stdout=True, stderr=True):
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if not line.startswith(prefix):
                    log_tail = (log_tail + line.decode(errors="replace") + "\n")[-2000:]
                    continue
                kind, _, payload = line[len(prefix):].partition(b" ")
                if kind == b"PHASE":
                    phase = payload.decode()
                    timings[f"{phase}_ms"] = int((time.monotonic() - t0) * 1000)
                    emit({"compile": "compiling", "run": "running", "collect": "collecting"}
                         .get(phase, phase), {})
                elif kind == b"RESULT":
                    try:
                        result = json.loads(payload)
                    except json.JSONDecodeError:
                        log_tail += "malformed RESULT line\n"

        status = container.wait(timeout=hard_limit + 5)
        watchdog.cancel()
        hard_timeout = _was_hard_killed(container)
        container.reload()
        state = container.attrs.get("State", {})
        return RunOutcome(result=result, container_id=container.short_id,
                          oom_killed=bool(state.get("OOMKilled")), hard_timeout=hard_timeout,
                          exit_code=status.get("StatusCode"),
                          wall_ms=int((time.monotonic() - t0) * 1000),
                          raw_log_tail=log_tail, timings=timings)
    except Exception as exc:  # noqa: BLE001 - the platform must survive anything
        log.exception("sandbox failure for %s", submission_id)
        return RunOutcome(result=result, container_id=container.short_id if container else None,
                          oom_killed=False, hard_timeout=hard_timeout, exit_code=None,
                          wall_ms=int((time.monotonic() - t0) * 1000),
                          error=f"{type(exc).__name__}: {exc}", raw_log_tail=log_tail, timings=timings)
    finally:
        # FR-4: the container and its tmpfs scratch area are destroyed no matter what.
        if container is not None:
            emit("destroying", {"container_id": container.short_id})
            for attempt in range(3):
                try:
                    container.remove(force=True, v=True)
                    break
                except NotFound:
                    break
                except APIError:
                    time.sleep(0.3 * (attempt + 1))
            emit("destroyed", {"container_id": container.short_id,
                               "total_ms": int((time.monotonic() - t0) * 1000)})


_hard_killed: set[str] = set()


def _hard_kill(container) -> None:
    _hard_killed.add(container.id)
    try:
        container.kill()
    except Exception:  # noqa: BLE001
        pass


def _was_hard_killed(container) -> bool:
    if container.id in _hard_killed:
        _hard_killed.discard(container.id)
        return True
    return False
