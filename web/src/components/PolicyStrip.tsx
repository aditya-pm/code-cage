import { Clock, Cpu, Globe2, HardDrive, Lock, MemoryStick, ShieldCheck, User, Workflow } from "lucide-react";
import type { Limits } from "../types";

export default function PolicyStrip({ limits }: { limits?: Limits }) {
  if (!limits) return null;
  const items = [
    { i: Clock, t: `${limits.time_limit_s}s wall`, h: "SR-7 wall-clock limit" },
    { i: MemoryStick, t: `${limits.memory_mb} MB`, h: "SR-4 memory limit (swap disabled)" },
    { i: Cpu, t: `${limits.cpus} CPU`, h: "SR-5 CPU quota" },
    { i: Workflow, t: `${limits.pids} PIDs`, h: "SR-6 process limit" },
    { i: Globe2, t: "no network", h: "SR-3 --network=none" },
    { i: Lock, t: "read-only /", h: `SR-8 read-only rootfs + ${limits.scratch_mb} MB scratch` },
    { i: HardDrive, t: `${limits.scratch_mb} MB scratch`, h: "SR-8 size-limited tmpfs" },
    { i: User, t: `uid ${limits.user.split(":")[0]}`, h: "SR-2 unprivileged user" },
    { i: ShieldCheck, t: "caps dropped", h: "SR-10 cap-drop=ALL + no-new-privileges" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ i: Icon, t, h }) => (
        <span key={t} className="chip" title={h}><Icon className="h-3 w-3 text-cage-400" />{t}</span>
      ))}
    </div>
  );
}
