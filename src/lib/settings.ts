import { isTauri, loadSettingsFile, saveSettingsFile } from "@/lib/api";

export type FilterTab = "all" | "orphan" | "listen" | "heavy";
export type ThemeId = "prism-light" | "console-dark";
/** 通知形式：系统通知 / 刘海屏 / 两者 */
export type NotifyChannel = "toast" | "island" | "both";

export interface Settings {
  /** 自动刷新间隔（毫秒），0 表示手动 */
  refreshIntervalMs: number;
  /** 孤儿展示优先级：运行时长阈值（分钟） */
  orphanThresholdMin: number;
  /** 进程页默认过滤视图 */
  defaultFilter: FilterTab;
  theme: ThemeId;
  showSystemProcesses: boolean;
  watchedPorts: number[];
  /** 系统通知总开关 */
  notificationsEnabled: boolean;
  /** 通知形式 */
  notifyChannel: NotifyChannel;
  /** 高 CPU 通知阈值（%） */
  highCpuThreshold: number;
  /** 长时间孤儿通知阈值（分钟） */
  longOrphanMin: number;
  /** 侧栏是否展开 */
  sidebarExpanded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  refreshIntervalMs: 2000,
  orphanThresholdMin: 30,
  defaultFilter: "all",
  theme: "prism-light",
  showSystemProcesses: true,
  watchedPorts: [],
  notificationsEnabled: true,
  notifyChannel: "both",
  highCpuThreshold: 90,
  longOrphanMin: 240,
  sidebarExpanded: false,
};

/** 从应用数据目录 settings.json 读取；文件缺失/损坏回退默认值 */
export async function loadSettings(): Promise<Settings> {
  if (!isTauri) return DEFAULT_SETTINGS;
  try {
    const raw = await loadSettingsFile();
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      watchedPorts: Array.isArray(parsed.watchedPorts)
        ? parsed.watchedPorts.filter((p) => Number.isInteger(p) && p > 0 && p <= 65535)
        : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 写入应用数据目录 settings.json（后端原子写） */
export function saveSettings(settings: Settings) {
  if (!isTauri) return;
  void saveSettingsFile(JSON.stringify(settings)).catch(() => {});
}

export const REFRESH_OPTIONS: { value: number; label: string }[] = [
  { value: 1000, label: "每 1 秒" },
  { value: 2000, label: "每 2 秒" },
  { value: 5000, label: "每 5 秒" },
  { value: 0, label: "手动刷新" },
];

export const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: "prism-light", label: "棱镜浅色" },
  { value: "console-dark", label: "控制台深色" },
];

export const NOTIFY_CHANNEL_OPTIONS: { value: NotifyChannel; label: string }[] = [
  { value: "both", label: "系统通知 + 刘海屏" },
  { value: "toast", label: "仅系统通知" },
  { value: "island", label: "仅刘海屏" },
];
