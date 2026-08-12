import { RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isTauri } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { REFRESH_OPTIONS } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  summary?: string;
  capturedAt?: number;
  refreshing: boolean;
  refreshIntervalMs: number;
  isAdmin: boolean;
  onRefresh: () => void;
}

export function TopBar({
  title,
  summary,
  capturedAt,
  refreshing,
  refreshIntervalMs,
  isAdmin,
  onRefresh,
}: TopBarProps) {
  const intervalLabel =
    REFRESH_OPTIONS.find((o) => o.value === refreshIntervalMs)?.label ?? "手动刷新";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-base font-semibold">{title}</h1>
        {summary && (
          <span className="truncate text-xs text-muted-foreground">
            {summary}
          </span>
        )}
        {!isTauri && (
          <Badge variant="warning">浏览器预览：无后端数据</Badge>
        )}
        {isTauri && !isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="warning">
                <ShieldAlert />
                受限模式
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              未以管理员运行，部分进程/端口信息不可见。可在「设置 → 权限」以管理员重启。
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {capturedAt != null && (
          <span className="font-mono text-xs text-muted-foreground">
            快照 {formatTime(capturedAt)}
          </span>
        )}
        <Badge variant="outline">{intervalLabel}</Badge>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={!isTauri || refreshing}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          刷新
        </Button>
      </div>
    </header>
  );
}
