import { CheckCircle2, CircleDashed, Package, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmtBytes } from "../api";
import type { Health, Language } from "../types";

interface Req { id: string; title: string; mechanism: string; threat: string; check?: (h: Health | null) => boolean | undefined }

const REQS: Req[] = [
  { id: "SR-1", title: "Rootless execution", mechanism: "Podman runs as an ordinary user; container root maps to an unprivileged subuid on the host.", threat: "Container escape → host root", check: (h) => h?.podman.rootless },
  { id: "SR-2", title: "Non-root user inside", mechanism: "--user 10001:10001; images have no sudo/su and no setuid binaries.", threat: "Privileged actions inside the box" },
  { id: "SR-3", title: "No network", mechanism: "--network=none: only a loopback interface exists. Sandboxes never join codecage-net.", threat: "Exfiltration, downloads, lateral movement" },
  { id: "SR-4", title: "Memory limit", mechanism: "cgroup v2 memory.max = memory.swap.max limit; OOM kills are read from memory.events.", threat: "Memory exhaustion of the host", check: (h) => h?.podman.cgroup_controllers?.includes("memory") },
  { id: "SR-5", title: "CPU limit", mechanism: "--cpus 1.0 (cgroup cpu.max quota).", threat: "CPU starvation of other users", check: (h) => h?.podman.cgroup_controllers?.includes("cpu") },
  { id: "SR-6", title: "Process limit", mechanism: "--pids-limit (cgroup pids.max); refused forks are counted from pids.events.", threat: "Fork bombs", check: (h) => h?.podman.cgroup_controllers?.includes("pids") },
  { id: "SR-7", title: "Wall-clock limit", mechanism: "cage-runner kills the process group at the limit, plus an outer API watchdog that kills the container.", threat: "Infinite loops, sleeping forever" },
  { id: "SR-8", title: "Read-only filesystem", mechanism: "--read-only rootfs; /sandbox (32 MB, exec) and /tmp (16 MB, noexec) are size-capped tmpfs; RLIMIT_FSIZE.", threat: "Tampering, disk filling" },
  { id: "SR-9", title: "No host access", mechanism: "No bind mounts or volumes; code arrives via env vars. Private PID, IPC, mount and UTS namespaces.", threat: "Reading host files, secrets, other submissions" },
  { id: "SR-10", title: "Capabilities removed", mechanism: "--cap-drop=ALL, no-new-privileges, default seccomp profile; the runner is PID 1 and non-dumpable.", threat: "Privilege escalation, kernel attack surface", check: (h) => h?.podman.seccomp },
  { id: "SR-11", title: "Output limits", mechanism: "64 KB kept per stream; the process group is killed after 1 MB of total output.", threat: "Log/disk/memory exhaustion via output" },
];

export default function Security({ languages }: { languages: Language[] }) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api<Health>("/api/health").then(setHealth).catch(() => {}); }, []);
  const p = health?.podman;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white"><ShieldCheck className="h-5 w-5 text-cage-400" />Sandbox policy & architecture</h1>
          <p className="mt-1 text-[13px] text-slate-400">Every execution container is created with these guarantees. Checks marked live are read from the running Podman host.</p>
        </div>
        {p && (
          <div className="flex flex-wrap gap-1.5 text-[11.5px]">
            <span className="chip">host <b className="text-white">{p.os} {p.os_version}</b></span>
            <span className="chip">kernel <b className="font-mono text-white">{p.kernel}</b></span>
            <span className="chip">cgroups <b className="text-white">{p.cgroup_version}</b> [{p.cgroup_controllers?.join(", ")}]</span>
            <span className="chip">seccomp <b className="text-white">{String(p.seccomp)}</b></span>
          </div>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-head"><span className="label">Architecture</span><span className="text-[11px] text-slate-500">one compose file · one platform network · sandboxes outside it</span></div>
        <div className="overflow-x-auto p-4"><Diagram /></div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="panel overflow-hidden">
          <div className="panel-head"><span className="label">Security requirements</span></div>
          <table className="w-full text-left text-[13px]">
            <tbody>
              {REQS.map((r) => {
                const live = r.check?.(health);
                return (
                  <tr key={r.id} className="border-b border-ink-800 align-top last:border-0">
                    <td className="w-16 px-4 py-3 font-mono text-[12px] text-cage-300">{r.id}</td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-white">{r.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-slate-400">{r.mechanism}</div>
                    </td>
                    <td className="hidden w-52 px-2 py-3 text-[12px] text-slate-500 md:table-cell">blocks: {r.threat}</td>
                    <td className="w-24 px-4 py-3 text-right">
                      {r.check ? (live ? <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />live</span>
                        : <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500"><CircleDashed className="h-3.5 w-3.5" />n/a</span>)
                        : <span className="text-[11.5px] text-slate-500">enforced</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-head"><span className="label">Runtime images</span><span className="text-[11px] text-slate-500">pushed to the local registry</span></div>
          <div className="space-y-3 p-4">
            {languages.map((l) => (
              <div key={l.id} className="rounded-xl border border-ink-700/80 bg-ink-850/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Package className="h-4 w-4 text-cage-400" /><span className="font-medium text-white">{l.name} {l.version}</span></div>
                  <span className="font-mono text-[13px] text-cage-300">{fmtBytes(l.image_size)}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{l.image}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["no shell", "no package manager", "no setuid", "uid 10001", l.compiled ? "compile step" : ""].filter(Boolean).map((t) =>
                    <span key={t} className="chip !py-0.5 !text-[10px]">{t}</span>)}
                </div>
              </div>
            ))}
            <p className="text-[11.5px] leading-relaxed text-slate-500">
              Each image is a multi-stage build: a static Go supervisor (<span className="font-mono">cage-runner</span>) is compiled in a builder
              stage and copied in. The final step deletes busybox, which removes the shell and every coreutil, along with apk and all setuid bits.
              Java uses a <span className="font-mono">jlink</span>-trimmed JDK (java.base + jdk.compiler).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Box({ x, y, w, h, title, sub, accent = "#3fe0c0", mono }: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: string; mono?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#0e131b" stroke={accent} strokeOpacity={0.55} />
      <text x={x + 12} y={y + 22} fill="#f1f5f9" fontSize={13} fontWeight={600} fontFamily={mono ? "JetBrains Mono Variable, monospace" : "Inter Variable, sans-serif"}>{title}</text>
      {sub && <text x={x + 12} y={y + 40} fill="#64748b" fontSize={11} fontFamily="JetBrains Mono Variable, monospace">{sub}</text>}
    </g>
  );
}

function Diagram() {
  const sbx = [0, 1, 2];
  return (
    <svg viewBox="0 0 1180 360" className="mx-auto min-w-[980px]" role="img" aria-label="CodeCage architecture">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3fe0c0" /></marker>
        <pattern id="bars" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="2" height="10" fill="#f87171" fillOpacity="0.18" /></pattern>
      </defs>

      {/* Browser */}
      <Box x={10} y={150} w={120} h={56} title="Browser" sub="localhost:8080" accent="#64748b" />

      {/* Host / VM */}
      <rect x={160} y={10} width={1010} height={340} rx={16} fill="none" stroke="#33425a" strokeDasharray="6 6" />
      <text x={178} y={34} fill="#94a3b8" fontSize={12} fontFamily="JetBrains Mono Variable, monospace">rootless podman · Linux host (podman machine / Fedora) · no root anywhere</text>

      {/* Platform network */}
      <rect x={180} y={50} width={560} height={285} rx={14} fill="#3fe0c0" fillOpacity={0.03} stroke="#3fe0c0" strokeOpacity={0.35} />
      <text x={196} y={72} fill="#3fe0c0" fontSize={12} fontFamily="JetBrains Mono Variable, monospace">codecage-net (bridge) · compose.yaml</text>

      <Box x={200} y={130} w={150} h={56} title="web" sub="nginx · React UI" />
      <Box x={400} y={130} w={160} h={56} title="api" sub="FastAPI · scheduler" />
      <Box x={600} y={90} w={120} h={56} title="db" sub="Postgres 16" />
      <Box x={600} y={220} w={120} h={56} title="registry" sub=":5050 images" />
      {/* volumes */}
      <g fontFamily="JetBrains Mono Variable, monospace" fontSize={10.5} fill="#94a3b8">
        <ellipse cx={660} cy={168} rx={44} ry={6} fill="#121822" stroke="#475569" />
        <text x={660} y={190} textAnchor="middle">vol: pgdata</text>
        <ellipse cx={660} cy={298} rx={44} ry={6} fill="#121822" stroke="#475569" />
        <text x={660} y={320} textAnchor="middle">vol: registry</text>
      </g>
      <Box x={400} y={250} w={160} h={56} title="podman.sock" sub="rootless user API" accent="#fbbf24" mono />

      <line x1={130} y1={178} x2={198} y2={158} stroke="#3fe0c0" strokeWidth={1.5} markerEnd="url(#arr)" />
      <line x1={350} y1={158} x2={398} y2={158} stroke="#3fe0c0" strokeWidth={1.5} markerEnd="url(#arr)" />
      <line x1={560} y1={150} x2={598} y2={125} stroke="#3fe0c0" strokeWidth={1.5} markerEnd="url(#arr)" />
      <line x1={480} y1={186} x2={480} y2={248} stroke="#fbbf24" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={488} y={222} fill="#fbbf24" fontSize={10.5} fontFamily="JetBrains Mono Variable, monospace">create/start/rm</text>

      {/* Sandboxes */}
      <rect x={780} y={50} width={370} height={285} rx={14} fill="#f87171" fillOpacity={0.03} stroke="#f87171" strokeOpacity={0.4} />
      <text x={796} y={72} fill="#f87171" fontSize={12} fontFamily="JetBrains Mono Variable, monospace">execution sandboxes · --network=none</text>
      {sbx.map((i) => (
        <g key={i}>
          <rect x={800 + i * 8} y={92 + i * 74} width={330 - i * 8} height={62} rx={10} fill="#0e131b" stroke="#f87171" strokeOpacity={0.5} />
          <rect x={800 + i * 8} y={92 + i * 74} width={330 - i * 8} height={62} rx={10} fill="url(#bars)" />
          <text x={814 + i * 8} y={115 + i * 74} fill="#f1f5f9" fontSize={12.5} fontWeight={600} fontFamily="JetBrains Mono Variable, monospace">{["runtime-python", "runtime-cpp", "runtime-java"][i]}</text>
          <text x={814 + i * 8} y={134 + i * 74} fill="#94a3b8" fontSize={10.5} fontFamily="JetBrains Mono Variable, monospace">uid 10001 · read-only · caps=0 · no net</text>
          <text x={814 + i * 8} y={148 + i * 74} fill="#64748b" fontSize={10} fontFamily="JetBrains Mono Variable, monospace">cpu/mem/pids capped · rm -f after run</text>
        </g>
      ))}
      <path d="M560 266 C 585 266, 580 207, 612 207 L 745 207 C 772 207, 778 196, 798 190" fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#arr)" />
    </svg>
  );
}
