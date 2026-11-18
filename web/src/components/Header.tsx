import { Boxes, History, Layers, ShieldCheck, Skull, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Health, QueueState } from "../types";

export type Page = "playground" | "attacks" | "history" | "security";

const NAV: { k: Page; label: string; icon: typeof Boxes }[] = [
  { k: "playground", label: "Playground", icon: TerminalSquare },
  { k: "attacks", label: "Attack Lab", icon: Skull },
  { k: "history", label: "History", icon: History },
  { k: "security", label: "Sandbox Policy", icon: ShieldCheck },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-cage-500/40 bg-ink-850 shadow-glow">
        <div className="absolute inset-0 cage-bars opacity-80" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(63,224,192,.55) 0 2px, transparent 2px 8px)" }} />
        <span className="relative font-mono text-[13px] font-bold text-white drop-shadow">{"{}"}</span>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-white">Code<span className="text-cage-400">Cage</span></div>
        <div className="text-[10.5px] text-slate-500">rootless podman sandbox</div>
      </div>
    </div>
  );
}

export default function Header({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [alive, setAlive] = useState<number | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let stop = false;
    const loadHealth = () => api<Health>("/api/health").then((h) => { if (!stop) { setHealth(h); setDown(false); } }).catch(() => setDown(true));
    const poll = async () => {
      try {
        const [q, s] = await Promise.all([api<QueueState>("/api/queue"), api<{ count: number }>("/api/system/sandboxes")]);
        if (!stop) { setQueue(q); setAlive(s.count); setDown(false); }
      } catch { if (!stop) setDown(true); }
    };
    loadHealth(); poll();
    const a = setInterval(poll, 1500), b = setInterval(loadHealth, 15000);
    return () => { stop = true; clearInterval(a); clearInterval(b); };
  }, []);

  const p = health?.podman;
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-2.5 lg:px-6">
        <Logo />
        <nav className="ml-2 flex gap-1 rounded-xl border border-ink-700/80 bg-ink-900/70 p-1">
          {NAV.map(({ k, label, icon: Icon }) => (
            <button key={k} onClick={() => setPage(k)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${page === k ? "bg-ink-700 text-white shadow-inner" : "text-slate-400 hover:text-slate-200"}`}>
              <Icon className={`h-4 w-4 ${page === k ? (k === "attacks" ? "text-red-400" : "text-cage-400") : ""}`} />{label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {down ? (
            <span className="chip !border-red-500/40 !text-red-300"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />platform unreachable</span>
          ) : (
            <>
              <span className={`chip ${p?.rootless ? "!border-emerald-500/40 !text-emerald-300" : "!border-red-500/40 !text-red-300"}`} title="SR-1: podman runs without root on the host">
                <span className={`h-1.5 w-1.5 rounded-full ${p?.rootless ? "bg-emerald-400" : "bg-red-400"}`} />
                {p?.rootless ? "rootless" : p?.rootless === false ? "ROOTFUL!" : "…"}
              </span>
              <span className="chip" title={`${p?.os ?? ""} ${p?.os_version ?? ""} · kernel ${p?.kernel ?? ""}`}><Layers className="h-3 w-3 text-cage-400" />podman {p?.version ?? "…"}</span>
              <span className="chip" title="Concurrent sandbox slots (FR-7)">
                <Boxes className="h-3 w-3 text-cage-400" />
                slots <b className="font-mono text-white">{queue?.running ?? 0}/{queue?.max_concurrent ?? "–"}</b>
                {queue && queue.queued > 0 && <> · queued <b className="font-mono text-amber-300">{queue.queued}</b></>}
              </span>
              <span className={`chip ${alive === 0 ? "" : "!border-cage-500/40"}`} title="Live sandbox containers (podman ps --filter label=codecage.sandbox=1)">
                <span className={`h-1.5 w-1.5 rounded-full ${alive ? "bg-cage-400 animate-pulse" : "bg-slate-500"}`} />
                live sandboxes <b className="font-mono text-white">{alive ?? "–"}</b>
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
