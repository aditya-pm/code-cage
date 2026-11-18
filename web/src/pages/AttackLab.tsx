import { motion } from "framer-motion";
import { Activity, CheckCircle2, Code2, Crosshair, Loader2, Play, ShieldCheck, Skull, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, fmtMs, runSubmission } from "../api";
import Drawer from "../components/Drawer";
import OutputPanel from "../components/OutputPanel";
import VerdictCard from "../components/VerdictCard";
import type { Attack, LifecycleEvent, RunRecord } from "../types";
import { VerdictBadge } from "../verdicts";

type Status = "idle" | "queued" | "running" | "contained" | "breach" | "error";
interface Run { status: Status; record?: RunRecord; phase?: string; error?: string; container?: string }

const LANG_LABEL: Record<string, string> = { python: "Python", cpp: "C++", java: "Java" };

export default function AttackLab({ attacks, onOpen }: { attacks: Attack[]; onOpen: (a: Attack) => void }) {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [selected, setSelected] = useState<Attack | null>(null);
  const [heartbeat, setHeartbeat] = useState<number[]>([]);
  const [leftover, setLeftover] = useState<number | null>(null);
  const [batch, setBatch] = useState(false);
  const beatRef = useRef<ReturnType<typeof setInterval>>();

  const anyRunning = Object.values(runs).some((r) => r.status === "queued" || r.status === "running");

  // Responsiveness probe: round-trip latency to the platform while attacks run.
  useEffect(() => {
    if (!anyRunning) { clearInterval(beatRef.current); return; }
    beatRef.current = setInterval(async () => {
      const t = performance.now();
      try { await api("/api/queue"); setHeartbeat((h) => [...h.slice(-39), Math.round(performance.now() - t)]); } catch { /* ignore */ }
    }, 400);
    return () => clearInterval(beatRef.current);
  }, [anyRunning]);

  useEffect(() => {
    if (batch && !anyRunning && Object.keys(runs).length) {
      setBatch(false);
      setTimeout(() => api<{ count: number }>("/api/system/sandboxes").then((s) => setLeftover(s.count)).catch(() => {}), 800);
    }
  }, [anyRunning, batch, runs]);

  const launch = async (a: Attack) => {
    setRuns((r) => ({ ...r, [a.id]: { status: "queued" } }));
    try {
      const rec = await runSubmission(
        { language: a.language, code: a.code, stdin: "", source: "attack-lab", attack_id: a.id },
        (e: LifecycleEvent) => setRuns((r) => ({
          ...r, [a.id]: {
            ...r[a.id],
            status: ["created", "started", "compiling", "running", "collecting", "destroying", "destroyed"].includes(e.type) ? "running" : r[a.id]?.status ?? "queued",
            phase: e.type, container: e.container_id ?? r[a.id]?.container,
          },
        })));
      const contained = a.expect.length === 0 || a.expect.includes(rec.verdict);
      setRuns((r) => ({ ...r, [a.id]: { status: contained ? "contained" : "breach", record: rec } }));
    } catch (e) {
      setRuns((r) => ({ ...r, [a.id]: { status: "error", error: (e as Error).message } }));
    }
  };

  const launchAll = () => {
    setLeftover(null); setHeartbeat([]); setBatch(true); setRuns({});
    attacks.forEach((a, i) => setTimeout(() => launch(a), i * 60));
  };

  const done = Object.values(runs).filter((r) => r.status === "contained").length;
  const breaches = Object.values(runs).filter((r) => r.status === "breach").length;
  const finished = Object.values(runs).filter((r) => ["contained", "breach", "error"].includes(r.status)).length;
  const maxBeat = Math.max(50, ...heartbeat);
  const selRun = selected ? runs[selected.id] : undefined;

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:px-6">
      {/* Hero */}
      <div className="panel relative mb-4 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(700px 200px at 0% 0%, rgba(248,113,113,.12), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-center gap-6 p-5">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 ring-1 ring-red-400/40"><Skull className="h-7 w-7 text-red-300" /></div>
          <div className="min-w-[260px] flex-1">
            <h1 className="text-xl font-semibold text-white">Attack Lab: proof of isolation</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-slate-400">
              Ten deliberately malicious submissions from the security test suite. Each runs in its own throw-away container.
              Launch them all at once: they also show the concurrency queue at work while the host stays responsive.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="font-mono text-3xl font-semibold text-white">{done}<span className="text-slate-600">/{attacks.length}</span></div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">contained</div>
            </div>
            <button className="btn-danger !px-5 !py-3 text-[15px]" onClick={launchAll} disabled={anyRunning}>
              {anyRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
              {anyRunning ? `Attacking… ${finished}/${attacks.length}` : "Launch all attacks"}
            </button>
          </div>
        </div>
        {(heartbeat.length > 0 || leftover !== null) && (
          <div className="relative flex flex-wrap items-center gap-6 border-t border-ink-700/70 px-5 py-3">
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-cage-400" />
              <span className="text-[12px] text-slate-400">Platform heartbeat</span>
              <div className="flex h-7 items-end gap-[2px]">
                {heartbeat.map((b, i) => (
                  <span key={i} className={`w-[4px] rounded-sm ${b > 1000 ? "bg-red-400" : b > 300 ? "bg-amber-400" : "bg-cage-400/80"}`} style={{ height: `${Math.max(8, (b / maxBeat) * 100)}%` }} />
                ))}
              </div>
              {heartbeat.length > 0 && <span className="font-mono text-[12px] text-slate-300">{heartbeat[heartbeat.length - 1]} ms</span>}
              <span className="text-[11px] text-slate-500">host stays responsive</span>
            </div>
            {leftover !== null && (
              <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                className={`ml-auto flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] ring-1 ${leftover === 0 ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/40" : "bg-amber-500/10 text-amber-300 ring-amber-400/40"}`}>
                <ShieldCheck className="h-4 w-4" />
                {leftover === 0 ? "0 sandbox containers left behind: every container destroyed" : `${leftover} sandbox(es) still present`}
                {breaches === 0 && done === attacks.length && <span className="font-semibold">· {done}/{attacks.length} contained</span>}
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {attacks.map((a, i) => {
          const r = runs[a.id];
          const st = r?.status ?? "idle";
          const ring = st === "contained" ? "border-emerald-500/40" : st === "breach" ? "border-red-500/60" : st === "running" || st === "queued" ? "border-cage-500/40" : "border-ink-700/80";
          return (
            <motion.div key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-ink-900/80 p-4 transition ${ring}`}>
              {(st === "running" || st === "queued") && <div className="pointer-events-none absolute inset-0 animate-scan bg-gradient-to-b from-transparent via-cage-500/10 to-transparent" />}
              {st === "contained" && <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(300px 120px at 100% 0%, rgba(52,211,153,.12), transparent 70%)" }} />}
              <div className="relative flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-800 font-mono text-[12px] text-slate-400 ring-1 ring-ink-600">{String(i + 1).padStart(2, "0")}</span>
                  <span className="chip !py-0.5 !text-[10px]">{LANG_LABEL[a.language]}</span>
                </div>
                <StatusPill run={r} />
              </div>
              <h3 className="relative mt-3 text-[15px] font-semibold text-white">{a.title}</h3>
              <p className="relative mt-1 line-clamp-3 flex-1 text-[12.5px] leading-relaxed text-slate-400">{a.summary}</p>
              <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
                {a.requirement.split(",").map((s) => <span key={s} className="chip !py-0.5 font-mono !text-[10px] !text-cage-300">{s.trim()}</span>)}
                <span className="text-[11px] text-slate-500">expect</span>
                {a.expect.slice(0, 1).map((e) => <VerdictBadge key={e} verdict={e} />)}
              </div>
              {r?.record && (
                <div className="relative mt-3 rounded-xl border border-ink-700/70 bg-ink-850/80 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <VerdictBadge verdict={r.record.verdict} />
                    <span className="font-mono text-[11px] text-slate-500">{fmtMs(r.record.wall_ms)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11.5px] text-slate-400">{r.record.reason}</p>
                </div>
              )}
              {r?.error && <p className="relative mt-3 text-[12px] text-red-300">{r.error}</p>}
              <div className="relative mt-3 flex gap-2">
                <button className="btn-ghost flex-1 !py-1.5 !text-[12.5px]" onClick={() => launch(a)} disabled={st === "running" || st === "queued"}>
                  <Play className="h-3.5 w-3.5" />Run
                </button>
                <button className="btn-ghost flex-1 !py-1.5 !text-[12.5px]" onClick={() => (r?.record ? setSelected(a) : onOpen(a))}>
                  <Code2 className="h-3.5 w-3.5" />{r?.record ? "Evidence" : "Open in editor"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)}
        title={selected && <div><div className="label">Evidence · attack {selected.id}</div><div className="text-lg font-semibold text-white">{selected.title}</div></div>}>
        {selected && selRun?.record && (
          <div className="space-y-4">
            <VerdictCard record={selRun.record} />
            <OutputPanel record={selRun.record} className="h-[340px]" />
            <div className="panel">
              <div className="panel-head"><span className="label">Attack source · {selected.file}</span>
                <button className="btn-ghost !py-1 !text-[12px]" onClick={() => { onOpen(selected); setSelected(null); }}>Open in editor</button></div>
              <pre className="max-h-80 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-slate-300">{selected.code}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function StatusPill({ run }: { run?: Run }) {
  const st = run?.status ?? "idle";
  if (st === "idle") return <span className="text-[11px] text-slate-600">ready</span>;
  if (st === "queued") return <span className="flex items-center gap-1 text-[11px] text-amber-300"><Loader2 className="h-3 w-3 animate-spin" />queued</span>;
  if (st === "running") return <span className="flex items-center gap-1 font-mono text-[11px] text-cage-300"><Loader2 className="h-3 w-3 animate-spin" />{run?.phase}{run?.container ? ` · ${run.container}` : ""}</span>;
  if (st === "contained") return <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/40"><CheckCircle2 className="h-3.5 w-3.5" />Contained</span>;
  if (st === "breach") return <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-400/40"><XCircle className="h-3.5 w-3.5" />Unexpected</span>;
  return <span className="text-[11px] text-red-300">error</span>;
}
