import { useState } from "react";
import { Plus, ShieldCheck, ShieldAlert, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  REFRESH_OPTIONS,
  THEME_OPTIONS,
  type FilterTab,
  type Settings,
  type ThemeId,
} from "@/lib/settings";

interface SettingsPageProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  isAdmin: boolean;
  onRestartAsAdmin: () => void;
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
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-9 cursor-pointer items-center rounded-full px-0.5 transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
}: SettingsPageProps) {
  const [portInput, setPortInput] = useState("");

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
