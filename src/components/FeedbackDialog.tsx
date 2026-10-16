import { useEffect, useState } from "react";
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
import { recordFeedback } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FeedbackLabel, ProcessInfo } from "@/lib/types";

const LABEL_OPTIONS: { value: FeedbackLabel; title: string; desc: string }[] = [
  {
    value: "not_orphan",
    title: "这不是孤儿",
    desc: "当前标记为疑似孤儿，实际是正常后台进程",
  },
  {
    value: "origin_wrong",
    title: "来源分类错误",
    desc: "状态为正常守护，但来源 / 说明文案不对",
  },
  {
    value: "is_orphan",
    title: "漏判：它其实是孤儿",
    desc: "当前未标记为孤儿，但父进程已退出",
  },
];

interface FeedbackDialogProps {
  process: ProcessInfo | null;
  open: boolean;
  thresholdMin: number;
  onOpenChange: (open: boolean) => void;
  onRecorded: (total: number) => void;
}

export function FeedbackDialog({
  process,
  open,
  thresholdMin,
  onOpenChange,
  onRecorded,
}: FeedbackDialogProps) {
  const [label, setLabel] = useState<FeedbackLabel | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLabel(null);
    setNote("");
    setSubmitting(false);
    setError(false);
  }, [process]);

  const handleSubmit = async () => {
    if (!process || !label) return;
    setSubmitting(true);
    setError(false);
    try {
      const total = await recordFeedback(
        process.pid,
        label,
        note.trim() || undefined,
        thresholdMin,
      );
      onRecorded(total);
      onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open && process != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>判定反馈</DialogTitle>
          <DialogDescription>
            {process
              ? `反馈 ${process.name}（PID ${process.pid}）的孤儿判定，样本将用于改进判定准确率。`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {LABEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLabel(opt.value)}
              className={cn(
                "cursor-pointer rounded-md border border-border px-3 py-2 text-left transition-colors",
                label === opt.value
                  ? "border-ring bg-accent"
                  : "hover:bg-accent/60",
              )}
            >
              <span className="block text-xs font-medium">{opt.title}</span>
              <span className="block text-[10px] text-muted-foreground">
                {opt.desc}
              </span>
            </button>
          ))}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            className="mt-1 h-8 text-xs"
          />
          {error && (
            <p className="text-[10px] text-destructive">记录失败，请重试</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            size="xs"
            disabled={!label || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "提交中…" : "提交反馈"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
