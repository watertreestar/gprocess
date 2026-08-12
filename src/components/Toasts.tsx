import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}

export function Toasts({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 4500);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  const Icon = item.kind === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-popover p-3 text-xs shadow-lg",
        item.kind === "success" ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1 text-foreground">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        className="cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
