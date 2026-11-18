#!/usr/bin/env python3
"""CodeCage security test suite (Section 7 of the project description).

Submits every attack in attacks/ to a running platform, all at once (which
also exercises the concurrency queue), checks each verdict against the
expected outcome, verifies no sandbox containers were left behind, and writes
evidence to reports/security-results.{md,json}.

Usage: python3 tests/security/run_suite.py [--url http://localhost:8080] [--sequential]
Standard library only.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
G, R, Y, D, B, X = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[1m", "\033[0m"


def call(url: str, method: str = "GET", body: dict | None = None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def run_attack(base: str, attack: dict) -> dict:
    t0 = time.time()
    sub = call(f"{base}/api/submissions", "POST", {"language": attack["language"], "code": attack["code"],
                                                   "stdin": "", "source": "suite", "attack_id": attack["id"]})
    while True:
        row = call(f"{base}/api/submissions/{sub['id']}")
        if row.get("result"):
            res = row["result"]
            break
        if time.time() - t0 > 120:
            raise TimeoutError(attack["id"])
        time.sleep(0.4)
    res["contained"] = res["verdict"] in attack["expect"]
    res["client_ms"] = int((time.time() - t0) * 1000)
    return res


def host_load() -> str:
    try:
        return subprocess.run(["podman", "machine", "ssh", "cat /proc/loadavg"], capture_output=True,
                              text=True, timeout=15).stdout.strip() or "n/a"
    except Exception:  # noqa: BLE001
        try:
            return open("/proc/loadavg").read().strip()
        except OSError:
            return "n/a"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--sequential", action="store_true", help="run one attack at a time")
    args = ap.parse_args()
    base = args.url.rstrip("/")

    try:
        health = call(f"{base}/api/health")
    except urllib.error.URLError as e:
        print(f"{R}platform not reachable at {base}: {e}{X}  (run ./codecage up)")
        return 2
    attacks = call(f"{base}/api/attacks")
    p = health["podman"]
    print(f"{B}CodeCage security suite{X}  {D}podman {p.get('version')} · rootless={p.get('rootless')} · "
          f"{p.get('os')} {p.get('os_version')} · {len(attacks)} attacks{X}\n")

    load_before = host_load()
    started = time.time()
    results: dict[str, dict] = {}
    workers = 1 if args.sequential else len(attacks)
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(run_attack, base, a): a for a in attacks}
        for fut in cf.as_completed(futs):
            a = futs[fut]
            try:
                res = fut.result()
            except Exception as e:  # noqa: BLE001
                res = {"verdict": "ERROR", "reason": str(e), "contained": False}
            results[a["id"]] = res
            mark = f"{G}✔ CONTAINED{X}" if res["contained"] else f"{R}✘ UNEXPECTED{X}"
            print(f"  {mark}  {a['title']:<34} {res['verdict']:<24} {D}{res.get('reason', '')[:80]}{X}")
    elapsed = time.time() - started
    load_after = host_load()
    time.sleep(1)
    leftovers = call(f"{base}/api/system/sandboxes")

    ok = sum(r["contained"] for r in results.values())
    print(f"\n  {B}{ok}/{len(attacks)} contained{X} in {elapsed:.1f}s · leftover sandbox containers: "
          f"{G if leftovers['count'] == 0 else R}{leftovers['count']}{X} · host loadavg {load_before} → {load_after}")

    # ---- evidence -----------------------------------------------------------
    out = ROOT / "reports"
    out.mkdir(exist_ok=True)
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    (out / "security-results.json").write_text(json.dumps(
        {"generated": now, "platform": health, "leftover_sandboxes": leftovers, "elapsed_s": elapsed,
         "host_loadavg": {"before": load_before, "after": load_after},
         "results": [{"attack": a, "result": results[a["id"]]} for a in attacks]}, indent=2))

    md = [f"# CodeCage security test results\n",
          f"Generated **{now}** against `{base}`  ",
          f"Podman **{p.get('version')}** · rootless **{p.get('rootless')}** · {p.get('os')} {p.get('os_version')} · "
          f"kernel `{p.get('kernel')}` · cgroups {p.get('cgroup_version')} {p.get('cgroup_controllers')} · "
          f"seccomp {p.get('seccomp')} · SELinux {p.get('selinux')}\n",
          f"**{ok}/{len(attacks)} attacks contained.** All submitted concurrently "
          f"(max {health['queue']['max_concurrent']} sandboxes at once, rest queued). "
          f"Leftover sandbox containers afterwards: **{leftovers['count']}**. "
          f"Host load average before/after: `{load_before}` → `{load_after}`.\n",
          "| # | Attack | Lang | Expected | Actual verdict | Contained | Requirement | Evidence |",
          "|---|---|---|---|---|---|---|---|"]
    for i, a in enumerate(attacks, 1):
        r = results[a["id"]]
        md.append(f"| {i} | {a['title']} | {a['language']} | {' / '.join(a['expect'])} | **{r['verdict']}** | "
                  f"{'✅' if r['contained'] else '❌'} | {a['requirement']} | {r.get('reason', '')} |")
    md.append("\n## Evidence per attack\n")
    for i, a in enumerate(attacks, 1):
        r = results[a["id"]]
        md += [f"### {i}. {a['title']}  (`attacks/{a['file']}`)\n", f"{a['summary']}\n",
               f"- **Expected:** {' / '.join(a['expect'])}",
               f"- **Actual:** {r['verdict']}: {r.get('reason', '')}",
               f"- **Container:** `{r.get('container_id')}` (removed) · exit `{r.get('exit_code')}` "
               f"{('signal ' + r['signal']) if r.get('signal') else ''} · run {r.get('run_ms')} ms · total {r.get('wall_ms')} ms",
               f"- **cgroup counters:** oom_killed={r.get('oom_killed')} · refused forks={r.get('pids_max_hits')} · "
               f"sandbox uid={r.get('sandbox_uid')}\n",
               "```text", "# stdout", (r.get("stdout") or "")[:1500].rstrip(), "# stderr",
               (r.get("stderr") or "")[-1200:].rstrip(), "```\n"]
    (out / "security-results.md").write_text("\n".join(md))
    print(f"  {D}evidence written to reports/security-results.md and .json{X}")
    return 0 if ok == len(attacks) and leftovers["count"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
