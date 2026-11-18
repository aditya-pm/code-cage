import { useEffect, useState } from "react";
import type { RunRecord } from "../types";
import { fmtBytes } from "../api";

type Tab = "stdout" | "stderr" | "compile";

export default function OutputPanel({ record, className = "" }: { record: RunRecord | null; className?: string }) {
  const [tab, setTab] = useState<Tab>("stdout");
  useEffect(() => {
    if (!record) return;
    if (record.verdict === "Compilation Error") setTab("compile");
    else if (!record.stdout && record.stderr) setTab("stderr");
    else setTab("stdout");
  }, [record]);

  const tabs: { k: Tab; label: string; body: string; trunc?: boolean; show: boolean }[] = [
    { k: "stdout", label: "stdout", body: record?.stdout ?? "", trunc: record?.stdout_truncated, show: true },
    { k: "stderr", label: "stderr", body: record?.stderr ?? "", trunc: record?.stderr_truncated, show: true },
    { k: "compile", label: record?.language === "python" ? "syntax check" : "compiler", body: record?.compile_output ?? "", show: !!record?.compiled },
  ];
  const cur = tabs.find((t) => t.k === tab)!;
  return (
    <div className={`panel flex min-h-0 flex-col ${className}`}>
      <div className="panel-head !py-0">
        <div className="flex">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`relative px-3 py-2.5 font-mono text-[12px] transition ${tab === t.k ? "text-cage-300" : "text-slate-500 hover:text-slate-300"}`}>
              {t.label}
              {t.body && <span className="ml-1.5 rounded bg-ink-700 px-1 text-[10px] text-slate-400">{t.body.split("\n").filter(Boolean).length}</span>}
              {tab === t.k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-cage-400" />}
            </button>
          ))}
        </div>
        {record && <span className="text-[11px] text-slate-500">{fmtBytes(record.output_bytes)} produced</span>}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-relaxed text-slate-200">
        {record ? (cur.body || <span className="text-slate-600">(empty)</span>) : <span className="text-slate-600">Run your code to see output here.</span>}
        {cur.trunc && <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[11.5px] text-yellow-200">⚠ Output truncated at {record?.limits.output_cap_kb} KB (SR-11)</div>}
      </pre>
    </div>
  );
}
