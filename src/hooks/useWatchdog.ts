import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "@/lib/api";
import type { Settings } from "@/lib/settings";
import type { ProcessSnapshot } from "@/lib/types";

const COOLDOWN_MS = 10 * 60_000; // 同一进程 10 分钟内不重复通知

/** 启动时确保通知权限（Windows 上通常默认授权） */
export function ensureNotificationPermission() {
  if (!isTauri) return;
  isPermissionGranted()
    .then((granted) => {
      if (!granted) return requestPermission();
    })
    .catch(() => {});
}

function notify(title: string, body: string) {
  sendNotification({ title, body });
}

/**
 * 看门狗：检测超高资源占用与长时间孤儿进程，触发 Windows 系统通知。
 * 触发器在前端（快照数据在前端），按 pid 冷却防刷屏。
 */
export function useWatchdog(
  snapshot: ProcessSnapshot | null,
  settings: Settings,
) {
  // pid -> 上次达到 CPU 阈值的快照时间（用于"连续两次"判定）
  const lastCpuHit = useRef<Map<number, number>>(new Map());
  // pid -> 上次通知时间
  const notified = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!snapshot || !isTauri || !settings.notificationsEnabled) return;
    const now = snapshot.capturedAt;

    for (const p of snapshot.processes) {
      const lastNotified = notified.current.get(p.pid) ?? 0;
      if (now - lastNotified < COOLDOWN_MS) continue;

      // 超高 CPU：连续 2 次快照达到阈值才通知（过滤瞬时尖峰）
      if (p.cpuPercent >= settings.highCpuThreshold) {
        const prevHit = lastCpuHit.current.get(p.pid);
        if (prevHit != null && now - prevHit < 10_000) {
          notify(
            "gprocess：超高资源占用",
            `${p.name} (PID ${p.pid}) CPU 持续 ${p.cpuPercent.toFixed(0)}%`,
          );
          notified.current.set(p.pid, now);
          continue;
        }
        lastCpuHit.current.set(p.pid, now);
      } else {
        lastCpuHit.current.delete(p.pid);
      }

      // 长时间孤儿进程
      if (
        p.orphan.status === "confirmed" &&
        p.startTime > 0 &&
        now - p.startTime > settings.longOrphanMin * 60_000
      ) {
        notify(
          "gprocess：长时间孤儿进程",
          `${p.name} (PID ${p.pid}) 父进程已退出，仍在后台运行`,
        );
        notified.current.set(p.pid, now);
      }
    }
  }, [
    snapshot,
    settings.notificationsEnabled,
    settings.highCpuThreshold,
    settings.longOrphanMin,
  ]);
}
