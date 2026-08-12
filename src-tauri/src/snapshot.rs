//! 进程与端口快照采集（sysinfo + netstat2），含孤儿判定

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System, Users};

/// 后端共享状态：复用 System 以保留 CPU 采样基线；Users 仅在启动时加载一次。
pub struct SnapshotState {
    pub system: Mutex<System>,
    pub users: Users,
}

impl SnapshotState {
    pub fn new() -> Self {
        Self {
            system: Mutex::new(System::new()),
            users: Users::new_with_refreshed_list(),
        }
    }
}

pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSnapshot {
    pub processes: Vec<ProcessInfo>,
    pub ports: Vec<PortBinding>,
    pub captured_at: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub ppid: Option<u32>,
    pub name: String,
    pub exe_path: Option<String>,
    pub cmdline: Vec<String>,
    pub start_time: i64,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub user: Option<String>,
    pub status: String,
    pub orphan: OrphanInfo,
}

#[derive(Serialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrphanInfo {
    pub status: OrphanStatus,
    /// 父 PID 已被新进程复用（真正的父进程已退出）
    pub pid_reused: bool,
    /// 展示优先级：runtime 进程 +1，持有 LISTEN 端口 +1，运行超 30 分钟 +1
    pub heuristic_score: u8,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum OrphanStatus {
    None,
    Confirmed,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortBinding {
    pub protocol: Protocol,
    pub local_addr: String,
    pub local_port: u16,
    pub state: Option<String>,
    pub pid: u32,
}

#[derive(Serialize, Clone, Copy)]
pub enum Protocol {
    Tcp,
    Udp,
}

/// Agent 时代常见的被遗留 runtime 可执行体
const RUNTIME_NAMES: &[&str] = &[
    "node.exe",
    "python.exe",
    "pythonw.exe",
    "bun.exe",
    "deno.exe",
    "ruby.exe",
    "perl.exe",
];

/// 孤儿判定（纯函数，便于单测）：
/// 1. ppid 不在进程表 → 父进程已退出 → Confirmed
/// 2. ppid 存在但"父进程"启动时间晚于本进程 → 父 PID 被复用 → Confirmed + pid_reused
pub fn detect_orphan(
    pid: u32,
    ppid: Option<u32>,
    start_time: i64,
    start_by_pid: &HashMap<u32, i64>,
) -> (OrphanStatus, bool) {
    let Some(parent_pid) = ppid else {
        return (OrphanStatus::None, false);
    };
    if parent_pid == pid || parent_pid == 0 {
        return (OrphanStatus::None, false);
    }
    match start_by_pid.get(&parent_pid) {
        None => (OrphanStatus::Confirmed, false),
        Some(&parent_start) => {
            if start_time > 0 && parent_start > start_time {
                (OrphanStatus::Confirmed, true)
            } else {
                (OrphanStatus::None, false)
            }
        }
    }
}

/// 为所有进程填充孤儿判定与展示优先级
pub fn attach_orphan(
    processes: &mut [ProcessInfo],
    listen_pids: &HashSet<u32>,
    now_ms: i64,
    threshold_min: u32,
) {
    let threshold_ms = threshold_min as i64 * 60_000;
    let start_by_pid: HashMap<u32, i64> =
        processes.iter().map(|p| (p.pid, p.start_time)).collect();
    for p in processes.iter_mut() {
        let (status, pid_reused) = detect_orphan(p.pid, p.ppid, p.start_time, &start_by_pid);
        let mut score = 0u8;
        if status == OrphanStatus::Confirmed {
            if RUNTIME_NAMES.contains(&p.name.to_lowercase().as_str()) {
                score += 1;
            }
            if listen_pids.contains(&p.pid) {
                score += 1;
            }
            if p.start_time > 0 && now_ms - p.start_time > threshold_ms {
                score += 1;
            }
        }
        p.orphan = OrphanInfo {
            status,
            pid_reused,
            heuristic_score: score,
        };
    }
}

pub fn collect_processes(sys: &System, users: &Users) -> Vec<ProcessInfo> {
    sys.processes()
        .values()
        .map(|p| {
            let user = p
                .user_id()
                .and_then(|uid| users.get_user_by_id(uid))
                .map(|u| u.name().to_string());
            ProcessInfo {
                pid: p.pid().as_u32(),
                ppid: p.parent().map(|pid| pid.as_u32()),
                name: p.name().to_string_lossy().into_owned(),
                exe_path: p.exe().map(|e| e.to_string_lossy().into_owned()),
                cmdline: p
                    .cmd()
                    .iter()
                    .map(|s| s.to_string_lossy().into_owned())
                    .collect(),
                start_time: (p.start_time() * 1000) as i64,
                cpu_percent: p.cpu_usage(),
                memory_bytes: p.memory(),
                user,
                status: format!("{:?}", p.status()),
                orphan: OrphanInfo {
                    status: OrphanStatus::None,
                    pid_reused: false,
                    heuristic_score: 0,
                },
            }
        })
        .collect()
}

pub fn collect_ports() -> Vec<PortBinding> {
    use netstat2::{iterate_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};

    let af = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto = ProtocolFlags::TCP | ProtocolFlags::UDP;
    let mut out = Vec::new();

    let Ok(sockets) = iterate_sockets_info(af, proto) else {
        return out;
    };
    for item in sockets.flatten() {
        let Some(&pid) = item.associated_pids.first() else {
            continue;
        };
        let local_addr = item.local_addr().to_string();
        let local_port = item.local_port();
        match item.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => out.push(PortBinding {
                protocol: Protocol::Tcp,
                local_addr,
                local_port,
                state: Some(format!("{:?}", tcp.state)),
                pid,
            }),
            ProtocolSocketInfo::Udp(_) => out.push(PortBinding {
                protocol: Protocol::Udp,
                local_addr,
                local_port,
                state: None,
                pid,
            }),
        }
    }
    out
}

#[tauri::command]
pub fn snapshot(
    state: tauri::State<SnapshotState>,
    threshold_min: Option<u32>,
) -> ProcessSnapshot {
    let captured_at = now_millis();
    let threshold_min = threshold_min.unwrap_or(30);

    let mut processes = {
        let mut sys = state.system.lock().expect("system lock poisoned");
        // 两次采样取 CPU 使用率（sysinfo 需要基线差值）
        sys.refresh_processes(ProcessesToUpdate::All, true);
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_processes(ProcessesToUpdate::All, true);
        collect_processes(&sys, &state.users)
    };

    let ports = collect_ports();
    let listen_pids: HashSet<u32> = ports
        .iter()
        .filter(|p| p.state.as_deref() == Some("Listen"))
        .map(|p| p.pid)
        .collect();
    attach_orphan(&mut processes, &listen_pids, captured_at, threshold_min);

    ProcessSnapshot {
        processes,
        ports,
        captured_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start_map(entries: &[(u32, i64)]) -> HashMap<u32, i64> {
        entries.iter().cloned().collect()
    }

    #[test]
    fn orphan_when_parent_exited() {
        // 父进程 100 已退出（不在进程表）
        let map = start_map(&[(200, 5000)]);
        let (status, reused) = detect_orphan(200, Some(100), 5000, &map);
        assert_eq!(status, OrphanStatus::Confirmed);
        assert!(!reused);
    }

    #[test]
    fn orphan_when_parent_pid_reused() {
        // 父 PID 100 被新进程复用：新"父进程"启动时间晚于本进程
        let map = start_map(&[(100, 9000), (200, 5000)]);
        let (status, reused) = detect_orphan(200, Some(100), 5000, &map);
        assert_eq!(status, OrphanStatus::Confirmed);
        assert!(reused);
    }

    #[test]
    fn not_orphan_when_parent_alive() {
        let map = start_map(&[(100, 1000), (200, 5000)]);
        let (status, reused) = detect_orphan(200, Some(100), 5000, &map);
        assert_eq!(status, OrphanStatus::None);
        assert!(!reused);
    }

    #[test]
    fn not_orphan_without_parent() {
        let map = start_map(&[(200, 5000)]);
        assert_eq!(detect_orphan(200, None, 5000, &map).0, OrphanStatus::None);
        // 自引用与 ppid=0 保护
        assert_eq!(
            detect_orphan(200, Some(200), 5000, &map).0,
            OrphanStatus::None
        );
        assert_eq!(detect_orphan(200, Some(0), 5000, &map).0, OrphanStatus::None);
    }

    #[test]
    fn snapshot_fields_populated() {
        let state = SnapshotState::new();
        let mut sys = state.system.lock().unwrap();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let processes = collect_processes(&sys, &state.users);

        assert!(processes.len() > 10, "应采集到系统进程");
        assert!(processes.iter().all(|p| !p.name.is_empty()));
        // 个别系统进程（如 System Idle）start_time 可能为 0
        assert!(
            processes.iter().filter(|p| p.start_time > 0).count() > 10,
            "绝大多数进程应有启动时间"
        );
    }

    #[test]
    fn ports_collected_with_pid() {
        let ports = collect_ports();
        assert!(!ports.is_empty(), "应采集到端口绑定");
        assert!(ports.iter().all(|p| p.local_port > 0));
        assert!(ports.iter().all(|p| !p.local_addr.is_empty()));
        assert!(
            ports.iter().any(|p| p.state.as_deref() == Some("Listen")),
            "应存在 LISTEN 状态的 TCP 端口"
        );
    }

    #[test]
    fn snapshot_serializes_to_camel_case() {
        let snapshot = ProcessSnapshot {
            processes: vec![],
            ports: vec![PortBinding {
                protocol: Protocol::Tcp,
                local_addr: "0.0.0.0".into(),
                local_port: 8080,
                state: Some("Listen".into()),
                pid: 1234,
            }],
            captured_at: 1,
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(json.contains("\"localPort\":8080"));
        assert!(json.contains("\"capturedAt\":1"));
    }
}
