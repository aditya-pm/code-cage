"""Submission history in Postgres (FR-6: persists across platform restarts)."""
from __future__ import annotations

import asyncio
import json
import logging

import asyncpg

from .config import settings

log = logging.getLogger("codecage.db")
_pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS submissions (
    id              TEXT PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    language        TEXT NOT NULL,
    code            TEXT NOT NULL,
    stdin           TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'queued',
    verdict         TEXT,
    reason          TEXT,
    requirement     TEXT,
    exit_code       INTEGER,
    run_ms          INTEGER,
    compile_ms      INTEGER,
    wall_ms         INTEGER,
    container_id    TEXT,
    source          TEXT NOT NULL DEFAULT 'playground',
    attack_id       TEXT,
    result          JSONB
);
CREATE INDEX IF NOT EXISTS submissions_created_idx ON submissions (created_at DESC);
"""

SUMMARY_COLS = ("id, created_at, finished_at, language, status, verdict, reason, requirement, "
                "exit_code, run_ms, compile_ms, wall_ms, container_id, source, attack_id, "
                "left(code, 160) AS code_preview")


async def connect(retries: int = 30) -> None:
    global _pool
    for attempt in range(1, retries + 1):
        try:
            _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=8)
            async with _pool.acquire() as con:
                await con.execute(SCHEMA)
                # Runs interrupted by a platform crash can never finish.
                await con.execute("UPDATE submissions SET status='lost', verdict='Internal Error', "
                                  "reason='Platform restarted while this run was in progress.' "
                                  "WHERE status IN ('queued','running')")
            log.info("database ready")
            return
        except (OSError, asyncpg.PostgresError) as exc:
            log.warning("database not ready (attempt %d/%d): %s", attempt, retries, exc)
            await asyncio.sleep(1.5)
    raise RuntimeError("could not connect to the database")


async def close() -> None:
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool is not None, "database not connected"
    return _pool


async def insert(sub_id: str, language: str, code: str, stdin: str, source: str, attack_id: str | None):
    await pool().execute(
        "INSERT INTO submissions (id, language, code, stdin, source, attack_id) VALUES ($1,$2,$3,$4,$5,$6)",
        sub_id, language, code, stdin, source, attack_id)


async def mark_running(sub_id: str):
    await pool().execute("UPDATE submissions SET status='running' WHERE id=$1", sub_id)


async def finish(sub_id: str, record: dict):
    await pool().execute(
        """UPDATE submissions SET status='done', finished_at=now(), verdict=$2, reason=$3,
               requirement=$4, exit_code=$5, run_ms=$6, compile_ms=$7, wall_ms=$8,
               container_id=$9, result=$10::jsonb WHERE id=$1""",
        sub_id, record["verdict"], record["reason"], record.get("requirement"),
        record.get("exit_code"), record.get("run_ms"), record.get("compile_ms"),
        record.get("wall_ms"), record.get("container_id"), json.dumps(record))


def _row(r: asyncpg.Record) -> dict:
    d = dict(r)
    for k in ("created_at", "finished_at"):
        if d.get(k):
            d[k] = d[k].isoformat()
    if isinstance(d.get("result"), str):
        d["result"] = json.loads(d["result"])
    return d


async def get(sub_id: str) -> dict | None:
    r = await pool().fetchrow("SELECT * FROM submissions WHERE id=$1", sub_id)
    return _row(r) if r else None


async def history(limit: int = 50, verdict: str | None = None, language: str | None = None) -> list[dict]:
    q = f"SELECT {SUMMARY_COLS} FROM submissions WHERE ($1::text IS NULL OR verdict=$1) " \
        f"AND ($2::text IS NULL OR language=$2) ORDER BY created_at DESC LIMIT $3"
    return [_row(r) for r in await pool().fetch(q, verdict, language, limit)]


async def stats() -> dict:
    rows = await pool().fetch("SELECT verdict, count(*) AS n FROM submissions "
                              "WHERE verdict IS NOT NULL GROUP BY verdict")
    total = await pool().fetchval("SELECT count(*) FROM submissions")
    return {"total": total, "by_verdict": {r["verdict"]: r["n"] for r in rows}}


async def clear():
    await pool().execute("DELETE FROM submissions")
