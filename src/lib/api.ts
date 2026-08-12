import { invoke } from "@tauri-apps/api/core";
import type {
  KillAssessment,
  KillError,
  KillTreeResult,
  ProcessSnapshot,
} from "./types";

/** 浏览器预览（无 Tauri 后端）时降级为空态展示 */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function fetchSnapshot(
  thresholdMin?: number,
): Promise<ProcessSnapshot> {
  return invoke<ProcessSnapshot>("snapshot", { thresholdMin });
}

export async function assessProcess(
  pid: number,
  thresholdMin?: number,
): Promise<KillAssessment> {
  return invoke<KillAssessment>("assess_process", { pid, thresholdMin });
}

export async function killProcess(pid: number): Promise<void> {
  try {
    await invoke("kill_process", { pid });
  } catch (e) {
    throw normalizeKillError(e);
  }
}

export async function killTree(pid: number): Promise<KillTreeResult> {
  try {
    return await invoke<KillTreeResult>("kill_tree", { pid });
  } catch (e) {
    throw normalizeKillError(e);
  }
}

export async function isAdmin(): Promise<boolean> {
  return invoke<boolean>("is_admin");
}

export async function restartAsAdmin(): Promise<void> {
  return invoke("restart_as_admin");
}

function normalizeKillError(e: unknown): KillError {
  if (e && typeof e === "object" && "kind" in e) {
    const err = e as { kind: string; message?: string };
    return {
      kind: err.kind === "NotFound" ? "NotFound" : "Failed",
      message: err.message,
    };
  }
  return { kind: "Failed", message: String(e) };
}

export function killErrorText(err: KillError): string {
  if (err.kind === "NotFound") return "进程已退出，无需操作";
  return err.message ?? "结束进程失败（可能权限不足，需要管理员运行）";
}
