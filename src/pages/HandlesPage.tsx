import { useRef, useState } from "react";
import { Crosshair, FileSearch, Folder, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findFileLockers, isTauri, searchFiles } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FileSearchResult, HandleLocker, ProcessInfo } from "@/lib/types";

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
  const [term, setTerm] = useState("");
  const [root, setRoot] = useState<string | undefined>();
  const [searchResult, setSearchResult] = useState<FileSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [path, setPath] = useState("");
  const [result, setResult] = useState<QueryState>({ phase: "idle" });
  const requestId = useRef(0);

  const search = async (scope = root, keyword = term.trim()) => {
    if (keyword.length < 2 && !(keyword === "" && scope)) return;
    const id = ++requestId.current;
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    setResult({ phase: "idle" });
    setPath("");
    try {
      const found = await searchFiles(keyword, scope);
      if (id === requestId.current) setSearchResult(found);
    } catch (e) {
      if (id === requestId.current) setSearchError(String(e));
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  };

  const query = async (filePath: string) => {
    const id = ++requestId.current;
    setSearching(false);
    setSearchError("");
    setPath(filePath);
    setResult({ phase: "loading" });
    try {
      const lockers = await findFileLockers(filePath);
      if (id === requestId.current) setResult({ phase: "done", lockers });
    } catch (e) {
      if (id === requestId.current) setResult({ phase: "error", message: String(e) });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具行 */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="relative w-96">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="输入文件名或目录名，如 agent.log"
            value={term}
            disabled={!isTauri}
            onChange={(e) => {
              requestId.current++;
              setSearching(false);
              setTerm(e.target.value);
              setSearchResult(null);
              setSearchError("");
              setPath("");
              setResult({ phase: "idle" });
            }}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
        </div>
        <Button size="sm" disabled={!isTauri || term.trim().length < 2 || searching} onClick={() => void search()}>
          {searching ? <Loader2 className="animate-spin" /> : <FileSearch />}
          搜索文件
        </Button>
        {root && (
          <Button variant="ghost" size="sm" onClick={() => {
            requestId.current++;
            setSearching(false);
            setRoot(undefined);
            setTerm("");
            setSearchResult(null);
            setSearchError("");
            setPath("");
            setResult({ phase: "idle" });
          }}>
            返回用户目录
          </Button>
        )}
        <span className="ml-auto truncate text-xs text-muted-foreground" title={path || root}>
          {path || root || "搜索范围：用户目录"}
        </span>
      </div>

      {searching && <div className="px-4 py-2 text-xs text-muted-foreground">正在搜索{root || "用户目录"}…</div>}
      {searchError && <div className="px-4 py-2 text-xs text-destructive">搜索失败：{searchError}</div>}
      {searchResult && (
        <div className="max-h-48 shrink-0 overflow-auto border-b border-border">
          <div className="px-4 py-1 text-xs text-muted-foreground">
            找到 {searchResult.candidates.length} 项{searchResult.truncated ? "（搜索已达上限，结果不完整；可进入目录缩小范围）" : ""}
          </div>
          {searchResult.candidates.map((candidate) => (
            <button
              key={candidate.path}
              className="flex w-full items-center gap-2 px-4 py-1 text-left text-xs hover:bg-accent"
              title={candidate.path}
              onClick={() => {
                if (candidate.isDirectory) {
                  setRoot(candidate.path);
                  setTerm("");
                  void search(candidate.path, "");
                } else {
                  void query(candidate.path);
                }
              }}
            >
              {candidate.isDirectory ? <Folder className="size-3.5 shrink-0" /> : <FileSearch className="size-3.5 shrink-0" />}
              <span className="truncate font-mono">{candidate.path}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{candidate.isDirectory ? "进入目录" : "查询占用"}</span>
            </button>
          ))}
        </div>
      )}

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
            ? "输入文件名或目录名搜索，选择具体文件后查询占用进程"
            : "浏览器预览模式：启动 Tauri 桌面应用后可搜索文件占用"}
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
          本次未发现可见的占用进程；无法排除高权限进程或其他未被 Restart Manager 识别的占用。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {result.lockers.map((locker) => {
            const candidate = byPid.get(locker.pid);
            const proc = locker.identityVerified && candidate?.startTime === locker.processStartTime
              ? candidate
              : undefined;
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
                  {proc && locker.agent && (
                    <Badge variant="outline" title={locker.agent.evidence}>
                      {locker.agent.name}{locker.agent.relation === "parent" ? " 关联" : " 占用"}
                    </Badge>
                  )}
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
                <span className="truncate text-muted-foreground" title={locker.identityVerified ? undefined : "无法核实进程身份，操作已禁用"}>
                  {locker.identityVerified ? locker.status || "-" : "身份未核实"}
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
                    onClick={() => proc && onViewProcess(proc.pid)}
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
