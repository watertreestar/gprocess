//! 进程与端口快照采集（sysinfo + netstat2），含孤儿判定

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System, Users};

/// 后端共享状态：复用 System 以保留 CPU 采样基线；Users 仅在启动时加载一次。
/// parent_history 跨快照记录每个进程最后观测到的父进程名（父死后仍可用于孤儿判定）。
/// 服务 PID / 启动项路径为 30s TTL 缓存，避免每次快照枚举 SCM 与注册表。
pub struct SnapshotState {
    pub system: Mutex<System>,
    pub users: Users,
    pub parent_history: Mutex<HashMap<u32, ParentRef>>,
    pub service_pids: Mutex<(std::time::Instant, HashSet<u32>)>,
    pub autostart_paths: Mutex<(std::time::Instant, HashSet<String>)>,
    pub windir: String,
}

/// 子进程 pid → 最后观测到的父进程名；child_start 用于 PID 复用防护
#[derive(Clone, Debug)]
pub struct ParentRef {
    pub child_start: i64,
    pub parent_name: String,
}

impl SnapshotState {
    pub fn new() -> Self {
        Self {
            system: Mutex::new(System::new()),
            users: Users::new_with_refreshed_list(),
            parent_history: Mutex::new(HashMap::new()),
            service_pids: Mutex::new((
                std::time::Instant::now() - std::time::Duration::from_secs(60),
                HashSet::new(),
            )),
            autostart_paths: Mutex::new((
                std::time::Instant::now() - std::time::Duration::from_secs(60),
                HashSet::new(),
            )),
            windir: std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into()),
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
    /// 展示优先级：runtime 进程 +1，持有 LISTEN 端口 +1，运行超阈值 +1
    pub heuristic_score: u8,
    /// 最后观测到的父进程名（父存活时实时取，父死后取历史记录；面板启动前已孤儿则为 None）
    pub parent_name: Option<String>,
    /// expected 的来源分类
    pub origin: Option<ExpectedOrigin>,
    /// 非本机 ESTABLISHED 连接数（仍被使用的活跃度信号，降权不降级）
    pub external_connections: u32,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ExpectedOrigin {
    /// exePath 在 %WINDIR% 下
    System,
    /// SCM 注册服务
    Service,
    /// Run 键开机启动项
    Autostart,
    /// 已知系统启动器拉起
    Launcher,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum OrphanStatus {
    None,
    /// 父已退出，但父身份是已知系统启动器 → 正常守护，不算孤儿
    Expected,
    Confirmed,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortBinding {
    pub protocol: Protocol,
    pub local_addr: String,
    pub local_port: u16,
    /// 远端地址（仅 TCP；UDP 为 None）
    pub remote_addr: Option<String>,
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

/// 已知系统启动器：它们拉起的进程在父退出后属正常守护，不算孤儿。
/// 刻意不含 cmd/powershell/WindowsTerminal/code —— 终端与编辑器遗留正是核心场景。
const KNOWN_LAUNCHERS: &[&str] = &[
    "explorer.exe",
    "svchost.exe",
    "services.exe",
    "wininit.exe",
    "winlogon.exe",
    "taskhostw.exe",
    "sihost.exe",
    "userinit.exe",
];

/// 刷新父进程身份记忆：清理已退出/被复用的子 pid，记录父仍存活的父子关系
pub fn refresh_parent_history(history: &mut HashMap<u32, ParentRef>, processes: &[ProcessInfo]) {
    let start_by_pid: HashMap<u32, i64> = processes.iter().map(|p| (p.pid, p.start_time)).collect();
    let name_by_pid: HashMap<u32, &str> = processes.iter().map(|p| (p.pid, p.name.as_str())).collect();

    // 清理：子进程已退出，或 start_time 变化（PID 被新进程复用）
    history.retain(|pid, r| start_by_pid.get(pid) == Some(&r.child_start));

    // 记录：父仍存活的父子关系
    for p in processes {
        let Some(ppid) = p.ppid else { continue };
        let Some(&parent_name) = name_by_pid.get(&ppid) else {
            continue;
        };
        match history.get(&p.pid) {
            Some(r) if r.child_start == p.start_time => {}
            _ => {
                history.insert(
                    p.pid,
                    ParentRef {
                        child_start: p.start_time,
                        parent_name: parent_name.to_string(),
                    },
                );
            }
        }
    }
}

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

/// 孤儿判定的上下文数据（来源信号 + 活跃度 + 阈值）
pub struct OrphanContext {
    pub listen_pids: HashSet<u32>,
    pub service_pids: HashSet<u32>,
    pub autostart_paths: HashSet<String>,
    /// pid → 非本机 ESTABLISHED 连接数
    pub external_established: HashMap<u32, u32>,
    pub now_ms: i64,
    pub threshold_min: u32,
    pub windir: String,
}

fn is_loopback_or_unspecified(addr: &str) -> bool {
    addr.starts_with("127.")
        || addr.starts_with("::1")
        || addr.starts_with("0.0.0.0")
        || addr.starts_with("::")
        || addr.starts_with("[::1]")
}

/// 由端口数据 + 缓存的来源信号构建判定上下文（服务/启动项缓存 30s TTL）
pub fn build_orphan_context(
    state: &SnapshotState,
    ports: &[PortBinding],
    now_ms: i64,
    threshold_min: u32,
) -> OrphanContext {
    const TTL: std::time::Duration = std::time::Duration::from_secs(30);

    let service_pids = {
        let mut cache = state.service_pids.lock().expect("service cache lock poisoned");
        if cache.0.elapsed() > TTL {
            cache.0 = std::time::Instant::now();
            cache.1 = crate::origin::collect_service_pids();
        }
        cache.1.clone()
    };
    let autostart_paths = {
        let mut cache = state
            .autostart_paths
            .lock()
            .expect("autostart cache lock poisoned");
        if cache.0.elapsed() > TTL {
            cache.0 = std::time::Instant::now();
            cache.1 = crate::origin::collect_autostart_paths();
        }
        cache.1.clone()
    };

    let mut listen_pids = HashSet::new();
    let mut external_established: HashMap<u32, u32> = HashMap::new();
    for port in ports {
        if port.state.as_deref() == Some("Listen") {
            listen_pids.insert(port.pid);
        }
        if port.state.as_deref() == Some("Established") {
            if let Some(remote) = &port.remote_addr {
                if !is_loopback_or_unspecified(remote) {
                    *external_established.entry(port.pid).or_insert(0) += 1;
                }
            }
        }
    }

    OrphanContext {
        listen_pids,
        service_pids,
        autostart_paths,
        external_established,
        now_ms,
        threshold_min,
        windir: state.windir.clone(),
    }
}

/// 为所有进程填充孤儿判定、父进程身份与展示优先级。
/// 判定优先级：豁免 > 系统路径 > SCM 服务 > 启动项 > 启动器 > confirmed
pub fn attach_orphan(
    processes: &mut [ProcessInfo],
    ctx: &OrphanContext,
    parent_history: &HashMap<u32, ParentRef>,
    excludes: &HashSet<String>,
) {
    let threshold_ms = ctx.threshold_min as i64 * 60_000;
    let start_by_pid: HashMap<u32, i64> =
        processes.iter().map(|p| (p.pid, p.start_time)).collect();
    let name_by_pid: HashMap<u32, String> =
        processes.iter().map(|p| (p.pid, p.name.clone())).collect();
    for p in processes.iter_mut() {
        // 父身份：父存活实时取；父死了查历史记忆
        let parent_name = p
            .ppid
            .and_then(|ppid| name_by_pid.get(&ppid).cloned())
            .or_else(|| {
                parent_history
                    .get(&p.pid)
                    .filter(|r| r.child_start == p.start_time)
                    .map(|r| r.parent_name.clone())
            });
        let external_connections = ctx.external_established.get(&p.pid).copied().unwrap_or(0);

        let (mut status, pid_reused) = detect_orphan(p.pid, p.ppid, p.start_time, &start_by_pid);
        let mut origin = None;
        let mut score = 0u8;
        if status == OrphanStatus::Confirmed {
            let exe_norm = p.exe_path.as_deref().map(crate::origin::normalize_path);
            if crate::origin::is_system_path(p.exe_path.as_deref(), &ctx.windir) {
                status = OrphanStatus::Expected;
                origin = Some(ExpectedOrigin::System);
            } else if ctx.service_pids.contains(&p.pid) {
                status = OrphanStatus::Expected;
                origin = Some(ExpectedOrigin::Service);
            } else if exe_norm
                .as_deref()
                .map(|n| ctx.autostart_paths.contains(n))
                .unwrap_or(false)
            {
                status = OrphanStatus::Expected;
                origin = Some(ExpectedOrigin::Autostart);
            } else if parent_name
                .as_deref()
                .map(|n| KNOWN_LAUNCHERS.contains(&n.to_lowercase().as_str()))
                .unwrap_or(false)
            {
                status = OrphanStatus::Expected;
                origin = Some(ExpectedOrigin::Launcher);
            } else {
                if RUNTIME_NAMES.contains(&p.name.to_lowercase().as_str()) {
                    score += 1;
                }
                if ctx.listen_pids.contains(&p.pid) {
                    score += 1;
                }
                if p.start_time > 0 && ctx.now_ms - p.start_time > threshold_ms {
                    score += 1;
                }
            }
        }
        // 用户豁免名单覆盖一切判定（exe 名小写精确匹配）
        if excludes.contains(&p.name.to_lowercase()) {
            status = OrphanStatus::None;
            origin = None;
            score = 0;
        }
        p.orphan = OrphanInfo {
            status,
            pid_reused,
            heuristic_score: score,
            parent_name,
            origin,
            external_connections,
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
                    parent_name: None,
                    origin: None,
                    external_connections: 0,
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
                remote_addr: Some(tcp.remote_addr.to_string()),
                state: Some(format!("{:?}", tcp.state)),
                pid,
            }),
            ProtocolSocketInfo::Udp(_) => out.push(PortBinding {
                protocol: Protocol::Udp,
                local_addr,
                local_port,
                remote_addr: None,
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
    excludes: Option<Vec<String>>,
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
    let exclude_set: HashSet<String> = excludes
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.to_lowercase())
        .collect();
    let ctx = build_orphan_context(&state, &ports, captured_at, threshold_min);
    {
        let mut history = state.parent_history.lock().expect("history lock poisoned");
        refresh_parent_history(&mut history, &processes);
        attach_orphan(&mut processes, &ctx, &history, &exclude_set);
    }

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
                remote_addr: None,
                state: Some("Listen".into()),
                pid: 1234,
            }],
            captured_at: 1,
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(json.contains("\"localPort\":8080"));
        assert!(json.contains("\"capturedAt\":1"));
    }

    fn fake_proc(pid: u32, ppid: Option<u32>, name: &str, start: i64) -> ProcessInfo {
        ProcessInfo {
            pid,
            ppid,
            name: name.into(),
            exe_path: None,
            cmdline: vec![],
            start_time: start,
            cpu_percent: 0.0,
            memory_bytes: 0,
            user: None,
            status: "Running".into(),
            orphan: OrphanInfo {
                status: OrphanStatus::None,
                pid_reused: false,
                heuristic_score: 0,
                parent_name: None,
                origin: None,
                external_connections: 0,
            },
        }
    }

    fn empty_ctx() -> OrphanContext {
        OrphanContext {
            listen_pids: HashSet::new(),
            service_pids: HashSet::new(),
            autostart_paths: HashSet::new(),
            external_established: HashMap::new(),
            now_ms: 1_000_000,
            threshold_min: 30,
            windir: r"C:\Windows".into(),
        }
    }

    fn attach(procs: &mut [ProcessInfo], history: &HashMap<u32, ParentRef>, excludes: &[&str]) {
        let ctx = empty_ctx();
        let exclude_set: HashSet<String> = excludes.iter().map(|s| s.to_lowercase()).collect();
        attach_orphan(procs, &ctx, history, &exclude_set);
    }

    #[test]
    fn launcher_parent_downgrades_to_expected() {
        // 父（explorer.exe）已退出：历史记忆中有父身份 → expected
        let mut procs = vec![fake_proc(200, Some(100), "app.exe", 5000)];
        let mut history = HashMap::new();
        history.insert(
            200,
            ParentRef {
                child_start: 5000,
                parent_name: "explorer.exe".into(),
            },
        );
        attach(&mut procs, &history, &[]);
        assert_eq!(procs[0].orphan.status, OrphanStatus::Expected);
        assert_eq!(procs[0].orphan.parent_name.as_deref(), Some("explorer.exe"));
        assert_eq!(procs[0].orphan.heuristic_score, 0);
    }

    #[test]
    fn shell_parent_stays_confirmed_with_parent_name() {
        // 父（cmd.exe）已退出：终端遗留正是要抓的场景 → confirmed
        let mut procs = vec![fake_proc(200, Some(100), "node.exe", 5000)];
        let mut history = HashMap::new();
        history.insert(
            200,
            ParentRef {
                child_start: 5000,
                parent_name: "cmd.exe".into(),
            },
        );
        attach(&mut procs, &history, &[]);
        assert_eq!(procs[0].orphan.status, OrphanStatus::Confirmed);
        assert_eq!(procs[0].orphan.parent_name.as_deref(), Some("cmd.exe"));
        assert!(procs[0].orphan.heuristic_score >= 1); // runtime +1
    }

    #[test]
    fn unknown_parent_stays_confirmed() {
        // 面板启动前已孤儿：无历史记录 → confirmed 且父身份未知
        let mut procs = vec![fake_proc(200, Some(100), "node.exe", 5000)];
        attach(&mut procs, &HashMap::new(), &[]);
        assert_eq!(procs[0].orphan.status, OrphanStatus::Confirmed);
        assert_eq!(procs[0].orphan.parent_name, None);
    }

    #[test]
    fn exclude_overrides_any_status() {
        // 豁免名单覆盖一切判定，即使父是终端
        let mut procs = vec![fake_proc(200, Some(100), "node.exe", 5000)];
        let mut history = HashMap::new();
        history.insert(
            200,
            ParentRef {
                child_start: 5000,
                parent_name: "cmd.exe".into(),
            },
        );
        attach(&mut procs, &history, &["node.exe"]);
        assert_eq!(procs[0].orphan.status, OrphanStatus::None);
        assert_eq!(procs[0].orphan.heuristic_score, 0);
        // 豁免不区分大小写
        let mut procs2 = vec![fake_proc(200, Some(100), "Node.EXE", 5000)];
        attach(&mut procs2, &history, &["node.exe"]);
        assert_eq!(procs2[0].orphan.status, OrphanStatus::None);
    }

    #[test]
    fn parent_history_records_and_cleans() {
        let mut history = HashMap::new();
        // 父 100（cmd.exe）存活时记录
        let procs = vec![
            fake_proc(100, None, "cmd.exe", 1000),
            fake_proc(200, Some(100), "node.exe", 5000),
        ];
        refresh_parent_history(&mut history, &procs);
        assert_eq!(
            history.get(&200).map(|r| r.parent_name.as_str()),
            Some("cmd.exe")
        );
        // 父退出后：记录保留（供孤儿判定）
        let procs_after = vec![fake_proc(200, Some(100), "node.exe", 5000)];
        refresh_parent_history(&mut history, &procs_after);
        assert_eq!(
            history.get(&200).map(|r| r.parent_name.as_str()),
            Some("cmd.exe")
        );
        // 子 pid 被复用（start_time 变化）：记录清除
        let procs_reused = vec![fake_proc(200, Some(300), "other.exe", 9999)];
        refresh_parent_history(&mut history, &procs_reused);
        assert!(history.get(&200).is_none());
        // 子退出：记录清除
        refresh_parent_history(&mut history, &[]);
        assert!(history.is_empty());
    }

    #[test]
    fn system_path_downgrades_to_expected_system() {
        let mut procs = vec![{
            let mut p = fake_proc(200, Some(100), "RuntimeBroker.exe", 5000);
            p.exe_path = Some(r"C:\Windows\System32\RuntimeBroker.exe".into());
            p
        }];
        attach(&mut procs, &HashMap::new(), &[]);
        assert_eq!(procs[0].orphan.status, OrphanStatus::Expected);
        assert_eq!(procs[0].orphan.origin, Some(ExpectedOrigin::System));
    }

    #[test]
    fn service_pid_downgrades_to_expected_service() {
        let mut procs = vec![fake_proc(200, Some(100), "spoolsv.exe", 5000)];
        let mut ctx = empty_ctx();
        ctx.service_pids.insert(200);
        attach_orphan(procs.as_mut_slice(), &ctx, &HashMap::new(), &HashSet::new());
        assert_eq!(procs[0].orphan.status, OrphanStatus::Expected);
        assert_eq!(procs[0].orphan.origin, Some(ExpectedOrigin::Service));
    }

    #[test]
    fn autostart_path_downgrades_to_expected_autostart() {
        let mut procs = vec![{
            let mut p = fake_proc(200, Some(100), "OneDrive.exe", 5000);
            p.exe_path = Some(r"C:\Users\dev\AppData\Local\Microsoft\OneDrive\OneDrive.exe".into());
            p
        }];
        let mut ctx = empty_ctx();
        ctx.autostart_paths.insert(
            r"c:\users\dev\appdata\local\microsoft\onedrive\onedrive.exe".into(),
        );
        attach_orphan(procs.as_mut_slice(), &ctx, &HashMap::new(), &HashSet::new());
        assert_eq!(procs[0].orphan.status, OrphanStatus::Expected);
        assert_eq!(procs[0].orphan.origin, Some(ExpectedOrigin::Autostart));
    }

    #[test]
    fn external_connections_counted_but_not_downgraded() {
        // 活跃度降权不降级：有外部连接仍保持 confirmed
        let mut procs = vec![fake_proc(200, Some(100), "node.exe", 5000)];
        let mut ctx = empty_ctx();
        ctx.external_established.insert(200, 3);
        attach_orphan(procs.as_mut_slice(), &ctx, &HashMap::new(), &HashSet::new());
        assert_eq!(procs[0].orphan.status, OrphanStatus::Confirmed);
        assert_eq!(procs[0].orphan.external_connections, 3);
    }

    #[test]
    fn origin_priority_excludes_first() {
        // 豁免优先于一切来源信号
        let mut procs = vec![{
            let mut p = fake_proc(200, Some(100), "node.exe", 5000);
            p.exe_path = Some(r"C:\Windows\System32\node.exe".into());
            p
        }];
        attach(&mut procs, &HashMap::new(), &["node.exe"]);
        assert_eq!(procs[0].orphan.status, OrphanStatus::None);
        assert_eq!(procs[0].orphan.origin, None);
    }
}
