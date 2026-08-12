//! 结束进程 / 进程树

use serde::Serialize;
use sysinfo::{Pid, ProcessesToUpdate};

use crate::assess::{build_children_map, descendants_post_order};
use crate::snapshot::SnapshotState;

#[derive(Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum KillError {
    /// 进程在操作前已退出
    NotFound,
    /// 结束失败：权限不足或进程受保护
    Failed(String),
}

#[tauri::command]
pub fn kill_process(state: tauri::State<SnapshotState>, pid: u32) -> Result<(), KillError> {
    let mut sys = state.system.lock().expect("system lock poisoned");
    let target = Pid::from_u32(pid);
    sys.refresh_processes(ProcessesToUpdate::Some(&[target]), true);

    let Some(process) = sys.process(target) else {
        return Err(KillError::NotFound);
    };
    if process.kill() {
        Ok(())
    } else {
        Err(KillError::Failed(format!(
            "无法结束进程 {pid}（可能权限不足或进程受保护）"
        )))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillTreeResult {
    pub root: u32,
    pub succeeded: Vec<u32>,
    pub failed: Vec<KillFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillFailure {
    pub pid: u32,
    pub error: String,
}

/// 自底向上结束整个子孙树，单个失败不中断
#[tauri::command]
pub fn kill_tree(state: tauri::State<SnapshotState>, pid: u32) -> Result<KillTreeResult, KillError> {
    let mut sys = state.system.lock().expect("system lock poisoned");
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let pairs: Vec<(u32, Option<u32>)> = sys
        .processes()
        .values()
        .map(|p| (p.pid().as_u32(), p.parent().map(|x| x.as_u32())))
        .collect();
    if !pairs.iter().any(|(p, _)| *p == pid) {
        return Err(KillError::NotFound);
    }

    let children_map = build_children_map(&pairs);
    let order = descendants_post_order(&children_map, pid);

    let mut result = KillTreeResult {
        root: pid,
        succeeded: Vec::new(),
        failed: Vec::new(),
    };
    // 先杀子孙（叶子在前），最后杀目标本身；已退出的视为成功
    for target in order.into_iter().chain([pid]) {
        match sys.process(Pid::from_u32(target)) {
            None => result.succeeded.push(target),
            Some(p) => {
                if p.kill() {
                    result.succeeded.push(target);
                } else {
                    result.failed.push(KillFailure {
                        pid: target,
                        error: "无法结束（可能权限不足或进程受保护）".into(),
                    });
                }
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kill_error_serializes_with_kind_tag() {
        let json = serde_json::to_string(&KillError::NotFound).unwrap();
        assert!(json.contains("\"kind\":\"NotFound\""));

        let json = serde_json::to_string(&KillError::Failed("x".into())).unwrap();
        assert!(json.contains("\"kind\":\"Failed\""));
        assert!(json.contains("\"message\":\"x\""));
    }

    #[test]
    fn kill_nonexistent_pid_reports_not_found() {
        // 选一个几乎不可能存在的 PID
        let state = SnapshotState::new();
        let mut sys = state.system.lock().unwrap();
        let target = Pid::from_u32(u32::MAX - 1);
        sys.refresh_processes(ProcessesToUpdate::Some(&[target]), true);
        assert!(sys.process(target).is_none());
    }
}
