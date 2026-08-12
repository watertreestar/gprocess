import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cmdlineText } from "@/lib/format";
import {
  LEVEL_META,
  type KillAssessment,
  type KillMode,
  type PortBinding,
  type ProcessInfo,
} from "@/lib/types";

interface KillDialogProps {
  process: ProcessInfo | null;
  mode: KillMode;
  ports: PortBinding[];
  assessment: KillAssessment | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pid: number, mode: KillMode) => Promise<boolean>;
}

export function KillDialog({
  process,
  mode,
  ports,
  assessment,
  onOpenChange,
  onConfirm,
}: KillDialogProps) {
  const [killing, setKilling] = useState(false);
  const [pidInput, setPidInput] = useState("");

  // 每次切换目标时重置输入
  useEffect(() => {
    setPidInput("");
    setKilling(false);
  }, [process, mode]);

  const handleConfirm = async () => {
    if (!process) return;
    setKilling(true);
    try {
      await onConfirm(process.pid, mode);
    } finally {
      setKilling(false);
    }
  };

  if (!process) return <Dialog open={false} onOpenChange={onOpenChange} />;

  const cmd = cmdlineText(process.cmdline);
  const level = assessment?.level;
  const isTree = mode === "tree";
  const children = assessment?.children ?? [];
  const needPidConfirm = level === "danger";
  const forbidden = level === "forbidden";
  const confirmDisabled =
    killing || forbidden || (needPidConfirm && pidInput.trim() !== String(process.pid));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            {isTree ? "结束进程树" : "结束进程"}
            {level && (
              <Badge variant={LEVEL_META[level].badge}>
                {LEVEL_META[level].label}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{process.name}</span>
            <Badge variant="secondary" className="font-mono">
              PID {process.pid}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 评估理由 */}
          {assessment && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {assessment.reasons.map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          )}

          {/* 影响面：子孙进程 */}
          {isTree && children.length > 0 && (
            <div>
              <div className="section-kicker mb-1">
                将一并结束的子孙进程（{children.length}）
              </div>
              <div className="flex max-h-24 flex-col gap-0.5 overflow-y-auto">
                {children.slice(0, 10).map((c) => (
                  <span key={c.pid} className="font-mono text-xs">
                    {c.name}
                    <span className="ml-1.5 text-muted-foreground">{c.pid}</span>
                  </span>
                ))}
                {children.length > 10 && (
                  <span className="text-[10px] text-muted-foreground">
                    …还有 {children.length - 10} 个
                  </span>
                )}
              </div>
            </div>
          )}

          {cmd && (
            <div>
              <div className="section-kicker mb-1">命令行</div>
              <p className="max-h-20 overflow-y-auto font-mono text-xs break-all text-muted-foreground">
                {cmd}
              </p>
            </div>
          )}

          {ports.length > 0 && (
            <div>
              <div className="section-kicker mb-1">
                将被释放的端口（{ports.length}）
              </div>
              <div className="flex flex-wrap gap-1">
                {ports.map((p, i) => (
                  <Badge key={i} variant="warning" className="font-mono">
                    {p.localPort} {p.protocol}
                    {p.state ? ` · ${p.state}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 警告 / 禁止说明 */}
          {forbidden ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>该进程为系统关键进程，不允许结束。</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                结束后未保存的工作将丢失。
                {isTree ? "整个进程树都会被结束。" : "请确认它不是其他应用正在使用的进程。"}
              </span>
            </div>
          )}

          {/* danger 级别：输入 PID 确认 */}
          {needPidConfirm && (
            <div>
              <div className="section-kicker mb-1">
                高风险确认：请输入 PID {process.pid}
              </div>
              <Input
                className="w-40 font-mono"
                placeholder={String(process.pid)}
                value={pidInput}
                onChange={(e) => setPidInput(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={killing}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {killing
              ? "正在结束…"
              : isTree
                ? `结束进程树（${children.length + 1} 个）`
                : "结束进程"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
