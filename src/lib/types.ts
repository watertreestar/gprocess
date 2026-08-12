export interface OrphanInfo {
  /** none: 父存活或已豁免；expected: 正常守护；confirmed: 疑似孤儿 */
  status: "none" | "expected" | "confirmed";
  pidReused: boolean;
  heuristicScore: number;
  /** 最后观测到的父进程名（面板启动前已孤儿则为 null） */
  parentName: string | null;
  /** expected 的来源分类 */
  origin: "system" | "service" | "autostart" | "launcher" | null;
  /** 非本机 ESTABLISHED 连接数（活跃度信号，降权不降级） */
  externalConnections: number;
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
  /** 远端地址（仅 TCP；UDP 为 null） */
  remoteAddr: string | null;
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

export type PageId = "processes" | "ports" | "handles" | "settings";

export type SortKey = "startTime" | "cpu" | "memory";

export type KillMode = "single" | "tree";

/** 文件句柄占用者（Restart Manager 查询结果） */
export interface HandleLocker {
  pid: number;
  appName: string;
  exePath: string | null;
  user: string | null;
  /** sysinfo 进程状态；进程已退出则为「已退出」 */
  status: string;
  isService: boolean;
  restartable: boolean;
}

/** 灵动岛告警负载（主窗口内通知队列） */
export interface IslandAlert {
  kind: "highCpu" | "longOrphan";
  pid: number;
  name: string;
  /** highCpu: 当前 CPU%；longOrphan: 已运行分钟数 */
  value: number;
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
