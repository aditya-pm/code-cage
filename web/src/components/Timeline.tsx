import { motion } from "framer-motion";
import { Box, Check, Hammer, Inbox, Play, Recycle, ScanSearch, Trash2, X } from "lucide-react";
import type { LifecycleEvent, RunRecord } from "../types";

type StageState = "pending" | "active" | "done" | "failed" | "skipped";
interface Stage { key: string; title: string; detail: string; icon: typeof Box; state: StageState; t?: number; dur?: number | null }

export function deriveStages(events: LifecycleEvent[], compiled: boolean, record: RunRecord | null, langId: string): Stage[] {
  const seen = new Map<string, LifecycleEvent>();
  events.forEach((e) => { if (!seen.has(e.type)) seen.set(e.type, e); });
  const has = (t: string) => seen.has(t);
  const t = (k: string) => seen.get(k)?.t_ms;
  const cid = seen.get("created")?.container_id;
  const queuedPos = seen.get("queued")?.position;
  const ce = record?.verdict === "Compilation Error";
  const st = (start: string | null, end: string | null, failed = false): StageState => {
    if (end && has(end)) return failed ? "failed" : "done";
    if ((start === null || has(start)) && !record) return "active";
    if (record) return start && has(start) ? (failed ? "failed" : "done") : "skipped";
    return "pending";
  };

  const stages: Stage[] = [
    { key: "queue", title: "Queued", icon: Inbox, detail: queuedPos && queuedPos > 1 ? `position #${queuedPos} in the FIFO queue` : "waiting for a free sandbox slot",
      state: has("dequeued") ? "done" : has("queued") ? (record ? "done" : "active") : "pending", t: t("dequeued") },
    { key: "create", title: "podman create", icon: Box, detail: cid ? `container ${cid} · rootless · network=none · read-only` : "fresh container from " + `runtime-${langId}`,
      state: st("creating", "created"), t: t("created") },
    { key: "start", title: "Start", icon: Play, detail: "cage-runner is PID 1 · uid 10001 · caps dropped",
      state: st("created", "started"), t: t("started") },
  ];
  if (compiled) {
    stages.push({ key: "compile", title: langId === "python" ? "Syntax check" : "Compile", icon: Hammer,
      detail: ce ? "compiler rejected the code" : "inside the sandbox, own time limit",
      state: ce ? "failed" : st("compiling", "running"), t: t("running") ?? (ce ? t("destroying") : undefined), dur: record?.compile_ms });
  }
  stages.push(
    { key: "run", title: "Execute", icon: ScanSearch, detail: "wall-clock, memory, PID & output limits enforced",
      state: ce ? "skipped" : st("running", "collecting"), t: t("collecting"), dur: ce ? undefined : record?.run_ms },
    { key: "collect", title: "Collect results", icon: Recycle, detail: "nonce-signed result + cgroup OOM/PID counters",
      state: st(ce ? "destroying" : "collecting", "destroying"), t: t("destroying") },
    { key: "destroy", title: "podman rm -f", icon: Trash2, detail: has("destroyed") ? `container + tmpfs destroyed · total ${seen.get("destroyed")?.total_ms} ms` : "container and scratch area wiped",
      state: st("destroying", "destroyed"), t: t("destroyed") },
  );
  return stages;
}

const dot: Record<StageState, string> = {
  pending: "border-ink-600 bg-ink-850 text-slate-600",
  active: "border-cage-400 bg-cage-500/15 text-cage-300 animate-pulseRing",
  done: "border-cage-500/60 bg-cage-500/15 text-cage-300",
  failed: "border-amber-400/70 bg-amber-500/15 text-amber-300",
  skipped: "border-ink-700 bg-ink-900 text-slate-700",
};

export default function Timeline({ stages }: { stages: Stage[] }) {
  return (
    <ol className="relative space-y-1">
      {stages.map((s, i) => {
        const Icon = s.state === "done" ? Check : s.state === "failed" ? X : s.icon;
        return (
          <motion.li key={s.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
            className="relative flex items-start gap-3 py-1">
            {i < stages.length - 1 && (
              <span className={`absolute left-[13px] top-8 h-[calc(100%-18px)] w-px ${s.state === "done" ? "bg-cage-500/40" : "bg-ink-700"}`} />
            )}
            <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${dot[s.state]}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[13px] font-medium ${s.state === "pending" || s.state === "skipped" ? "text-slate-500" : "text-slate-100"} ${s.key === "create" || s.key === "destroy" ? "font-mono" : ""}`}>
                  {s.title}{s.state === "skipped" && <span className="ml-2 text-[11px] font-normal text-slate-600">skipped</span>}
                </span>
                {s.dur != null ? <span className="font-mono text-[11px] text-cage-300" title="measured inside the sandbox">{s.dur} ms</span>
                  : s.t != null && <span className="font-mono text-[11px] text-slate-500">+{s.t} ms</span>}
              </div>
              <p className="truncate text-[11.5px] text-slate-500">{s.detail}</p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
