import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Loader2, Play, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { runSubmission } from "../api";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import PolicyStrip from "../components/PolicyStrip";
import Timeline, { deriveStages } from "../components/Timeline";
import VerdictCard from "../components/VerdictCard";
import type { Language, LifecycleEvent, RunRecord } from "../types";

export interface EditorState { language: string; code: Record<string, string>; stdin: Record<string, string> }

interface Props {
  languages: Language[]; state: EditorState; setState: (fn: (s: EditorState) => EditorState) => void;
  source?: string; attackId?: string | null;
}

const LANG_ICON: Record<string, string> = { python: "🐍", cpp: "⚙️", java: "☕" };

export default function Playground({ languages, state, setState, attackId }: Props) {
  const lang = languages.find((l) => l.id === state.language) ?? languages[0];
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [record, setRecord] = useState<RunRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!lang) return null;
  const code = state.code[lang.id] ?? lang.template;
  const stdin = state.stdin[lang.id] ?? lang.sample_stdin;

  const run = async () => {
    if (running) return;
    setRunning(true); setError(null); setRecord(null); setEvents([]);
    try {
      const rec = await runSubmission(
        { language: lang.id, code, stdin, source: attackId ? "attack-lab" : "playground", attack_id: attackId ?? undefined },
        (e) => setEvents((xs) => [...xs, e]));
      setRecord(rec);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const upload = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    const target = ext === "py" ? "python" : ext && ["cpp", "cc", "cxx", "c++", "hpp"].includes(ext) ? "cpp" : ext === "java" ? "java" : lang.id;
    f.text().then((t) => setState((s) => ({ ...s, language: target, code: { ...s.code, [target]: t } })));
  };

  const stages = deriveStages(events, lang.compiled, record, lang.id);
  const started = running || record || events.length > 0;

  return (
    <div className="grid h-[calc(100vh-64px)] min-h-[640px] grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:px-6">
      {/* Left: editor + stdin */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="panel-head">
            <div className="flex gap-1">
              {languages.map((l) => (
                <button key={l.id} onClick={() => setState((s) => ({ ...s, language: l.id }))}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition ${l.id === lang.id ? "bg-ink-700 text-white ring-1 ring-cage-500/30" : "text-slate-400 hover:bg-ink-800 hover:text-slate-200"}`}>
                  <span>{LANG_ICON[l.id] ?? "📄"}</span>{l.name}<span className="text-[10.5px] text-slate-500">{l.version}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden font-mono text-[11px] text-slate-500 md:inline">{lang.file}</span>
              <input ref={fileRef} type="file" accept=".py,.cpp,.cc,.cxx,.hpp,.java,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
              <button className="btn-ghost !px-2.5 !py-1.5" title="Upload a source file" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /></button>
              <button className="btn-ghost !px-2.5 !py-1.5" title="Reset to template"
                onClick={() => setState((s) => ({ ...s, code: { ...s.code, [lang.id]: lang.template }, stdin: { ...s.stdin, [lang.id]: lang.sample_stdin } }))}>
                <RotateCcw className="h-4 w-4" />
              </button>
              <button className="btn-primary !py-1.5" onClick={run} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                {running ? "Running…" : "Run in sandbox"}
              </button>
            </div>
          </div>
          <div className="border-b border-ink-700/80 px-4 py-2"><PolicyStrip limits={lang.limits} /></div>
          <div className="min-h-0 flex-1">
            <CodeEditor language={lang.monaco} value={code} onRun={run}
              onChange={(v) => setState((s) => ({ ...s, code: { ...s.code, [lang.id]: v } }))} />
          </div>
          <div className="flex items-center justify-between border-t border-ink-700/80 px-4 py-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><Keyboard className="h-3 w-3" /> ⌘/Ctrl + Enter to run</span>
            <span className="font-mono">{(new Blob([code]).size / 1024).toFixed(1)} / 64 KB</span>
          </div>
        </div>
        <div className="panel flex h-36 shrink-0 flex-col">
          <div className="panel-head !py-1.5"><span className="label">stdin</span><span className="text-[11px] text-slate-600">piped to the program inside the sandbox</span></div>
          <textarea value={stdin} spellCheck={false}
            onChange={(e) => setState((s) => ({ ...s, stdin: { ...s.stdin, [lang.id]: e.target.value } }))}
            placeholder="Optional input…" className="min-h-0 flex-1 resize-none bg-transparent px-4 py-2 font-mono text-[12.5px] text-slate-200 outline-none placeholder:text-slate-600" />
        </div>
      </section>

      {/* Right: lifecycle + verdict + output */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="panel relative overflow-hidden">
          <div className="panel-head">
            <span className="label">Sandbox lifecycle</span>
            {running && <span className="flex items-center gap-1.5 text-[11px] text-cage-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cage-400" />live</span>}
          </div>
          {running && <div className="pointer-events-none absolute inset-x-0 top-10 h-full animate-scan bg-gradient-to-b from-transparent via-cage-500/5 to-transparent" />}
          <div className="p-4">
            {started ? <Timeline stages={stages} /> : (
              <div className="cage-bars grid h-[236px] place-items-center rounded-xl border border-dashed border-ink-700 text-center">
                <div>
                  <div className="text-sm text-slate-300">Every run gets a brand-new container.</div>
                  <div className="mt-1 text-xs text-slate-500">create → start → compile → run → collect → destroy</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <AnimatePresence mode="wait">
          {error && (
            <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</motion.div>
          )}
          {record && <VerdictCard key={record.id} record={record} />}
        </AnimatePresence>
        <OutputPanel record={record} className="min-h-[180px] flex-1" />
      </section>
    </div>
  );
}
