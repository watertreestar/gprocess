export type FilterTab = "all" | "orphan" | "listen" | "heavy";
export type ThemeId = "prism-light" | "console-dark";

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
}

const KEY = "gprocess.settings";

export const DEFAULT_SETTINGS: Settings = {
  refreshIntervalMs: 2000,
  orphanThresholdMin: 30,
  defaultFilter: "all",
  theme: "prism-light",
  showSystemProcesses: true,
  watchedPorts: [],
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
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

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
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
