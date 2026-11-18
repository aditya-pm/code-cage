import { Database, FileCode2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, fmtMs } from "../api";
import Drawer from "../components/Drawer";
import OutputPanel from "../components/OutputPanel";
import VerdictCard from "../components/VerdictCard";
import type { HistoryItem, RunRecord } from "../types";
import { VERDICTS, VerdictBadge, verdictStyle } from "../verdicts";

interface Full extends HistoryItem { code: string; stdin: string; result: RunRecord | null }
const LANG: Record<string, string> = { python: "Python", cpp: "C++", java: "Java" };

export default function History({ onLoad }: { onLoad: (language: string, code: string, stdin: string) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<{ total: number; by_verdict: Record<string, number> }>({ total: 0, by_verdict: {} });
  const [filter, setFilter] = useState<string | null>(null);
  const [sel, setSel] = useState<Full | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "200", ...(filter ? { verdict: filter } : {}) });
      const r = await api<{ items: HistoryItem[]; stats: typeof stats }>(`/api/submissions?${q}`);
      setItems(r.items); setStats(r.stats);
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const open = async (id: string) => setSel(await api<Full>(`/api/submissions/${id}`));

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white"><Database className="h-5 w-5 text-cage-400" />Submission history</h1>
          <p className="mt-1 text-[13px] text-slate-400">Stored in Postgres on the <span className="font-mono text-slate-300">codecage-pgdata</span> volume, so it survives <span className="font-mono text-slate-300">./codecage restart</span>.</p>
        </div>
        <button className="btn-ghost" onClick={load}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setFilter(null)}
          className={`rounded-xl border px-3 py-2 text-left transition ${filter === null ? "border-cage-500/50 bg-cage-500/10" : "border-ink-700 bg-ink-900/70 hover:border-ink-500"}`}>
          <div className="font-mono text-lg text-white">{stats.total}</div><div className="text-[11px] text-slate-500">all runs</div>
        </button>
        {Object.keys(VERDICTS).map((v) => {
          const s = verdictStyle(v); const n = stats.by_verdict[v] ?? 0;
          if (!n && v === "Internal Error") return null;
          return (
            <button key={v} onClick={() => setFilter(filter === v ? null : v)}
              className={`rounded-xl border px-3 py-2 text-left transition ${filter === v ? `${s.bg} border-transparent ring-1 ${s.ring}` : "border-ink-700 bg-ink-900/70 hover:border-ink-500"}`}>
              <div className={`font-mono text-lg ${n ? s.text : "text-slate-600"}`}>{n}</div><div className="text-[11px] text-slate-500">{v}</div>
            </button>
          );
        })}
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-ink-700 bg-ink-850/80 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>{["When", "Submission", "Language", "Source", "Verdict", "Reason", "Run", "Total", "Container"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} onClick={() => open(it.id)} className="cursor-pointer border-b border-ink-800 transition hover:bg-ink-800/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{new Date(it.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-slate-300">{it.id.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">{LANG[it.language] ?? it.language}</td>
                  <td className="px-4 py-2.5 text-slate-400">{it.attack_id ? <span className="text-red-300">attack · {it.attack_id}</span> : it.source}</td>
                  <td className="px-4 py-2.5">{it.verdict ? <VerdictBadge verdict={it.verdict} /> : <span className="text-[12px] text-cage-300">{it.status}…</span>}</td>
                  <td className="max-w-[320px] truncate px-4 py-2.5 text-slate-400" title={it.reason ?? ""}>{it.reason}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-slate-300">{fmtMs(it.run_ms)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-slate-400">{fmtMs(it.wall_ms)}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500 line-through decoration-slate-600">{it.container_id}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-500">No submissions yet. Run something in the Playground.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer open={!!sel} onClose={() => setSel(null)}
        title={sel && <div><div className="label">Submission · {new Date(sel.created_at).toLocaleString()}</div><div className="font-mono text-[15px] text-white">{sel.id}</div></div>}>
        {sel && (
          <div className="space-y-4">
            {sel.result ? <VerdictCard record={sel.result} /> : <div className="text-slate-400">No result stored ({sel.status}).</div>}
            {sel.result && <OutputPanel record={sel.result} className="h-[300px]" />}
            <div className="panel">
              <div className="panel-head">
                <span className="label">Source · {LANG[sel.language]}</span>
                <button className="btn-primary !py-1 !text-[12px]" onClick={() => { onLoad(sel.language, sel.code, sel.stdin); setSel(null); }}>
                  <FileCode2 className="h-3.5 w-3.5" />Load into editor
                </button>
              </div>
              <pre className="max-h-96 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-slate-300">{sel.code}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
