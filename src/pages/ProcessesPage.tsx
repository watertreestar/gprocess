import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Search, Star } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProcessDetail } from "@/components/ProcessDetail";
import { cmdlineText, formatBytes, formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FilterTab, Settings } from "@/lib/settings";
import type {
  KillMode,
  PortBinding,
  ProcessInfo,
  ProcessSnapshot,
  SortKey,
} from "@/lib/types";

const GRID_COLS =
  "grid grid-cols-[16px_minmax(150px,1.4fr)_64px_minmax(110px,1fr)_48px_64px_56px_76px_100px_minmax(180px,2.5fr)] items-center gap-x-2 px-3";

const HIGH_CPU = 30;
const HIGH_MEM = 1024 * 1024 * 1024; // 1GB
const SYSTEM_USER_RE = /system|local service|network service/i;

interface ProcessesPageProps {
  snapshot: ProcessSnapshot | null;
  byPid: Map<number, ProcessInfo>;
  portsByPid: Map<number, PortBinding[]>;
  listenPids: Set<number>;
  settings: Settings;
  selectedPid: number | null;
  onSelect: (pid: number | null) => void;
  onKill: (process: ProcessInfo, mode: KillMode) => void;
  onGotoPorts: () => void;
}

export function ProcessesPage({
  snapshot,
  byPid,
  portsByPid,
  listenPids,
  settings,
  selectedPid,
  onSelect,
  onKill,
  onGotoPorts,
}: ProcessesPageProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("startTime");
  const [sortAsc, setSortAsc] = useState(false);
  const [tab, setTab] = useState<FilterTab>(settings.defaultFilter);
  const now = snapshot?.capturedAt ?? Date.now();

  const orphanCount = useMemo(
    () =>
      (snapshot?.processes ?? []).filter((p) => p.orphan.status === "confirmed")
        .length,
    [snapshot],
  );

  const rows = useMemo(() => {
    const list = snapshot?.processes ?? [];
    const q = search.trim().toLowerCase();
    const filtered = list.filter((p) => {
      if (
        !settings.showSystemProcesses &&
        p.user != null &&
        SYSTEM_USER_RE.test(p.user)
      ) {
        return false;
      }
      switch (tab) {
        case "orphan":
          if (p.orphan.status !== "confirmed") return false;
          break;
        case "listen":
          if (!listenPids.has(p.pid)) return false;
          break;
        case "heavy":
          if (p.cpuPercent < HIGH_CPU && p.memoryBytes < HIGH_MEM) return false;
          break;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        cmdlineText(p.cmdline).toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered];
    if (tab === "orphan") {
      // 孤儿视图按展示优先级排序（runtime / 监听端口 / 长时间运行优先）
      sorted.sort(
        (a, b) =>
          b.orphan.heuristicScore - a.orphan.heuristicScore ||
          b.startTime - a.startTime,
      );
      return sorted;
    }
    const dir = sortAsc ? 1 : -1;
    const tiebreak = (a: ProcessInfo, b: ProcessInfo) =>
      a.name.localeCompare(b.name) || a.pid - b.pid;
    switch (sortKey) {
      case "cpu":
        sorted.sort(
          (a, b) => dir * (a.cpuPercent - b.cpuPercent) || tiebreak(a, b),
        );
        break;
      case "memory":
        sorted.sort(
          (a, b) => dir * (a.memoryBytes - b.memoryBytes) || tiebreak(a, b),
        );
        break;
      default:
        sorted.sort((a, b) => dir * (a.startTime - b.startTime) || tiebreak(a, b));
    }
    return sorted;
  }, [snapshot, search, sortKey, sortAsc, tab, listenPids, settings.showSystemProcesses]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  const selected = selectedPid != null ? byPid.get(selectedPid) : undefined;

  if (!snapshot) {
    return (
      <div className="tool-empty-state text-xs text-muted-foreground">
        {typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
          ? "正在采集进程快照…"
          : "浏览器预览模式：启动 Tauri 桌面应用后展示实时进程数据"}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 工具行 */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
          <div className="relative w-64">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="搜索名称 / PID / 命令行"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="orphan">
                疑似孤儿
                {orphanCount > 0 && (
                  <Badge variant="warning" className="ml-1">
                    {orphanCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="listen">监听端口</TabsTrigger>
              <TabsTrigger value="heavy">高占用</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab !== "orphan" && (
            <>
              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey(v as SortKey)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="startTime">按启动时间</SelectItem>
                  <SelectItem value="cpu">按 CPU</SelectItem>
                  <SelectItem value="memory">按内存</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSortAsc((v) => !v)}
              >
                {sortAsc ? <ArrowUpWideNarrow /> : <ArrowDownWideNarrow />}
              </Button>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {rows.length} / {snapshot.processes.length} 个进程
          </span>
        </div>

        {/* 表头 */}
        <div
          className={cn(
            GRID_COLS,
            "section-kicker h-8 shrink-0 border-b border-border normal-case",
          )}
        >
          <span />
          <span>名称</span>
          <span>PID</span>
          <span>父进程</span>
          <span className="text-right">端口</span>
          <span>时长</span>
          <span className="text-right">CPU</span>
          <span className="text-right">内存</span>
          <span>启动时间</span>
          <span>命令行</span>
        </div>

        {/* 数据行（虚拟滚动） */}
        {rows.length === 0 ? (
          <div className="tool-empty-state text-xs text-muted-foreground">
            没有匹配的进程
          </div>
        ) : (
          <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const p = rows[vi.index];
                const ownedPorts = portsByPid.get(p.pid) ?? [];
                const portCount = ownedPorts.length;
                const watchedHits = ownedPorts.filter((port) =>
                  settings.watchedPorts.includes(port.localPort),
                );
                const parent = p.ppid != null ? byPid.get(p.ppid) : undefined;
                const cmd = cmdlineText(p.cmdline);
                const isSelected = p.pid === selectedPid;
                const isOrphan = p.orphan.status === "confirmed";
                return (
                  <div
                    key={p.pid}
                    data-index={vi.index}
                    className={cn(
                      GRID_COLS,
                      "absolute top-0 left-0 h-9 w-full cursor-pointer border-b border-border text-xs transition-colors duration-150",
                      isSelected
                        ? "bg-accent"
                        : isOrphan
                          ? "bg-warning/8 hover:bg-warning/15"
                          : "hover:bg-accent/60",
                    )}
                    style={{ transform: `translateY(${vi.start}px)` }}
                    onClick={() => onSelect(isSelected ? null : p.pid)}
                  >
                    <span
                      className={cn(
                        "status-dot",
                        p.status === "Running"
                          ? "bg-success"
                          : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {isOrphan && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="warning">孤儿</Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {p.orphan.pidReused
                              ? "父 PID 已被复用，真正的父进程已退出"
                              : "父进程已退出，该进程在后台遗留运行"}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {watchedHits.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="info">
                              <Star />
                              {watchedHits[0].localPort}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            占用关注端口：
                            {watchedHits.map((w) => w.localPort).join("、")}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {p.pid}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {parent ? parent.name : p.ppid != null ? `#${p.ppid}` : "-"}
                    </span>
                    <span className="text-right font-mono text-muted-foreground">
                      {portCount > 0 ? portCount : ""}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {formatDuration(p.startTime, now)}
                    </span>
                    <span className="text-right font-mono">
                      {p.cpuPercent.toFixed(1)}%
                    </span>
                    <span className="text-right font-mono">
                      {formatBytes(p.memoryBytes)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {formatTime(p.startTime)}
                    </span>
                    {cmd ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate font-mono text-muted-foreground">
                            {cmd}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="font-mono">
                          {cmd}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 详情侧栏 */}
      <ProcessDetail
        process={selected}
        processes={snapshot.processes}
        byPid={byPid}
        ports={selectedPid != null ? (portsByPid.get(selectedPid) ?? []) : []}
        now={now}
        thresholdMin={settings.orphanThresholdMin}
        onSelect={onSelect}
        onClose={() => onSelect(null)}
        onKill={onKill}
        onGotoPorts={onGotoPorts}
      />
    </div>
  );
}
