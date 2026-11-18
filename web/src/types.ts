export interface Limits {
  time_limit_s: number; compile_timeout_s: number; memory_mb: number; pids: number; cpus: number;
  output_cap_kb: number; output_kill_kb: number; scratch_mb: number; tmp_mb: number;
  max_file_mb: number; open_files: number; network: string; user: string; rootfs: string;
  capabilities: string; no_new_privileges: boolean;
}

export interface Language {
  id: string; name: string; version: string; image: string; file: string; monaco: string;
  compiled: boolean; template: string; sample_stdin: string; limits: Limits; image_size: number | null;
}

export interface RunRecord {
  id: string; language: string; verdict: string; reason: string; explanation: string;
  requirement: string | null; stdout: string; stderr: string; stdout_truncated: boolean;
  stderr_truncated: boolean; output_bytes: number; compile_output: string; compiled: boolean;
  exit_code: number | null; signal: string | null; run_ms: number | null; compile_ms: number | null;
  wall_ms: number | null; container_id: string | null; oom_killed: boolean; pids_max_hits: number;
  sandbox_uid: number | null; timings: Record<string, number>; limits: Limits;
}

export interface LifecycleEvent {
  type: string; t_ms: number; position?: number; container_id?: string; name?: string;
  image?: string; total_ms?: number; record?: RunRecord;
}

export interface Attack {
  id: string; file: string; language: string; title: string; summary: string;
  expect: string[]; requirement: string; code: string;
}

export interface HistoryItem {
  id: string; created_at: string; finished_at: string | null; language: string; status: string;
  verdict: string | null; reason: string | null; requirement: string | null; exit_code: number | null;
  run_ms: number | null; compile_ms: number | null; wall_ms: number | null; container_id: string | null;
  source: string; attack_id: string | null; code_preview: string;
}

export interface Health {
  ok: boolean;
  podman: {
    version?: string; rootless?: boolean; seccomp?: boolean; selinux?: boolean; cgroup_version?: string;
    cgroup_controllers?: string[]; kernel?: string; os?: string; os_version?: string; arch?: string; error?: string;
  };
  queue: QueueState;
}

export interface QueueState { running: number; queued: number; max_concurrent: number; max_queue: number; completed_since_start: number }
