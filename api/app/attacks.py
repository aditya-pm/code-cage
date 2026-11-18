"""The security test suite catalogue (Section 7), read from /app/attacks.

Each attack file starts with `@key: value` header comments:
    @id, @title, @expect (comma-separated acceptable verdicts), @sr, @summary
"""
from __future__ import annotations

import re
from functools import lru_cache

from .config import ATTACKS_DIR

EXT = {".py": "python", ".cpp": "cpp", ".java": "java"}
META = re.compile(r"^\s*(?:#|//)\s*@(\w+):\s*(.+?)\s*$")


@lru_cache
def catalogue() -> list[dict]:
    items = []
    for path in sorted(ATTACKS_DIR.glob("*")):
        lang = EXT.get(path.suffix)
        if not lang:
            continue
        text = path.read_text()
        meta: dict[str, str] = {}
        for line in text.splitlines()[:12]:
            m = META.match(line)
            if m:
                meta[m.group(1)] = m.group(2)
        items.append({
            "id": meta.get("id", path.stem), "file": path.name, "language": lang,
            "title": meta.get("title", path.stem), "summary": meta.get("summary", ""),
            "expect": [e.strip() for e in meta.get("expect", "").split(",") if e.strip()],
            "requirement": meta.get("sr", ""), "code": text,
        })
    return items


def get(attack_id: str) -> dict | None:
    return next((a for a in catalogue() if a["id"] == attack_id), None)
