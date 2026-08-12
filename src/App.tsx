import { useCallback, useEffect, useMemo, useState } from "react";
import { KillDialog } from "@/components/KillDialog";
import { Sidebar } from "@/components/Sidebar";
import { Toasts, type ToastItem } from "@/components/Toasts";
import { TopBar } from "@/components/TopBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  assessProcess,
  isAdmin as fetchIsAdmin,
  isTauri,
  killErrorText,
  killProcess,
  killTree,
  restartAsAdmin,
} from "@/lib/api";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { useSnapshot } from "@/hooks/useSnapshot";
import { ensureNotificationPermission, useWatchdog } from "@/hooks/useWatchdog";
import { ProcessesPage } from "@/pages/ProcessesPage";
import { PortsPage } from "@/pages/PortsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import type {
  KillAssessment,
  KillError,
  KillMode,
  PageId,
  PortBinding,
  ProcessInfo,
} from "@/lib/types";

const SIDEBAR_KEY = "gpie-navigation-expanded";

interface KillTarget {
  process: ProcessInfo;
  mode: KillMode;
}

export default function App() {
  const [page, setPage] = useState<PageId>("processes");
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "1",
  );
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [isAdmin, setIsAdmin] = useState(true);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<KillTarget | null>(null);
  const [assessment, setAssessment] = useState<KillAssessment | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const { snapshot, refresh, refreshing } = useSnapshot(
    settings.refreshIntervalMs,
    settings.orphanThresholdMin,
  );

  // 设置持久化 + 主题应用（即时生效）
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // 系统通知：启动时申请权限，看门狗检测高占用 / 长时间孤儿
  useEffect(() => ensureNotificationPermission(), []);
  useWatchdog(snapshot, settings);

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );

  // 启动时检测管理员权限
  useEffect(() => {
    if (isTauri) fetchIsAdmin().then(setIsAdmin).catch(() => {});
  }, []);

  // 快照派生数据：进程/端口按 pid 关联，两页共享
  const byPid = useMemo(() => {
    const map = new Map<number, ProcessInfo>();
    snapshot?.processes.forEach((p) => map.set(p.pid, p));
    return map;
  }, [snapshot]);

  const portsByPid = useMemo(() => {
    const map = new Map<number, PortBinding[]>();
    snapshot?.ports.forEach((port) => {
      const list = map.get(port.pid) ?? [];
      list.push(port);
      map.set(port.pid, list);
    });
    return map;
  }, [snapshot]);

  const listenPids = useMemo(() => {
    const set = new Set<number>();
    snapshot?.ports.forEach((p) => {
      if (p.state === "Listen") set.add(p.pid);
    });
    return set;
  }, [snapshot]);

  // 打开确认 Dialog 时拉取目标进程的杀前评估
  useEffect(() => {
    setAssessment(null);
    if (!killTarget || !isTauri) return;
    let cancelled = false;
    assessProcess(killTarget.process.pid, settings.orphanThresholdMin)
      .then((a) => !cancelled && setAssessment(a))
      .catch(() => {
        /* 进程已退出时评估失败，Dialog 按未知级别展示 */
      });
    return () => {
      cancelled = true;
    };
  }, [killTarget, settings.orphanThresholdMin]);

  const pushToast = useCallback((kind: ToastItem["kind"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), kind, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleSidebar = () => {
    setExpanded((v) => {
      localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const viewProcess = (pid: number) => {
    setSelectedPid(pid);
    setPage("processes");
  };

  const toggleWatchPort = (port: number) => {
    setSettings((s) => ({
      ...s,
      watchedPorts: s.watchedPorts.includes(port)
        ? s.watchedPorts.filter((p) => p !== port)
        : [...s.watchedPorts, port].sort((a, b) => a - b),
    }));
  };

  const handleRestartAsAdmin = async () => {
    try {
      await restartAsAdmin();
      // 成功后当前进程会被新实例取代并退出
    } catch (e) {
      pushToast("error", String(e));
    }
  };

  const confirmKill = async (pid: number, mode: KillMode): Promise<boolean> => {
    const target = byPid.get(pid);
    try {
      if (mode === "tree") {
        const result = await killTree(pid);
        pushToast(
          "success",
          `进程树已结束：成功 ${result.succeeded.length} 个` +
            (result.failed.length > 0 ? `，失败 ${result.failed.length} 个` : ""),
        );
        result.failed.forEach((f) =>
          pushToast("error", `PID ${f.pid} 结束失败：${f.error}`),
        );
      } else {
        await killProcess(pid);
        pushToast("success", `已结束进程 ${target?.name ?? ""} (PID ${pid})`);
      }
      setKillTarget(null);
      if (selectedPid === pid) setSelectedPid(null);
      await refresh();
      return true;
    } catch (e) {
      pushToast("error", killErrorText(e as KillError));
      await refresh();
      return false;
    }
  };

  const orphanCount =
    snapshot?.processes.filter((p) => p.orphan.status === "confirmed").length ?? 0;
  const listenCount = snapshot?.ports.filter((p) => p.state === "Listen").length ?? 0;

  const pageTitle =
    page === "processes" ? "进程" : page === "ports" ? "端口" : "设置";
  const pageSummary =
    page === "processes" && snapshot
      ? `共 ${snapshot.processes.length} 个进程，疑似孤儿 ${orphanCount} 个`
      : page === "ports" && snapshot
        ? `${listenCount} 个 LISTEN / ${snapshot.ports.length} 条绑定`
        : undefined;

  return (
    <TooltipProvider>
      <div className="flex h-screen min-w-[1180px] overflow-hidden bg-background text-foreground">
        <Sidebar
          page={page}
          onNavigate={setPage}
          expanded={expanded}
          onToggle={toggleSidebar}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            title={pageTitle}
            summary={pageSummary}
            capturedAt={page === "settings" ? undefined : snapshot?.capturedAt}
            refreshing={refreshing}
            refreshIntervalMs={settings.refreshIntervalMs}
            isAdmin={isAdmin}
            onRefresh={refresh}
          />
          <main className="flex min-h-0 flex-1 flex-col">
            {page === "processes" ? (
              <ProcessesPage
                snapshot={snapshot}
                byPid={byPid}
                portsByPid={portsByPid}
                listenPids={listenPids}
                settings={settings}
                selectedPid={selectedPid}
                onSelect={setSelectedPid}
                onKill={(process, mode) => setKillTarget({ process, mode })}
                onGotoPorts={() => setPage("ports")}
              />
            ) : page === "ports" ? (
              <PortsPage
                snapshot={snapshot}
                byPid={byPid}
                watchedPorts={settings.watchedPorts}
                onViewProcess={viewProcess}
                onKill={(process) => setKillTarget({ process, mode: "single" })}
                onToggleWatch={toggleWatchPort}
              />
            ) : (
              <SettingsPage
                settings={settings}
                onChange={patchSettings}
                isAdmin={isAdmin}
                onRestartAsAdmin={handleRestartAsAdmin}
                onToast={pushToast}
              />
            )}
          </main>
        </div>

        <KillDialog
          process={killTarget?.process ?? null}
          mode={killTarget?.mode ?? "single"}
          ports={killTarget ? (portsByPid.get(killTarget.process.pid) ?? []) : []}
          assessment={assessment}
          onOpenChange={(open) => !open && setKillTarget(null)}
          onConfirm={confirmKill}
        />
        <Toasts items={toasts} onDismiss={dismissToast} />
      </div>
    </TooltipProvider>
  );
}
