import { useEffect, useState } from "react";
import {
  Download,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  NOTIFY_CHANNEL_OPTIONS,
  REFRESH_OPTIONS,
  THEME_OPTIONS,
  type FilterTab,
  type NotifyChannel,
  type Settings,
  type ThemeId,
} from "@/lib/settings";

interface SettingsPageProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  isAdmin: boolean;
  onRestartAsAdmin: () => void;
  onToast: (kind: "success" | "error", message: string) => void;
}

const FILTER_OPTIONS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "orphan", label: "疑似孤儿" },
  { value: "listen", label: "监听端口" },
  { value: "heavy", label: "高占用" },
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-9 cursor-pointer items-center rounded-full px-0.5 transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full bg-white shadow-sm transition-transform duration-150",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function SettingsPage({
  settings,
  onChange,
  isAdmin,
  onRestartAsAdmin,
  onToast,
}: SettingsPageProps) {
  const [portInput, setPortInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  const addExclude = () => {
    const name = excludeInput.trim().toLowerCase();
    if (name && !settings.orphanExcludes.includes(name)) {
      onChange({ orphanExcludes: [...settings.orphanExcludes, name].sort() });
    }
    setExcludeInput("");
  };

  // 开机自启：插件注册表状态为准，不存进 settings 模型
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri) return;
    isAutostartEnabled()
      .then(setAutostartOn)
      .catch(() => setAutostartOn(null));
  }, []);

  const toggleAutostart = async (v: boolean) => {
    setAutostartOn(v);
    try {
      if (v) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    } catch {
      setAutostartOn(!v);
      onToast("error", "开机自启设置失败");
    }
  };

  // 自动更新（GitHub Releases）
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const update = await check();
      if (update) {
        setNewVersion(update.version);
        onToast("success", `发现新版本 v${update.version}`);
      } else {
        setNewVersion(null);
        onToast("success", "已是最新版本");
      }
    } catch (e) {
      onToast("error", `检查更新失败：${String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    setInstalling(true);
    try {
      const update = await check();
      if (!update) {
        setNewVersion(null);
        onToast("success", "已是最新版本");
        return;
      }
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      onToast("error", `更新失败：${String(e)}`);
    } finally {
      setInstalling(false);
    }
  };

  const addPort = () => {
    const port = Number(portInput.trim());
    if (
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535 &&
      !settings.watchedPorts.includes(port)
    ) {
      onChange({ watchedPorts: [...settings.watchedPorts, port].sort((a, b) => a - b) });
    }
    setPortInput("");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[640px]">
        {/* 常规 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">常规</div>
          <Row label="自动刷新" hint="页面不可见时自动暂停，恢复可见时立即刷新">
            <Select
              value={String(settings.refreshIntervalMs)}
              onValueChange={(v) => onChange({ refreshIntervalMs: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="进程页默认视图">
            <Select
              value={settings.defaultFilter}
              onValueChange={(v) => onChange({ defaultFilter: v as FilterTab })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="显示系统进程" hint="隐藏以 SYSTEM 等高权限账户运行的进程">
            <Toggle
              checked={settings.showSystemProcesses}
              onChange={(v) => onChange({ showSystemProcesses: v })}
            />
          </Row>
          <Row label="开机自启" hint="登录 Windows 后自动启动，最小化到系统托盘">
            <Toggle
              checked={autostartOn ?? false}
              onChange={toggleAutostart}
              disabled={!isTauri || autostartOn === null}
            />
          </Row>
        </section>

        {/* 外观 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">外观</div>
          <Row label="主题">
            <Select
              value={settings.theme}
              onValueChange={(v) => onChange({ theme: v as ThemeId })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </section>

        {/* 通知 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">通知</div>
          <Row
            label="系统通知"
            hint="超高资源占用与长时间孤儿进程触发告警"
          >
            <Toggle
              checked={settings.notificationsEnabled}
              onChange={(v) => onChange({ notificationsEnabled: v })}
            />
          </Row>
          <Row label="通知形式" hint="刘海屏在屏幕顶部中央弹出，可直接查看/结束">
            <Select
              value={settings.notifyChannel}
              onValueChange={(v) => onChange({ notifyChannel: v as NotifyChannel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFY_CHANNEL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row
            label="高 CPU 阈值（%）"
            hint="连续两个采样周期超过该值才通知，过滤瞬时尖峰"
          >
            <Input
              type="number"
              min={50}
              max={100}
              className="w-24 font-mono"
              value={settings.highCpuThreshold}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 50 && v <= 100) {
                  onChange({ highCpuThreshold: v });
                }
              }}
            />
          </Row>
          <Row
            label="长时间孤儿（分钟）"
            hint="孤儿进程持续运行超过该时长触发通知"
          >
            <Input
              type="number"
              min={10}
              max={10080}
              className="w-24 font-mono"
              value={settings.longOrphanMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 10 && v <= 10080) {
                  onChange({ longOrphanMin: v });
                }
              }}
            />
          </Row>
        </section>

        {/* 孤儿判定 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">孤儿判定</div>
          <Row
            label="运行时长阈值（分钟）"
            hint="超过阈值的孤儿进程在列表中优先展示"
          >
            <Input
              type="number"
              min={1}
              max={1440}
              className="w-24 font-mono"
              value={settings.orphanThresholdMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1 && v <= 1440) {
                  onChange({ orphanThresholdMin: v });
                }
              }}
            />
          </Row>
          <div className="py-2">
            <div className="text-xs font-medium">豁免名单</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              有意开启的后台进程，按 exe 名匹配（如 node.exe），命中不再判定为孤儿
            </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Input
              className="w-40 font-mono"
              placeholder="如 node.exe"
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addExclude()}
            />
            <Button variant="secondary" size="sm" onClick={addExclude}>
              <Plus />
              添加
            </Button>
          </div>
          {settings.orphanExcludes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {settings.orphanExcludes.map((name) => (
                <Badge key={name} variant="info" className="gap-1 font-mono">
                  {name}
                  <button
                    className="cursor-pointer opacity-70 hover:opacity-100"
                    onClick={() =>
                      onChange({
                        orphanExcludes: settings.orphanExcludes.filter(
                          (n) => n !== name,
                        ),
                      })
                    }
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

        {/* 关注端口 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">关注端口</div>
          <div className="flex items-center gap-2 py-2">
            <Input
              className="w-32 font-mono"
              placeholder="如 3000"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPort()}
            />
            <Button variant="secondary" size="sm" onClick={addPort}>
              <Plus />
              添加
            </Button>
          </div>
          {settings.watchedPorts.length === 0 ? (
            <p className="pb-2 text-xs text-muted-foreground">
              添加后在端口页置顶高亮，如 3000 / 5173 / 8080
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {settings.watchedPorts.map((port) => (
                <Badge key={port} variant="default" className="gap-1 font-mono">
                  {port}
                  <button
                    className="cursor-pointer opacity-70 hover:opacity-100"
                    onClick={() =>
                      onChange({
                        watchedPorts: settings.watchedPorts.filter((p) => p !== port),
                      })
                    }
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

        {/* 更新 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">更新</div>
          <Row label="当前版本" hint="通过 GitHub Releases 自动更新">
            <span className="font-mono text-xs text-muted-foreground">
              {version ? `v${version}` : "-"}
            </span>
          </Row>
          <Row
            label={newVersion ? `新版本 v${newVersion} 可用` : "自动更新"}
            hint={newVersion ? "下载安装后自动重启应用" : undefined}
          >
            {newVersion ? (
              <Button size="sm" onClick={installUpdate} disabled={installing}>
                <Download />
                {installing ? "安装中…" : "下载并安装"}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={checkUpdate}
                disabled={!isTauri || checking}
              >
                <RefreshCw className={checking ? "animate-spin" : undefined} />
                {checking ? "检查中…" : "检查更新"}
              </Button>
            )}
          </Row>
        </section>

        {/* 权限 */}
        <section className="tool-section">
          <div className="section-kicker mb-1">权限</div>
          <Row
            label="管理员权限"
            hint="普通权限下无法查看或结束部分高权限进程与端口"
          >
            <div className="flex items-center gap-2">
              {isAdmin ? (
                <Badge variant="success">
                  <ShieldCheck />
                  管理员运行中
                </Badge>
              ) : (
                <>
                  <Badge variant="warning">
                    <ShieldAlert />
                    受限模式
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={onRestartAsAdmin}>
                    以管理员重启
                  </Button>
                </>
              )}
            </div>
          </Row>
        </section>
      </div>
    </div>
  );
}
