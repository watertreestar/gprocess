import { Activity, ChevronsLeft, ChevronsRight, FileSearch, Network, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PageId } from "@/lib/types";

const NAV_ITEMS: { id: PageId; label: string; icon: typeof Activity }[] = [
  { id: "processes", label: "进程", icon: Activity },
  { id: "ports", label: "端口", icon: Network },
  { id: "handles", label: "句柄", icon: FileSearch },
  { id: "settings", label: "设置", icon: Settings },
];

interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function Sidebar({ page, onNavigate, expanded, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        expanded ? "w-48" : "w-[52px]",
      )}
    >
      {/* 品牌行 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
          g
        </div>
        {expanded && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">gprocess</div>
            <div className="truncate text-[10px] text-muted-foreground">
              进程与端口管理
            </div>
          </div>
        )}
      </div>

      {/* 主导航 */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {NAV_ITEMS.map((item) => {
          const active = page === item.id;
          const Icon = item.icon;
          const button = (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "relative flex h-8 cursor-pointer items-center rounded-md text-xs transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                expanded ? "gap-2 px-2" : "justify-center",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute top-1/2 left-0 h-4 w-px -translate-y-1/2 bg-sidebar-primary" />
              )}
              <Icon className="size-4 shrink-0" strokeWidth={1.8} />
              {expanded && <span className="truncate">{item.label}</span>}
            </button>
          );
          if (expanded) return button;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* 底部操作区 */}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border p-1.5">
        <button
          onClick={onToggle}
          className={cn(
            "flex h-8 cursor-pointer items-center rounded-md text-xs text-sidebar-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
            expanded ? "gap-2 px-2" : "justify-center",
          )}
        >
          {expanded ? (
            <ChevronsLeft className="size-4 shrink-0" strokeWidth={1.8} />
          ) : (
            <ChevronsRight className="size-4 shrink-0" strokeWidth={1.8} />
          )}
          {expanded && <span>收起侧栏</span>}
        </button>
      </div>
    </aside>
  );
}
