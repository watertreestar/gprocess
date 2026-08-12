import { Check, Copy, MousePointerClick, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assessProcess, isTauri } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cmdlineText, formatBytes, formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LEVEL_META,
  type KillAssessment,
  type KillMode,
  type PortBinding,
  type ProcessInfo,
} from "@/lib/types";

const TREE_ROW_CAP = 50;

interface ProcessDetailProps {
  process: ProcessInfo | undefined;
  processes: ProcessInfo[];
  byPid: Map<number, ProcessInfo>;
  ports: PortBinding[];
  now: number;
  thresholdMin: number;
  orphanExcludes: string[];
  onSelect: (pid: number | null) => void;
  onClose: () => void;
  onKill: (process: ProcessInfo, mode: KillMode) => void;
  onGotoPorts: () => void;
  onToggleExclude: (name: string) => void;
}

export function ProcessDetail({
  process,
  processes,
  byPid,
  ports,
  now,
  thresholdMin,
  orphanExcludes,
  onSelect,
  onClose,
  onKill,
  onGotoPorts,
  onToggleExclude,
}: ProcessDetailProps) {
  const [copied, setCopied] = useState(false);
  const [assessment, setAssessment] = useState<KillAssessment | null>(null);
  const [assessError, setAssessError] = useState(false);

  const pid = process?.pid;
  useEffect(() => {
    setAssessment(null);
    setAssessError(false);
    if (pid == null || !isTauri) return;
    let cancelled = false;
    assessProcess(pid, thresholdMin, orphanExcludes)
      .then((a) => !cancelled && setAssessment(a))
      .catch(() => !cancelled && setAssessError(true));
    return () => {
      cancelled = true;
    };
  }, [pid, thresholdMin, orphanExcludes]);

  // 资源历史：每个选中进程保留近 30 个采样点（≈60s），切换进程不清空
  const historyRef = useRef<Map<number, { cpu: number[]; mem: number[] }>>(
    new Map(),
  );
  useEffect(() => {
    if (!process) return;
    const map = historyRef.current;
    if (map.size > 500) map.clear();
    const entry = map.get(process.pid) ?? { cpu: [], mem: [] };
    entry.cpu = [...entry.cpu.slice(-29), process.cpuPercent];
    entry.mem = [...entry.mem.slice(-29), process.memoryBytes];
    map.set(process.pid, entry);
    // 依赖 process 对象引用：每次快照更新都会追加一个采样点
  }, [process]);

  // 父链（向上最多 3 层，环保护）
  const ancestors = useMemo(() => {
    if (!process) return [];
    const chain: ProcessInfo[] = [];
    const seen = new Set<number>([process.pid]);
    let cur = process.ppid;
    while (cur != null && chain.length < 3 && !seen.has(cur)) {
      const parent = byPid.get(cur);
      if (!parent) break;
      chain.unshift(parent);
      seen.add(cur);
      cur = parent.ppid;
    }
    return chain;
  }, [process, byPid]);

  // 子孙树（前序展开，深度缩进）
  const descendants = useMemo(() => {
    if (!process) return { rows: [] as { proc: ProcessInfo; depth: number }[], total: 0 };
    const childrenMap = new Map<number, ProcessInfo[]>();
    for (const p of processes) {
      if (p.ppid != null && p.ppid !== p.pid) {
        const list = childrenMap.get(p.ppid) ?? [];
        list.push(p);
        childrenMap.set(p.ppid, list);
      }
    }
    const rows: { proc: ProcessInfo; depth: number }[] = [];
    let total = 0;
    const seen = new Set<number>([process.pid]);
    const walk = (ppid: number, depth: number) => {
      for (const child of childrenMap.get(ppid) ?? []) {
        if (seen.has(child.pid)) continue;
        seen.add(child.pid);
        total += 1;
        if (rows.length < TREE_ROW_CAP) rows.push({ proc: child, depth });
        walk(child.pid, depth + 1);
      }
    };
    walk(process.pid, 1);
    return { rows, total };
  }, [process, processes]);

  if (!process) {
    return (
      <aside className="tool-sidebar">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <MousePointerClick className="size-5 text-muted-foreground" strokeWidth={1.8} />
          <p className="text-xs text-muted-foreground">
            在左侧列表选择一个进程查看详情
          </p>
        </div>
      </aside>
    );
  }

  const cmd = cmdlineText(process.cmdline);
  const isOrphan = process.orphan.status === "confirmed";
  const isExpected = process.orphan.status === "expected";
  const excluded = orphanExcludes.includes(process.name.toLowerCase());
  const forbidden = assessment?.level === "forbidden";

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  const treeRow = (p: ProcessInfo, depth: number, current = false) => (
    <button
      key={p.pid}
      onClick={() => !current && onSelect(p.pid)}
      style={{ paddingLeft: 4 + depth * 14 }}
      className={cn(
        "flex h-7 w-full items-center gap-1.5 rounded-md pr-1.5 text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        current
          ? "cursor-default bg-accent font-medium"
          : "cursor-pointer hover:bg-accent/60",
      )}
    >
      <span className="truncate">{p.name}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
        {p.pid}
      </span>
    </button>
  );

  return (
    <aside className="tool-sidebar">
      {/* 侧栏头 */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="section-kicker">进程详情</span>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 概要 */}
        <div className="tool-section">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">
              {process.name}
            </span>
            <Badge variant="secondary" className="font-mono">
              {process.pid}
            </Badge>
          </div>
          <dl className="grid grid-cols-[72px_1fr] gap-y-1 text-xs">
            <dt className="text-muted-foreground">用户</dt>
            <dd className="truncate">{process.user ?? "-"}</dd>
            <dt className="text-muted-foreground">启动时间</dt>
            <dd className="font-mono">{formatTime(process.startTime)}</dd>
            <dt className="text-muted-foreground">运行时长</dt>
            <dd className="font-mono">
              {formatDuration(process.startTime, now)}
            </dd>
            <dt className="text-muted-foreground">CPU</dt>
            <dd className="font-mono">{process.cpuPercent.toFixed(1)}%</dd>
            <dt className="text-muted-foreground">内存</dt>
            <dd className="font-mono">{formatBytes(process.memoryBytes)}</dd>
            <dt className="text-muted-foreground">可执行文件</dt>
            <dd className="truncate font-mono text-muted-foreground">
              {process.exePath ?? "-"}
            </dd>
          </dl>
        </div>

        {/* 资源曲线（近 60 秒） */}
        {(() => {
          const history = historyRef.current.get(process.pid);
          if (!history || history.cpu.length < 2) return null;
          return (
            <div className="tool-section">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="section-kicker">资源曲线（近 60 秒）</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  <span className="text-chart-1">CPU {process.cpuPercent.toFixed(0)}%</span>
                  {" · "}
                  <span className="text-chart-2">{formatBytes(process.memoryBytes)}</span>
                </span>
              </div>
              <Sparkline cpu={history.cpu} mem={history.mem} />
            </div>
          );
        })()}

        {/* 孤儿判定 */}
        <div className="tool-section">
          <div className="section-kicker mb-1.5">孤儿判定</div>
          <div className="flex items-center gap-2">
            {isOrphan ? (
              <Badge variant="warning">疑似孤儿</Badge>
            ) : isExpected ? (
              <Badge variant="secondary">正常守护</Badge>
            ) : excluded ? (
              <Badge variant="info">已豁免</Badge>
            ) : (
              <Badge variant="success">父进程存活</Badge>
            )}
            {isOrphan && process.orphan.heuristicScore > 0 && (
              <span className="text-[10px] text-muted-foreground">
                特征匹配 {process.orphan.heuristicScore}/3
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isOrphan
              ? process.orphan.pidReused
                ? "父 PID 已被新进程复用，真正的父进程已退出。"
                : process.orphan.parentName
                  ? `父进程 ${process.orphan.parentName} 已退出，该进程在后台遗留运行。`
                  : "父进程已退出（身份未知：孤儿化发生在面板启动前）。"
              : isExpected
                ? `由系统启动器 ${process.orphan.parentName ?? ""} 拉起，父进程退出属正常守护行为。`
                : excluded
                  ? "在孤儿豁免名单中，不再判定为孤儿。"
                  : "父进程仍在运行，属于正常的父子关系。"}
          </p>
          {(isOrphan || excluded) && (
            <Button
              variant="ghost"
              size="xs"
              className="mt-1.5"
              onClick={() => onToggleExclude(process.name)}
            >
              {excluded ? "取消豁免" : "标记为有意后台进程（豁免）"}
            </Button>
          )}
        </div>

        {/* 进程树 */}
        <div className="tool-section">
          <div className="section-kicker mb-1.5">进程树</div>
          {ancestors.length === 0 && descendants.total === 0 ? (
            <p className="text-xs text-muted-foreground">无关联进程</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {ancestors.map((p, i) => treeRow(p, i))}
              {treeRow(process, ancestors.length, true)}
              {descendants.rows.map(({ proc, depth }) =>
                treeRow(proc, ancestors.length + depth),
              )}
              {descendants.total > descendants.rows.length && (
                <p className="px-1 text-[10px] text-muted-foreground">
                  …还有 {descendants.total - descendants.rows.length} 个子孙进程
                </p>
              )}
            </div>
          )}
        </div>

        {/* 杀前评估 */}
        <div className="tool-section">
          <div className="section-kicker mb-1.5">杀前评估</div>
          {assessment ? (
            <div className="flex flex-col gap-1.5">
              <Badge variant={LEVEL_META[assessment.level].badge} className="w-fit">
                {LEVEL_META[assessment.level].label}
              </Badge>
              <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {assessment.reasons.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
                {assessment.notes.map((n, i) => (
                  <li key={`n${i}`} className="text-[10px]">
                    · {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {assessError ? "评估失败（进程可能已退出）" : "评估中…"}
            </p>
          )}
        </div>

        {/* 命令行 */}
        <div className="tool-section">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="section-kicker">命令行</span>
            {cmd && (
              <Button variant="ghost" size="xs" onClick={copyCmd}>
                {copied ? <Check /> : <Copy />}
                {copied ? "已复制" : "复制"}
              </Button>
            )}
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {cmd || "（无命令行信息，可能权限不足）"}
          </p>
        </div>

        {/* 占用端口 */}
        <div className="tool-section">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="section-kicker">占用端口</span>
            {ports.length > 0 && (
              <Button variant="ghost" size="xs" onClick={onGotoPorts}>
                在端口页查看
              </Button>
            )}
          </div>
          {ports.length === 0 ? (
            <p className="text-xs text-muted-foreground">未占用端口</p>
          ) : (
            <div className="flex flex-col gap-1">
              {ports.map((port, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-medium">
                    {port.localPort}
                  </span>
                  <Badge variant="outline">{port.protocol}</Badge>
                  {port.state && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {port.state}
                    </span>
                  )}
                  <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                    {port.localAddr}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 操作区 */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => onKill(process, "single")}
                disabled={forbidden}
              >
                结束进程
              </Button>
            </span>
          </TooltipTrigger>
          {forbidden && (
            <TooltipContent>系统关键进程，禁止结束</TooltipContent>
          )}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block">
              <Button
                variant="secondary"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={() => onKill(process, "tree")}
                disabled={forbidden || descendants.total === 0}
              >
                结束进程树
                {descendants.total > 0 && `（含 ${descendants.total} 个子孙）`}
              </Button>
            </span>
          </TooltipTrigger>
          {forbidden ? (
            <TooltipContent>系统关键进程，禁止结束</TooltipContent>
          ) : (
            descendants.total === 0 && (
              <TooltipContent>没有子孙进程</TooltipContent>
            )
          )}
        </Tooltip>
      </div>
    </aside>
  );
}

/** 资源曲线：CPU / 内存双折线，样本不足时右对齐（最新点在右侧） */
function Sparkline({ cpu, mem }: { cpu: number[]; mem: number[] }) {
  const W = 268;
  const H = 44;
  const N = 30;

  const toPoints = (values: number[], normalize: (v: number) => number) => {
    // 右对齐：不足 N 个点时左侧留白
    const offset = N - values.length;
    return values
      .map((v, i) => {
        const x = ((offset + i) / (N - 1)) * W;
        const y = H - 2 - normalize(v) * (H - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const memMax = Math.max(...mem, 1);
  const cpuPoints = toPoints(cpu, (v) => Math.min(v / 100, 1));
  const memPoints = toPoints(mem, (v) => v / memMax);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-11 w-full"
      role="img"
      aria-label="CPU 与内存近 60 秒曲线"
    >
      <polyline
        points={cpuPoints}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={memPoints}
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
