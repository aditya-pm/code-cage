"""Platform settings (env) and the language registry (config/languages.yaml)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

LANG_FILE = Path(os.getenv("CODECAGE_LANGUAGES", "/app/config/languages.yaml"))
ATTACKS_DIR = Path(os.getenv("CODECAGE_ATTACKS", "/app/attacks"))


@dataclass(frozen=True)
class Settings:
    podman_url: str = os.getenv("PODMAN_URL", "unix:///run/podman/podman.sock")
    database_url: str = os.getenv("DATABASE_URL", "postgresql://codecage:codecage@db:5432/codecage")
    max_concurrent: int = int(os.getenv("MAX_CONCURRENT", "4"))      # FR-7
    max_queue: int = int(os.getenv("MAX_QUEUE", "16"))                # FR-7
    max_code_kb: int = int(os.getenv("MAX_CODE_KB", "64"))            # FR-1
    max_stdin_kb: int = int(os.getenv("MAX_STDIN_KB", "32"))          # FR-1
    sandbox_user: str = os.getenv("SANDBOX_USER", "10001:10001")      # SR-2


@dataclass(frozen=True)
class Language:
    id: str
    name: str
    version: str
    image: str
    file: str
    monaco: str
    compile: list[str]
    run: list[str]
    compile_timeout_s: float
    time_limit_s: float
    memory_mb: int
    pids: int
    cpus: float
    output_cap_kb: int
    output_kill_kb: int
    scratch_mb: int
    tmp_mb: int
    max_file_mb: int
    open_files: int
    template: str = ""
    sample_stdin: str = ""

    def public(self) -> dict:
        return {
            "id": self.id, "name": self.name, "version": self.version, "image": self.image,
            "file": self.file, "monaco": self.monaco, "compiled": bool(self.compile),
            "template": self.template, "sample_stdin": self.sample_stdin,
            "limits": {
                "time_limit_s": self.time_limit_s, "compile_timeout_s": self.compile_timeout_s,
                "memory_mb": self.memory_mb, "pids": self.pids, "cpus": self.cpus,
                "output_cap_kb": self.output_cap_kb, "output_kill_kb": self.output_kill_kb,
                "scratch_mb": self.scratch_mb, "tmp_mb": self.tmp_mb,
                "max_file_mb": self.max_file_mb, "open_files": self.open_files,
                "network": "none", "user": settings.sandbox_user, "rootfs": "read-only",
                "capabilities": "all dropped", "no_new_privileges": True,
            },
        }


def load_languages(path: Path = LANG_FILE) -> dict[str, Language]:
    raw = yaml.safe_load(path.read_text())
    defaults = raw.get("defaults", {})
    out: dict[str, Language] = {}
    for lid, cfg in raw["languages"].items():
        merged = {**defaults, **cfg}
        merged.setdefault("compile", [])
        out[lid] = Language(id=lid, **merged)
    return out


settings = Settings()
LANGUAGES = load_languages()
