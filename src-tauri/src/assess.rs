//! 杀前评估：四级安全分级 + 子孙树构建 + 影响面汇总

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use sysinfo::ProcessesToUpdate;

use crate::kill::KillError;
use crate::snapshot::{
    attach_orphan, collect_ports, collect_processes, now_millis, OrphanInfo, PortBinding,
    ProcessInfo, SnapshotState,
};

/// 安全级别，声明顺序即严重程度（Safe < Caution < Danger < Forbidden）
#[derive(Serialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[serde(rename_all = "lowercase")]
pub enum AssessLevel {
    Safe,
    Caution,
    Danger,
    Forbidden,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillAssessment {
    pub pid: u32,
    pub level: AssessLevel,
    pub reasons: Vec<String>,
    pub notes: Vec<String>,
    pub children: Vec<ProcessInfo>,
    pub owned_ports: Vec<PortBinding>,
    pub orphan: OrphanInfo,
}

/// 结束后会导致系统不稳定的关键进程
const CRITICAL_NAMES: &[&str] = &[
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "winlogon.exe",
    "lsass.exe",
    "fontdrvhost.exe",
    "dwm.exe",
];

/// 系统共享宿主：结束会影响多个服务
const SHARED_HOSTS: &[&str] = &["svchost.exe"];

/// 高权限运行账户
const PRIVILEGED_USERS: &[&str] = &["system", "local service", "network service"];

/// 由 (pid, ppid) 列表构建父→子索引
pub fn build_children_map(procs: &[(u32, Option<u32>)]) -> HashMap<u32, Vec<u32>> {
    let mut map: HashMap<u32, Vec<u32>> = HashMap::new();
    for &(pid, ppid) in procs {
        if let Some(parent) = ppid {
            if parent != pid {
                map.entry(parent).or_default().push(pid);
            }
        }
    }
    map
}

/// 自底向上（叶子在前）返回 root 的全部子孙 PID，含环保护
pub fn descendants_post_order(children_map: &HashMap<u32, Vec<u32>>, root: u32) -> Vec<u32> {
    fn walk(
        map: &HashMap<u32, Vec<u32>>,
        pid: u32,
        visited: &mut HashSet<u32>,
        out: &mut Vec<u32>,
    ) {
        if let Some(children) = map.get(&pid) {
            for &child in children {
                if visited.insert(child) {
                    walk(map, child, visited, out);
                    out.push(child);
                }
            }
        }
    }
    let mut out = Vec::new();
    let mut visited = HashSet::from([root]);
    walk(children_map, root, &mut visited, &mut out);
    out
}

/// 四级安全分级（纯函数）：返回 (级别, 理由, 备注)
pub fn classify(
    target: &ProcessInfo,
    self_pid: u32,
    child_count: usize,
    listen_count: usize,
    now_ms: i64,
) -> (AssessLevel, Vec<String>, Vec<String>) {
    let mut level = AssessLevel::Safe;
    let mut reasons: Vec<String> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let name = target.name.to_lowercase();

    if target.pid == self_pid {
        return (
            AssessLevel::Forbidden,
            vec!["gprocess 自身，不能结束".into()],
            notes,
        );
    }
    if target.pid <= 4 || CRITICAL_NAMES.contains(&name.as_str()) {
        return (
            AssessLevel::Forbidden,
            vec!["系统关键进程，结束将导致系统不稳定或崩溃".into()],
            notes,
        );
    }

    match &target.user {
        Some(user) => {
            let u = user.to_lowercase();
            if PRIVILEGED_USERS.iter().any(|p| u.contains(p)) {
                level = level.max(AssessLevel::Danger);
                reasons.push(format!("以高权限账户 {user} 运行"));
            }
        }
        None => notes.push("运行账户未知（当前权限可能不足）".into()),
    }

    if SHARED_HOSTS.contains(&name.as_str()) {
        level = level.max(AssessLevel::Danger);
        reasons.push("系统共享宿主进程，结束可能影响多个系统服务".into());
    }

    if child_count > 0 {
        level = level.max(AssessLevel::Caution);
        reasons.push(format!("有 {child_count} 个子孙进程，结束可能影响它们"));
    }
    if listen_count > 0 {
        level = level.max(AssessLevel::Caution);
        reasons.push(format!("持有 {listen_count} 个 LISTEN 端口"));
    }
    if target.start_time > 0 && now_ms - target.start_time < 60_000 {
        level = level.max(AssessLevel::Caution);
        reasons.push("启动不足 1 分钟，可能刚被其他程序拉起".into());
    }

    if reasons.is_empty() {
        reasons.push("未发现风险因素".into());
    }
    (level, reasons, notes)
}

#[tauri::command]
pub fn assess_process(
    state: tauri::State<SnapshotState>,
    pid: u32,
    threshold_min: Option<u32>,
) -> Result<KillAssessment, KillError> {
    let now_ms = now_millis();
    let threshold_min = threshold_min.unwrap_or(30);

    let mut processes = {
        let mut sys = state.system.lock().expect("system lock poisoned");
        sys.refresh_processes(ProcessesToUpdate::All, true);
        collect_processes(&sys, &state.users)
    };

    let ports = collect_ports();
    let listen_pids: HashSet<u32> = ports
        .iter()
        .filter(|p| p.state.as_deref() == Some("Listen"))
        .map(|p| p.pid)
        .collect();
    attach_orphan(&mut processes, &listen_pids, now_ms, threshold_min);

    let target = processes
        .iter()
        .find(|p| p.pid == pid)
        .cloned()
        .ok_or(KillError::NotFound)?;

    let pairs: Vec<(u32, Option<u32>)> = processes.iter().map(|p| (p.pid, p.ppid)).collect();
    let children_map = build_children_map(&pairs);
    let by_pid: HashMap<u32, &ProcessInfo> = processes.iter().map(|p| (p.pid, p)).collect();
    let children: Vec<ProcessInfo> = descendants_post_order(&children_map, pid)
        .iter()
        .filter_map(|c| by_pid.get(c).map(|p| (*p).clone()))
        .collect();

    let owned_ports: Vec<PortBinding> = ports.into_iter().filter(|p| p.pid == pid).collect();
    let listen_count = owned_ports
        .iter()
        .filter(|p| p.state.as_deref() == Some("Listen"))
        .count();

    let (level, reasons, notes) = classify(
        &target,
        std::process::id(),
        children.len(),
        listen_count,
        now_ms,
    );

    Ok(KillAssessment {
        pid,
        level,
        reasons,
        notes,
        children,
        owned_ports,
        orphan: target.orphan,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::OrphanStatus;

    fn proc(pid: u32, ppid: Option<u32>, name: &str, user: Option<&str>) -> ProcessInfo {
        ProcessInfo {
            pid,
            ppid,
            name: name.into(),
            exe_path: None,
            cmdline: vec![],
            start_time: 1_000_000,
            cpu_percent: 0.0,
            memory_bytes: 0,
            user: user.map(Into::into),
            status: "Running".into(),
            orphan: OrphanInfo {
                status: OrphanStatus::None,
                pid_reused: false,
                heuristic_score: 0,
            },
        }
    }

    const NOW: i64 = 1_000_000 + 10 * 60_000; // 目标已运行 10 分钟

    #[test]
    fn classify_critical_process_forbidden() {
        let (level, reasons, _) = classify(&proc(100, None, "csrss.exe", Some("SYSTEM")), 999, 0, 0, NOW);
        assert_eq!(level, AssessLevel::Forbidden);
        assert!(reasons[0].contains("系统关键进程"));
    }

    #[test]
    fn classify_self_forbidden() {
        let (level, _, _) = classify(&proc(999, None, "gprocess.exe", None), 999, 0, 0, NOW);
        assert_eq!(level, AssessLevel::Forbidden);
    }

    #[test]
    fn classify_privileged_user_danger() {
        let (level, reasons, _) = classify(&proc(100, None, "node.exe", Some("NT AUTHORITY\\SYSTEM")), 999, 0, 0, NOW);
        assert_eq!(level, AssessLevel::Danger);
        assert!(reasons[0].contains("高权限账户"));
    }

    #[test]
    fn classify_shared_host_danger() {
        let (level, _, _) = classify(&proc(100, None, "svchost.exe", Some("USER")), 999, 0, 0, NOW);
        assert_eq!(level, AssessLevel::Danger);
    }

    #[test]
    fn classify_children_and_listen_caution() {
        let (level, reasons, _) = classify(&proc(100, None, "node.exe", Some("USER")), 999, 2, 1, NOW);
        assert_eq!(level, AssessLevel::Caution);
        assert_eq!(reasons.len(), 2);
    }

    #[test]
    fn classify_fresh_process_caution() {
        let mut p = proc(100, None, "node.exe", Some("USER"));
        p.start_time = NOW - 30_000; // 启动 30 秒
        let (level, _, _) = classify(&p, 999, 0, 0, NOW);
        assert_eq!(level, AssessLevel::Caution);
    }

    #[test]
    fn classify_plain_process_safe() {
        let (level, reasons, _) = classify(&proc(100, None, "node.exe", Some("USER")), 999, 0, 0, NOW);
        assert_eq!(level, AssessLevel::Safe);
        assert!(reasons[0].contains("未发现风险"));
    }

    #[test]
    fn children_map_and_post_order() {
        // 1 → 2 → 3；1 → 4
        let procs = [(1, None), (2, Some(1)), (3, Some(2)), (4, Some(1))];
        let map = build_children_map(&procs);
        let order = descendants_post_order(&map, 1);
        assert_eq!(order.len(), 3);
        // 叶子在前：3 必须早于 2
        let pos = |x: u32| order.iter().position(|&p| p == x).unwrap();
        assert!(pos(3) < pos(2));
    }

    #[test]
    fn post_order_cycle_safe() {
        // 构造环（PID 复用等异常场景）：1→2→1
        let procs = [(1, Some(2)), (2, Some(1))];
        let map = build_children_map(&procs);
        let order = descendants_post_order(&map, 1);
        assert_eq!(order, vec![2]);
    }
}
