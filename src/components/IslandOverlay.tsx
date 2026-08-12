import { useEffect, useRef, useState } from "react";
import { Cpu, Eye, Ghost, OctagonX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IslandAlert } from "@/lib/types";

const AUTO_DISMISS_MS = 30_000;

interface IslandOverlayProps {
  queue: IslandAlert[];
  onView: (pid: number) => void;
  onKill: (pid: number) => void;
  onDismiss: () => void;
}

/**
 * 主窗口内灵动岛通知：顶部居中黑色胶囊（macOS 风格，不随主题变色），
 * 告警时展开为单排操作条，30 秒无操作自动收起。
 */
export function IslandOverlay({
  queue,
  onView,
  onKill,
  onDismiss,
}: IslandOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const cur = queue[0];

  // 当前卡片：展开动画 + 30 秒无操作自动忽略
  useEffect(() => {
    if (!cur) {
      setExpanded(false);
      return;
    }
    const expandTimer = window.setTimeout(() => setExpanded(true), 60);
    timerRef.current = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(expandTimer);
      window.clearTimeout(timerRef.current);
    };
  }, [cur, onDismiss]);

  if (!cur) return null;

  return (
    <div className="pointer-events-none absolute top-2 left-1/2 z-50 -translate-x-1/2">
      <div
        className={cn(
          "pointer-events-auto flex h-[34px] items-center gap-2 overflow-hidden rounded-full bg-neutral-900/95 pr-1.5 pl-3 text-white shadow-xl ring-1 ring-white/10 transition-all duration-300 ease-out",
          expanded ? "w-[400px]" : "w-[210px]",
        )}
      >
        {cur.kind === "highCpu" ? (
          <Cpu className="size-3.5 shrink-0 text-violet-300" strokeWidth={2} />
        ) : (
          <Ghost className="size-3.5 shrink-0 text-amber-300" strokeWidth={2} />
        )}
        <span className="truncate text-xs font-medium">{cur.name}</span>
        <span className="shrink-0 font-mono text-[10px] text-white/50">
          {cur.pid}
        </span>
        {queue.length > 1 && (
          <span className="shrink-0 font-mono text-[10px] text-white/50">
            +{queue.length - 1}
          </span>
        )}

        {/* 展开后：指标 + 操作 */}
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-200",
            expanded ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="mr-1 shrink-0 font-mono text-[10px] text-white/70">
            {cur.kind === "highCpu" ? `CPU ${cur.value.toFixed(0)}%` : "长时间孤儿"}
          </span>
          <IslandButton label="查看" onClick={() => onView(cur.pid)}>
            <Eye />
          </IslandButton>
          <IslandButton label="结束" danger onClick={() => onKill(cur.pid)}>
            <OctagonX />
          </IslandButton>
          <IslandButton label="忽略" onClick={onDismiss}>
            <X />
          </IslandButton>
        </div>
      </div>
    </div>
  );
}

function IslandButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-6 cursor-pointer items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/40",
        danger
          ? "text-red-300 hover:bg-red-400/20"
          : "text-white/80 hover:bg-white/15",
      )}
    >
      <span className="[&_svg]:size-3.5">{children}</span>
    </button>
  );
}
