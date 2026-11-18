import type { LifecycleEvent, RunRecord } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* ignore */ }
    throw new ApiError(r.status, msg);
  }
  return r.json() as Promise<T>;
}

const EVENT_TYPES = ["queued", "dequeued", "creating", "created", "started", "compiling", "running",
  "collecting", "destroying", "destroyed", "verdict"];

export interface SubmitBody { language: string; code: string; stdin: string; source?: string; attack_id?: string }

/** Submit code and stream its container lifecycle until the verdict arrives. */
export async function runSubmission(body: SubmitBody, onEvent: (e: LifecycleEvent) => void,
                                    onId?: (id: string) => void): Promise<RunRecord> {
  const { id } = await api<{ id: string }>("/api/submissions", { method: "POST", body: JSON.stringify(body) });
  onId?.(id);
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/submissions/${id}/events`);
    let finished = false;
    const handler = (msg: MessageEvent) => {
      const ev = JSON.parse(msg.data) as LifecycleEvent;
      onEvent(ev);
      if (ev.type === "verdict" && ev.record) { finished = true; es.close(); resolve(ev.record); }
    };
    EVENT_TYPES.forEach((t) => es.addEventListener(t, handler as EventListener));
    es.onerror = async () => {
      if (finished) return;
      es.close();
      // Stream dropped: fall back to polling the stored result.
      for (let i = 0; i < 60; i++) {
        try {
          const row = await api<{ status: string; result: RunRecord | null }>(`/api/submissions/${id}`);
          if (row.result) { resolve(row.result); return; }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      reject(new Error("Lost connection to the platform."));
    };
  });
}

export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;

export const fmtBytes = (b: number | null | undefined) => {
  if (b == null) return "—";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
