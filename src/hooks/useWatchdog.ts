import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "@/lib/api";
import type { Settings } from "@/lib/settings";
import type { IslandAlert, ProcessSnapshot } from "@/lib/types";

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

/** 按通知渠道分发：toast → Windows 系统通知；island → 主窗口灵动岛 */
function dispatchAlert(
  settings: Settings,
  alert: IslandAlert,
  onIslandAlert: (a: IslandAlert) => void,
) {
  const body =
    alert.kind === "highCpu"
      ? `${alert.name} (PID ${alert.pid}) CPU 持续 ${alert.value.toFixed(0)}%`
      : `${alert.name} (PID ${alert.pid}) 父进程已退出，仍在后台运行`;
  const title =
    alert.kind === "highCpu" ? "gprocess：超高资源占用" : "gprocess：长时间孤儿进程";

  if (settings.notifyChannel !== "island") {
    sendNotification({ title, body });
  }
  if (settings.notifyChannel !== "toast") {
    onIslandAlert(alert);
  }
}

/**
 * 看门狗：检测超高资源占用与长时间孤儿进程，触发 Windows 系统通知。
 * 触发器在前端（快照数据在前端），按 pid 冷却防刷屏。
 */
export function useWatchdog(
  snapshot: ProcessSnapshot | null,
  settings: Settings,
  onIslandAlert: (a: IslandAlert) => void,
) {
  // pid -> 上次达到 CPU 阈值的快照时间（用于"连续两次"判定）
  const lastCpuHit = useRef<Map<number, number>>(new Map());
  // pid -> 上次通知时间
  const notified = useRef<Map<number, number>>(new Map());
  // 回调引用保持最新，避免纳入依赖导致重复判定
  const onIslandAlertRef = useRef(onIslandAlert);
  onIslandAlertRef.current = onIslandAlert;

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
          dispatchAlert(
            settings,
            {
              kind: "highCpu",
              pid: p.pid,
              name: p.name,
              value: p.cpuPercent,
            },
            onIslandAlertRef.current,
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
        dispatchAlert(
          settings,
          {
            kind: "longOrphan",
            pid: p.pid,
            name: p.name,
            value: (now - p.startTime) / 60_000,
          },
          onIslandAlertRef.current,
        );
        notified.current.set(p.pid, now);
      }
    }
  }, [
    snapshot,
    settings.notificationsEnabled,
    settings.notifyChannel,
    settings.highCpuThreshold,
    settings.longOrphanMin,
  ]);
}
