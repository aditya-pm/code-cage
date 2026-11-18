import { AlertOctagon, Bug, CheckCircle2, Cpu, FileWarning, Hourglass, MemoryStick, ShieldAlert, Wrench } from "lucide-react";
import type { ComponentType } from "react";

export interface VerdictStyle { color: string; bg: string; ring: string; text: string; icon: ComponentType<{ className?: string }>; short: string }

export const VERDICTS: Record<string, VerdictStyle> = {
  "Success": { color: "#34d399", bg: "bg-emerald-500/10", ring: "ring-emerald-400/40", text: "text-emerald-300", icon: CheckCircle2, short: "OK" },
  "Compilation Error": { color: "#fbbf24", bg: "bg-amber-500/10", ring: "ring-amber-400/40", text: "text-amber-300", icon: Wrench, short: "CE" },
  "Runtime Error": { color: "#fb923c", bg: "bg-orange-500/10", ring: "ring-orange-400/40", text: "text-orange-300", icon: Bug, short: "RE" },
  "Time Limit Exceeded": { color: "#a78bfa", bg: "bg-violet-500/10", ring: "ring-violet-400/40", text: "text-violet-300", icon: Hourglass, short: "TLE" },
  "Memory Limit Exceeded": { color: "#f472b6", bg: "bg-pink-500/10", ring: "ring-pink-400/40", text: "text-pink-300", icon: MemoryStick, short: "MLE" },
  "Output Limit Exceeded": { color: "#facc15", bg: "bg-yellow-500/10", ring: "ring-yellow-400/40", text: "text-yellow-300", icon: FileWarning, short: "OLE" },
  "Security Violation": { color: "#f87171", bg: "bg-red-500/10", ring: "ring-red-400/50", text: "text-red-300", icon: ShieldAlert, short: "SEC" },
  "Internal Error": { color: "#94a3b8", bg: "bg-slate-500/10", ring: "ring-slate-400/40", text: "text-slate-300", icon: AlertOctagon, short: "ERR" },
};

export const verdictStyle = (v: string | null | undefined): VerdictStyle =>
  (v && VERDICTS[v]) || { color: "#64748b", bg: "bg-slate-500/10", ring: "ring-slate-500/30", text: "text-slate-400", icon: Cpu, short: "…" };

export function VerdictBadge({ verdict, size = "sm" }: { verdict: string | null; size?: "sm" | "md" }) {
  const s = verdictStyle(verdict);
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${s.bg} ${s.text} ring-1 ${s.ring} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"} font-medium whitespace-nowrap`}>
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {verdict ?? "Pending"}
    </span>
  );
}
