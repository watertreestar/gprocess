import { useState } from "react";
import { Crosshair, FileSearch, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findFileLockers, isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HandleLocker, ProcessInfo } from "@/lib/types";

const GRID_COLS =
  "grid grid-cols-[minmax(140px,1fr)_72px_100px_88px_minmax(200px,1.6fr)_150px] items-center gap-x-2 px-3";

type QueryState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; lockers: HandleLocker[] }
  | { phase: "error"; message: string };

interface HandlesPageProps {
  byPid: Map<number, ProcessInfo>;
  onViewProcess: (pid: number) => void;
  onKill: (process: ProcessInfo) => void;
}

export function HandlesPage({ byPid, onViewProcess, onKill }: HandlesPageProps) {
  const [path, setPath] = useState("");
  const [result, setResult] = useState<QueryState>({ phase: "idle" });

  const query = async () => {
    const p = path.trim();
    if (!p || result.phase === "loading") return;
    setResult({ phase: "loading" });
    try {
      const lockers = await findFileLockers(p);
      setResult({ phase: "done", lockers });
    } catch (e) {
      setResult({ phase: "error", message: String(e) });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具行 */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="relative w-96">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 font-mono"
            placeholder="输入文件路径，如 C:\work\app.log"
            value={path}
            disabled={!isTauri}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void query()}
          />
        </div>
        <Button
          size="sm"
          disabled={!isTauri || !path.trim() || result.phase === "loading"}
          onClick={() => void query()}
        >
          {result.phase === "loading" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FileSearch />
          )}
          查询占用
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {result.phase === "done" ? `${result.lockers.length} 个进程占用` : ""}
        </span>
      </div>

      {/* 表头 */}
      <div
        className={cn(
          GRID_COLS,
          "section-kicker h-8 shrink-0 border-b border-border normal-case",
        )}
      >
        <span>进程名</span>
        <span>PID</span>
        <span>用户</span>
        <span>状态</span>
        <span>路径</span>
        <span className="text-right">操作</span>
      </div>

      {/* 结果区（占用进程通常很少，无需虚拟滚动） */}
      {result.phase === "idle" ? (
        <div className="tool-empty-state text-xs text-muted-foreground">
          {isTauri
            ? "文件删不掉？输入路径查询哪个进程占用了它"
            : "浏览器预览模式：启动 Tauri 桌面应用后可查询文件占用"}
        </div>
      ) : result.phase === "loading" ? (
        <div className="tool-empty-state text-xs text-muted-foreground">
          正在查询…
        </div>
      ) : result.phase === "error" ? (
        <div className="tool-empty-state text-xs text-destructive">
          查询失败：{result.message}
        </div>
      ) : result.lockers.length === 0 ? (
        <div className="tool-empty-state text-xs text-muted-foreground">
          没有进程占用该文件（或占用进程权限过高无法查询）
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {result.lockers.map((locker) => {
            const proc = byPid.get(locker.pid);
            return (
              <div
                key={locker.pid}
                className={cn(
                  GRID_COLS,
                  "h-9 border-b border-border text-xs transition-colors duration-150 hover:bg-accent/60",
                )}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="truncate">
                    {locker.appName || proc?.name || "（未知）"}
                  </span>
                  {locker.isService && <Badge variant="outline">服务</Badge>}
                  {locker.restartable && (
                    <Badge variant="outline">可重启</Badge>
                  )}
                </span>
                <span className="font-mono text-muted-foreground">
                  {locker.pid}
                </span>
                <span className="truncate text-muted-foreground">
                  {locker.user ?? "-"}
                </span>
                <span className="truncate text-muted-foreground">
                  {locker.status || "-"}
                </span>
                <span
                  className="truncate font-mono text-muted-foreground"
                  title={locker.exePath ?? undefined}
                >
                  {locker.exePath ?? "-"}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onViewProcess(locker.pid)}
                    disabled={!proc}
                  >
                    <Crosshair />
                    查看
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => proc && onKill(proc)}
                    disabled={!proc}
                  >
                    结束…
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
