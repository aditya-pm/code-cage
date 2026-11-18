import { motion } from "framer-motion";
import type { RunRecord } from "../types";
import { fmtMs } from "../api";
import { verdictStyle } from "../verdicts";

export default function VerdictCard({ record }: { record: RunRecord }) {
  const s = verdictStyle(record.verdict);
  const Icon = s.icon;
  const stats: [string, string][] = [
    ["Exit status", record.signal ? `${record.exit_code} (${record.signal})` : String(record.exit_code ?? "—")],
    ["Run time", fmtMs(record.run_ms)],
    [record.language === "python" ? "Syntax check" : "Compile", record.compiled ? fmtMs(record.compile_ms) : "n/a"],
    ["Total (incl. container)", fmtMs(record.wall_ms)],
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`relative overflow-hidden rounded-2xl border bg-ink-900/90 ring-1 ${s.ring}`} style={{ borderColor: `${s.color}40` }}>
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(500px 140px at 0% 0%, ${s.color}22, transparent 70%)` }} />
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${s.bg} ring-1 ${s.ring}`}>
            <Icon className={`h-6 w-6 ${s.text}`} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-lg font-semibold ${s.text}`}>{record.verdict}</h3>
              {record.requirement && <span className="chip !py-0.5 font-mono !text-[10px]">{record.requirement}</span>}
            </div>
            <p className="mt-0.5 text-[13px] text-slate-200">{record.reason}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{record.explanation}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-ink-700/70 bg-ink-850/80 px-3 py-2">
              <div className="text-[10.5px] uppercase tracking-wider text-slate-500">{k}</div>
              <div className="mt-0.5 font-mono text-sm text-slate-100">{v}</div>
            </div>
          ))}
        </div>
        {record.container_id && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
            <span>sandbox</span>
            <span className="font-mono text-slate-400 line-through decoration-red-400/70">{record.container_id}</span>
            <span className="text-emerald-400/90">destroyed ✓</span>
            {record.sandbox_uid != null && <span>· ran as uid <span className="font-mono text-slate-300">{record.sandbox_uid}</span></span>}
            {record.oom_killed && <span className="text-pink-300">· cgroup OOM kill recorded</span>}
            {record.pids_max_hits > 0 && <span className="text-red-300">· {record.pids_max_hits} forks refused by pids.max</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}
