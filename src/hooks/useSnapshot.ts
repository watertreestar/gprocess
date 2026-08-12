import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSnapshot, isTauri } from "@/lib/api";
import type { ProcessSnapshot } from "@/lib/types";

/**
 * 手动刷新 + 可配置间隔轮询：
 * - intervalMs 为 0 时仅手动刷新
 * - 页面不可见时暂停，恢复可见时立即补一次
 */
export function useSnapshot(
  intervalMs: number,
  orphanThresholdMin: number,
  orphanExcludes: string[],
) {
  const [snapshot, setSnapshot] = useState<ProcessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  // 豁免名单内容变化才触发重取（避免数组引用抖动）
  const excludesKey = orphanExcludes.join(",");

  const refresh = useCallback(async () => {
    if (!isTauri || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setSnapshot(await fetchSnapshot(orphanThresholdMin, orphanExcludes));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orphanThresholdMin, excludesKey]);

  useEffect(() => {
    if (!isTauri) return;
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer =
      intervalMs > 0
        ? setInterval(() => {
            if (document.visibilityState === "visible") refresh();
          }, intervalMs)
        : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { snapshot, error, refresh, refreshing };
}
