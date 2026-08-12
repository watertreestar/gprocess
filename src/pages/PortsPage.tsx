import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Crosshair, Search, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProcessInfo, ProcessSnapshot } from "@/lib/types";

const GRID_COLS =
  "grid grid-cols-[80px_56px_120px_72px_minmax(150px,1.2fr)_100px_72px_minmax(160px,1fr)] items-center gap-x-2 px-3";

type ProtocolFilter = "all" | "Tcp" | "Udp";
type StateFilter = "listen" | "all";

interface PortsPageProps {
  snapshot: ProcessSnapshot | null;
  byPid: Map<number, ProcessInfo>;
  watchedPorts: number[];
  onViewProcess: (pid: number) => void;
  onKill: (process: ProcessInfo) => void;
  onToggleWatch: (port: number) => void;
}

export function PortsPage({
  snapshot,
  byPid,
  watchedPorts,
  onViewProcess,
  onKill,
  onToggleWatch,
}: PortsPageProps) {
  const [search, setSearch] = useState("");
  const [protocol, setProtocol] = useState<ProtocolFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("listen");
  const now = snapshot?.capturedAt ?? Date.now();

  const rows = useMemo(() => {
    const list = snapshot?.ports ?? [];
    const q = search.trim().toLowerCase();
    return list
      .filter((p) => {
        if (protocol !== "all" && p.protocol !== protocol) return false;
        if (stateFilter === "listen" && p.state !== "Listen") return false;
        if (!q) return true;
        const proc = byPid.get(p.pid);
        return (
          String(p.localPort).includes(q) ||
          String(p.pid).includes(q) ||
          (proc?.name.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        // 关注端口置顶，其余按端口号升序
        const wa = watchedPorts.includes(a.localPort) ? 0 : 1;
        const wb = watchedPorts.includes(b.localPort) ? 0 : 1;
        return wa - wb || a.localPort - b.localPort;
      });
  }, [snapshot, search, protocol, stateFilter, byPid, watchedPorts]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  if (!snapshot) {
    return (
      <div className="tool-empty-state text-xs text-muted-foreground">
        {typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
          ? "正在采集端口快照…"
          : "浏览器预览模式：启动 Tauri 桌面应用后展示实时端口数据"}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具行 */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="relative w-64">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索端口号 / PID / 进程名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          value={protocol}
          onValueChange={(v) => setProtocol(v as ProtocolFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="Tcp">TCP</TabsTrigger>
            <TabsTrigger value="Udp">UDP</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={stateFilter}
          onValueChange={(v) => setStateFilter(v as StateFilter)}
        >
          <TabsList>
            <TabsTrigger value="listen">监听中</TabsTrigger>
            <TabsTrigger value="all">全部状态</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} 条
        </span>
      </div>

      {/* 表头 */}
      <div
        className={cn(
          GRID_COLS,
          "section-kicker h-8 shrink-0 border-b border-border normal-case",
        )}
      >
        <span>端口</span>
        <span>协议</span>
        <span>状态</span>
        <span>PID</span>
        <span>进程名</span>
        <span>启动时间</span>
        <span>时长</span>
        <span className="text-right">操作</span>
      </div>

      {/* 数据行（虚拟滚动） */}
      {rows.length === 0 ? (
        <div className="tool-empty-state text-xs text-muted-foreground">
          没有匹配的端口
        </div>
      ) : (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const port = rows[vi.index];
              const proc = byPid.get(port.pid);
              const watched = watchedPorts.includes(port.localPort);
              return (
                <div
                  key={`${port.protocol}-${port.localAddr}-${port.localPort}-${port.pid}-${vi.index}`}
                  data-index={vi.index}
                  className={cn(
                    GRID_COLS,
                    "absolute top-0 left-0 h-9 w-full border-b border-border text-xs transition-colors duration-150",
                    watched ? "bg-accent/70 hover:bg-accent" : "hover:bg-accent/60",
                  )}
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <span className="flex items-center gap-1.5 font-mono font-medium">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="cursor-pointer"
                          onClick={() => onToggleWatch(port.localPort)}
                        >
                          <Star
                            className={cn(
                              "size-3.5",
                              watched
                                ? "fill-warning text-warning"
                                : "text-muted-foreground/50 hover:text-warning",
                            )}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {watched ? "取消关注" : "加入关注端口"}
                      </TooltipContent>
                    </Tooltip>
                    {port.localPort}
                  </span>
                  <Badge variant="outline">{port.protocol}</Badge>
                  {port.state ? (
                    <Badge
                      variant={port.state === "Listen" ? "success" : "outline"}
                      className="w-fit font-mono"
                    >
                      {port.state}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <span className="font-mono text-muted-foreground">
                    {port.pid}
                  </span>
                  <span className="truncate">{proc?.name ?? "（已退出）"}</span>
                  <span className="font-mono text-muted-foreground">
                    {proc ? formatTime(proc.startTime) : "-"}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {proc ? formatDuration(proc.startTime, now) : "-"}
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => onViewProcess(port.pid)}
                      disabled={!proc}
                    >
                      <Crosshair />
                      查看进程
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => proc && onKill(proc)}
                      disabled={!proc}
                    >
                      释放端口
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
