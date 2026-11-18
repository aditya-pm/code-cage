"""CodeCage API."""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from . import attacks, db, sandbox
from .config import LANGUAGES, settings
from .scheduler import QueueFull, scheduler
from .verdict import ALL_VERDICTS

logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                    format="%(asctime)s %(levelname)-7s %(name)s  %(message)s")
log = logging.getLogger("codecage.api")

_platform: dict = {}


async def _reaper() -> None:
    """Belt-and-braces cleanup (FR-4): remove any orphaned sandbox every 30s."""
    while True:
        await asyncio.sleep(30)
        try:
            n = await asyncio.to_thread(sandbox.remove_sandboxes, scheduler.active_ids())
            if n:
                log.warning("reaper removed %d orphaned sandbox(es)", n)
        except Exception as exc:  # noqa: BLE001
            log.warning("reaper failed: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    try:
        info = await asyncio.to_thread(sandbox.podman_info)
        _platform.update(info)
        log.info("podman %s rootless=%s cgroups=%s", info["version"], info["rootless"],
                 info["cgroup_controllers"])
        if not info["rootless"]:
            log.error("SR-1 VIOLATION: podman is running rootful. Refusing to pretend otherwise.")
        n = await asyncio.to_thread(sandbox.remove_sandboxes, set())
        if n:
            log.warning("startup janitor removed %d leftover sandbox(es)", n)
    except Exception as exc:  # noqa: BLE001
        log.error("podman socket unavailable: %s", exc)
        _platform["error"] = str(exc)
    task = asyncio.create_task(_reaper())
    yield
    task.cancel()
    await db.close()


app = FastAPI(title="CodeCage API", version="1.0.0", lifespan=lifespan)


class SubmissionIn(BaseModel):
    language: str
    code: str
    stdin: str = ""
    source: str = Field(default="playground", pattern="^(playground|attack-lab|suite|cli)$")
    attack_id: str | None = None


@app.get("/api/health")
async def health():
    try:
        info = await asyncio.to_thread(sandbox.podman_info)
        _platform.update(info)
        _platform.pop("error", None)
        ok = True
    except Exception as exc:  # noqa: BLE001
        _platform["error"] = str(exc)
        ok = False
    return {"ok": ok, "podman": _platform, "queue": scheduler.snapshot()}


@app.get("/api/languages")
async def languages():
    sizes = await asyncio.to_thread(sandbox.image_sizes, LANGUAGES)
    return [{**lang.public(), "image_size": sizes.get(lid)} for lid, lang in LANGUAGES.items()]


@app.get("/api/verdicts")
async def verdicts():
    return ALL_VERDICTS


@app.post("/api/submissions", status_code=202)
async def submit(body: SubmissionIn):
    # FR-1 validation with beginner-readable messages.
    lang = LANGUAGES.get(body.language)
    if lang is None:
        raise HTTPException(400, f"Unsupported language '{body.language}'. "
                                 f"Choose one of: {', '.join(LANGUAGES)}.")
    if not body.code.strip():
        raise HTTPException(400, "Your submission is empty. Write some code first.")
    code_kb = len(body.code.encode()) / 1024
    if code_kb > settings.max_code_kb:
        raise HTTPException(413, f"Code is {code_kb:.1f} KB; the limit is {settings.max_code_kb} KB.")
    stdin_kb = len(body.stdin.encode()) / 1024
    if stdin_kb > settings.max_stdin_kb:
        raise HTTPException(413, f"Input is {stdin_kb:.1f} KB; the limit is {settings.max_stdin_kb} KB.")
    if "\x00" in body.code:
        raise HTTPException(400, "Code contains NUL bytes.")
    try:
        job = await scheduler.submit(lang, body.code, body.stdin, body.source, body.attack_id)
    except QueueFull:
        raise HTTPException(429, f"The platform is busy: {settings.max_concurrent} sandboxes are "
                                 f"running and {settings.max_queue} are waiting. Try again in a moment.")
    return {"id": job.id, "queue": scheduler.snapshot()}


@app.get("/api/submissions/{sub_id}/events")
async def events(sub_id: str):
    job = scheduler.jobs.get(sub_id)
    if job is None:
        row = await db.get(sub_id)
        if row is None:
            raise HTTPException(404, "No such submission.")

        async def replay():
            yield {"event": "verdict", "data": json.dumps({"type": "verdict", "record": row.get("result")})}
        return EventSourceResponse(replay())

    async def gen():
        async for ev in job.stream():
            yield {"event": ev["type"], "data": json.dumps(ev)}
    return EventSourceResponse(gen(), ping=10)


@app.get("/api/submissions/{sub_id}")
async def get_submission(sub_id: str):
    row = await db.get(sub_id)
    if row is None:
        raise HTTPException(404, "No such submission.")
    return row


@app.get("/api/submissions")
async def list_submissions(limit: int = Query(50, ge=1, le=500), verdict: str | None = None,
                           language: str | None = None):
    return {"items": await db.history(limit, verdict, language), "stats": await db.stats()}


@app.delete("/api/submissions")
async def clear_history():
    await db.clear()
    return {"ok": True}


@app.get("/api/attacks")
async def list_attacks():
    return attacks.catalogue()


@app.get("/api/queue")
async def queue():
    return scheduler.snapshot()


@app.get("/api/system/sandboxes")
async def sandboxes():
    """Live sandbox containers. Outside of active runs this must be empty (FR-4)."""
    items = await asyncio.to_thread(sandbox.list_sandboxes)
    return {"count": len(items), "items": items, "active_runs": len(scheduler.running)}
