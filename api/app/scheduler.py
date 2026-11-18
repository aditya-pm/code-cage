"""Concurrency control (FR-7) and live lifecycle events for each submission.

At most `max_concurrent` sandboxes run at once; up to `max_queue` more wait in
FIFO order. Anything beyond that is rejected cleanly with HTTP 429.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field

from . import db, sandbox
from .config import Language, settings
from .verdict import INTERNAL, classify

log = logging.getLogger("codecage.scheduler")
exec_log = logging.getLogger("codecage.executions")


class QueueFull(Exception):
    pass


@dataclass
class Job:
    id: str
    lang: Language
    code: str
    stdin: str
    created: float = field(default_factory=time.monotonic)
    events: list[dict] = field(default_factory=list)
    cond: asyncio.Condition = field(default_factory=asyncio.Condition)
    done: bool = False
    record: dict | None = None

    async def push(self, kind: str, data: dict | None = None) -> None:
        async with self.cond:
            self.events.append({"type": kind, "t_ms": int((time.monotonic() - self.created) * 1000),
                                **(data or {})})
            self.cond.notify_all()

    async def stream(self):
        i = 0
        while True:
            async with self.cond:
                while i >= len(self.events) and not self.done:
                    await self.cond.wait()
                batch, i = self.events[i:], len(self.events)
                finished = self.done
            for ev in batch:
                yield ev
            if finished and i >= len(self.events):
                return


class Scheduler:
    def __init__(self) -> None:
        self.sem = asyncio.Semaphore(settings.max_concurrent)
        self.jobs: dict[str, Job] = {}
        self.waiting: list[str] = []
        self.running: set[str] = set()
        self.completed = 0

    def snapshot(self) -> dict:
        return {"running": len(self.running), "queued": len(self.waiting),
                "max_concurrent": settings.max_concurrent, "max_queue": settings.max_queue,
                "completed_since_start": self.completed}

    def active_ids(self) -> set[str]:
        return set(self.running) | set(self.waiting)

    async def submit(self, lang: Language, code: str, stdin: str, source: str,
                     attack_id: str | None) -> Job:
        if len(self.waiting) >= settings.max_queue:
            raise QueueFull()
        job = Job(id=uuid.uuid4().hex, lang=lang, code=code, stdin=stdin)
        # Reserve the queue slot synchronously (before any await) so concurrent
        # requests cannot all pass the capacity check at once.
        self.waiting.append(job.id)
        self.jobs[job.id] = job
        try:
            await db.insert(job.id, lang.id, code, stdin, source, attack_id)
        except Exception:
            self.waiting.remove(job.id)
            self.jobs.pop(job.id, None)
            raise
        await job.push("queued", {"position": len(self.waiting), "language": lang.id})
        asyncio.create_task(self._run(job))
        return job

    async def _run(self, job: Job) -> None:
        loop = asyncio.get_running_loop()
        try:
            async with self.sem:
                self.waiting.remove(job.id)
                self.running.add(job.id)
                await db.mark_running(job.id)
                await job.push("dequeued", {})

                def emit(kind: str, data: dict) -> None:  # called from the worker thread
                    asyncio.run_coroutine_threadsafe(job.push(kind, data), loop)

                outcome = await asyncio.to_thread(
                    sandbox.execute, job.id, job.lang, job.code, job.stdin, emit)
                record = build_record(job, outcome)
        except Exception as exc:  # noqa: BLE001 - never let a run crash the platform
            log.exception("job %s failed", job.id)
            record = {"id": job.id, "language": job.lang.id, "verdict": INTERNAL,
                      "reason": str(exc), "explanation": "The platform failed to run this submission."}
        finally:
            self.running.discard(job.id)
            if job.id in self.waiting:
                self.waiting.remove(job.id)
        try:
            await db.finish(job.id, record)
        except Exception:  # noqa: BLE001
            log.exception("could not persist %s", job.id)
        self.completed += 1
        job.record = record
        exec_log.info(json.dumps({
            "event": "execution", "submission": job.id, "language": job.lang.id,
            "verdict": record["verdict"], "reason": record.get("reason"),
            "wall_ms": record.get("wall_ms"), "run_ms": record.get("run_ms"),
            "container": record.get("container_id")}))
        await job.push("verdict", {"record": record})
        async with job.cond:
            job.done = True
            job.cond.notify_all()
        # Keep finished jobs briefly so late SSE subscribers can replay them.
        loop.call_later(300, self.jobs.pop, job.id, None)


def build_record(job: Job, outcome: sandbox.RunOutcome) -> dict:
    lang = job.lang
    res = outcome.result
    if outcome.error and res is None:
        v = {"verdict": INTERNAL, "reason": outcome.error,
             "explanation": "The platform could not run the sandbox. Are the runtime images built?",
             "requirement": None}
    else:
        v = classify(res, oom_killed=outcome.oom_killed, hard_timeout=outcome.hard_timeout,
                     time_limit_s=lang.time_limit_s, memory_mb=lang.memory_mb, pids=lang.pids).as_dict()
    comp = (res or {}).get("compile") or {}
    run = (res or {}).get("run") or {}
    return {
        "id": job.id, "language": lang.id, **v,
        "stdout": run.get("stdout", ""), "stderr": run.get("stderr", ""),
        "stdout_truncated": run.get("stdout_truncated", False),
        "stderr_truncated": run.get("stderr_truncated", False),
        "output_bytes": run.get("output_bytes", 0),
        "compile_output": ((comp.get("stdout", "") or "") + (comp.get("stderr", "") or "")),
        "compiled": bool(lang.compile),
        "exit_code": run.get("exit_code") if run else comp.get("exit_code"),
        "signal": run.get("signal"),
        "run_ms": run.get("duration_ms"), "compile_ms": comp.get("duration_ms"),
        "wall_ms": outcome.wall_ms, "container_id": outcome.container_id,
        "oom_killed": outcome.oom_killed or bool((res or {}).get("oom_kills")),
        "pids_max_hits": (res or {}).get("pids_max_hits", 0),
        "sandbox_uid": (res or {}).get("uid"),
        "timings": outcome.timings,
        "limits": lang.public()["limits"],
    }


scheduler = Scheduler()
