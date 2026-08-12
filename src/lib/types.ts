export interface OrphanInfo {
  status: "none" | "confirmed";
  pidReused: boolean;
  heuristicScore: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number | null;
  name: string;
  exePath: string | null;
  cmdline: string[];
  startTime: number;
  cpuPercent: number;
  memoryBytes: number;
  user: string | null;
  status: string;
  orphan: OrphanInfo;
}

export interface PortBinding {
  protocol: "Tcp" | "Udp";
  localAddr: string;
  localPort: number;
  state: string | null;
  pid: number;
}

export interface ProcessSnapshot {
  processes: ProcessInfo[];
  ports: PortBinding[];
  capturedAt: number;
}

export type AssessLevel = "safe" | "caution" | "danger" | "forbidden";

export interface KillAssessment {
  pid: number;
  level: AssessLevel;
  reasons: string[];
  notes: string[];
  children: ProcessInfo[];
  ownedPorts: PortBinding[];
  orphan: OrphanInfo;
}

export interface KillTreeResult {
  root: number;
  succeeded: number[];
  failed: { pid: number; error: string }[];
}

export type KillErrorKind = "NotFound" | "Failed";

export interface KillError {
  kind: KillErrorKind;
  message?: string;
}

export type PageId = "processes" | "ports" | "settings";

export type SortKey = "startTime" | "cpu" | "memory";

export type KillMode = "single" | "tree";

/** 刘海屏告警负载（main → island，事件 island:alert） */
export interface IslandAlert {
  kind: "highCpu" | "longOrphan";
  pid: number;
  name: string;
  /** highCpu: 当前 CPU%；longOrphan: 已运行分钟数 */
  value: number;
}

/** 刘海屏操作（island → main，事件 island:action） */
export interface IslandAction {
  action: "view" | "kill";
  pid: number;
}

export const LEVEL_META: Record<
  AssessLevel,
  { label: string; badge: "success" | "info" | "warning" | "destructive" }
> = {
  safe: { label: "可安全结束", badge: "success" },
  caution: { label: "需谨慎", badge: "info" },
  danger: { label: "高风险", badge: "warning" },
  forbidden: { label: "禁止结束", badge: "destructive" },
};
