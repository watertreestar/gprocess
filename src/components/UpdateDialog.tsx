import { useEffect, useState } from "react";
import { Download, SkipForward } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Phase = "available" | "downloading" | "error";

interface UpdateDialogProps {
  update: Update | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkip: (version: string) => void;
}

export function UpdateDialog({
  update,
  open,
  onOpenChange,
  onSkip,
}: UpdateDialogProps) {
  const [phase, setPhase] = useState<Phase>("available");
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");

  // 每次弹出重置内部状态
  useEffect(() => {
    if (open) {
      setPhase("available");
      setDownloaded(0);
      setTotal(null);
      setError("");
    }
  }, [open, update]);

  if (!update) return <Dialog open={false} onOpenChange={onOpenChange} />;

  const handleInstall = async () => {
    setPhase("downloading");
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          setTotal(e.data.contentLength ?? null);
        } else if (e.event === "Progress") {
          setDownloaded((d) => d + e.data.chunkLength);
        }
      });
      await relaunch();
    } catch (e) {
      setPhase("error");
      setError(String(e));
    }
  };

  const progress = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {phase === "error" ? "更新失败" : `发现新版本 v${update.version}`}
          </DialogTitle>
          <DialogDescription>
            {phase === "error"
              ? error
              : phase === "downloading"
                ? "正在下载并安装更新，完成后应用将自动重启…"
                : `当前版本 v${update.currentVersion}，更新说明如下：`}
          </DialogDescription>
        </DialogHeader>

        {phase === "available" && (
          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
            {update.body ?? "（无更新说明）"}
          </div>
        )}

        {phase === "downloading" && (
          <div className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full bg-primary transition-all",
                  progress == null && "w-1/3 animate-pulse",
                )}
                style={progress != null ? { width: `${progress}%` } : undefined}
              />
            </div>
            <p className="text-center font-mono text-[10px] text-muted-foreground">
              {progress != null ? `${progress}%` : "下载中…"}
            </p>
          </div>
        )}

        <DialogFooter>
          {phase === "available" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSkip(update.version)}
              >
                <SkipForward />
                跳过此版本
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                稍后
              </Button>
            </>
          )}
          {phase === "error" && (
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          )}
          <Button size="sm" onClick={handleInstall} disabled={phase === "downloading"}>
            <Download />
            {phase === "error" ? "重试" : phase === "downloading" ? "安装中…" : "下载并安装"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
