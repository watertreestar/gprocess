import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Cpu, Eye, Ghost, OctagonX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IslandAlert } from "@/lib/types";

const AUTO_DISMISS_MS = 30_000;

function orphanAge(minutes: number): string {
  if (minutes >= 120) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes)} 分钟`;
}

/**
 * 刘海屏通知窗口：监听 island:alert 入队展示卡片，
 * 查看/结束操作回传主面板（结束走主面板确认 Dialog，不直接杀）。
 */
export default function IslandApp() {
  const [queue, setQueue] = useState<IslandAlert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  // 透明背景 + 复用主面板主题 token
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    try {
      const raw = localStorage.getItem("gprocess.settings");
      const theme = raw ? (JSON.parse(raw) as { theme?: string }).theme : null;
      document.documentElement.dataset.theme = theme ?? "prism-light";
    } catch {
      /* 读取失败用默认主题 */
    }
  }, []);

  const hideWindow = () => void getCurrentWindow().hide().catch(() => {});

  const dequeue = useCallback(() => {
    setQueue((q) => {
      const next = q.slice(1);
      if (next.length === 0) hideWindow();
      return next;
    });
    setExpanded(false);
  }, []);

  // 监听告警入队并弹出窗口
  useEffect(() => {
    const unlisten = listen<IslandAlert>("island:alert", (e) => {
      setQueue((q) => [...q, e.payload]);
      void getCurrentWindow().show().catch(() => {});
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // 当前卡片：展开动画 + 30 秒无操作自动忽略
  useEffect(() => {
    if (queue.length === 0) return;
    const expandTimer = window.setTimeout(() => setExpanded(true), 60);
    timerRef.current = window.setTimeout(dequeue, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(expandTimer);
      window.clearTimeout(timerRef.current);
    };
  }, [queue, dequeue]);

  const act = (action: "view" | "kill") => {
    const cur = queue[0];
    if (!cur) return;
    void emit("island:action", { action, pid: cur.pid }).catch(() => {});
    // 操作后主面板接管，清空队列并隐藏
    setQueue([]);
    setExpanded(false);
    hideWindow();
  };

  const cur = queue[0];
  return (
    <div className="flex h-screen w-screen items-start justify-center overflow-hidden">
      {cur && (
        <div
          className={cn(
            "flex flex-col overflow-hidden rounded-[20px] border border-border bg-popover text-foreground shadow-2xl transition-all duration-300 ease-out",
            expanded ? "h-[154px] w-[328px]" : "h-[38px] w-[220px]",
          )}
        >
          {/* 胶囊行（收起时也可见） */}
          <div className="flex h-9 shrink-0 items-center gap-2 px-3">
            {cur.kind === "highCpu" ? (
              <Cpu className="size-4 shrink-0 text-chart-1" strokeWidth={1.8} />
            ) : (
              <Ghost className="size-4 shrink-0 text-warning" strokeWidth={1.8} />
            )}
            <span className="truncate text-xs font-medium">{cur.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {cur.pid}
            </span>
            {queue.length > 1 && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                +{queue.length - 1}
              </span>
            )}
          </div>
          {/* 展开内容 */}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 transition-opacity duration-200",
              expanded ? "opacity-100" : "opacity-0",
            )}
          >
            <p className="text-xs text-muted-foreground">
              {cur.kind === "highCpu"
                ? `CPU 持续 ${cur.value.toFixed(0)}%，可能存在失控任务`
                : `父进程已退出，仍在后台运行 ${orphanAge(cur.value)}`}
            </p>
            <div className="mt-auto flex items-center gap-1.5">
              <Button size="xs" onClick={() => act("view")}>
                <Eye />
                查看
              </Button>
              <Button
                size="xs"
                variant="secondary"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => act("kill")}
              >
                <OctagonX />
                结束…
              </Button>
              <Button size="xs" variant="ghost" className="ml-auto" onClick={dequeue}>
                <X />
                忽略
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
