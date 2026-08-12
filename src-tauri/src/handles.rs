//! 文件句柄占用查找（Windows Restart Manager API）
//!
//! 即安装程序（MSI）查文件占用的官方机制：注册文件路径，RmGetList 返回占用进程。
//! 已知限制：跨用户 / 高权限进程的占用可能查不到（表现为空结果而非报错）。

use serde::Serialize;
use sysinfo::{ProcessesToUpdate, Pid};
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{ERROR_MORE_DATA, ERROR_SUCCESS, WIN32_ERROR};
use windows::Win32::System::RestartManager::{
    RmEndSession, RmGetList, RmRegisterResources, RmStartSession, CCH_RM_SESSION_KEY,
    RM_PROCESS_INFO,
};

use crate::snapshot::SnapshotState;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HandleLocker {
    pub pid: u32,
    /// RM 返回的应用显示名（可能为空）
    pub app_name: String,
    pub exe_path: Option<String>,
    pub user: Option<String>,
    /// sysinfo 进程状态；进程已退出则为「已退出」
    pub status: String,
    /// 是 Windows 服务（strServiceShortName 非空）
    pub is_service: bool,
    /// 可被 Restart Manager 自动重启
    pub restartable: bool,
}

/// RM 会话守卫：作用域结束自动 RmEndSession
struct RmSession(u32);

impl RmSession {
    fn start() -> Result<Self, String> {
        let mut handle = 0u32;
        let mut key = [0u16; (CCH_RM_SESSION_KEY + 1) as usize];
        let err = unsafe { RmStartSession(&mut handle, None, PWSTR(key.as_mut_ptr())) };
        if err != ERROR_SUCCESS {
            return Err(format!("RmStartSession 失败（错误码 {}）", err.0));
        }
        Ok(Self(handle))
    }
}

impl Drop for RmSession {
    fn drop(&mut self) {
        unsafe {
            let _ = RmEndSession(self.0);
        }
    }
}

fn wide_z(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn from_wide_z(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn check(err: WIN32_ERROR, step: &str) -> Result<(), String> {
    if err == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(format!("{step} 失败（错误码 {}）", err.0))
    }
}

/// 纯 RM 查询：返回持有该文件句柄的进程（exe_path/user/status 未填充）
fn query_lockers(path: &str) -> Result<Vec<HandleLocker>, String> {
    let session = RmSession::start()?;

    let wide = wide_z(path);
    let files = [PCWSTR(wide.as_ptr())];
    check(
        unsafe { RmRegisterResources(session.0, Some(&files), None, None) },
        "RmRegisterResources",
    )?;

    // 两段式取列表：第一次拿 needed（缓冲不足返回 ERROR_MORE_DATA）
    let mut needed = 0u32;
    let mut count = 0u32;
    let mut reboot_reasons = 0u32;
    let err = unsafe {
        RmGetList(session.0, &mut needed, &mut count, None, &mut reboot_reasons)
    };
    if err != ERROR_SUCCESS && err != ERROR_MORE_DATA {
        return Err(format!("RmGetList 失败（错误码 {}）", err.0));
    }
    if needed == 0 {
        return Ok(vec![]);
    }

    let mut infos = vec![RM_PROCESS_INFO::default(); needed as usize];
    count = needed;
    check(
        unsafe {
            RmGetList(
                session.0,
                &mut needed,
                &mut count,
                Some(infos.as_mut_ptr()),
                &mut reboot_reasons,
            )
        },
        "RmGetList",
    )?;
    infos.truncate(count as usize);

    Ok(infos
        .iter()
        .map(|info| {
            let service = from_wide_z(&info.strServiceShortName);
            HandleLocker {
                pid: info.Process.dwProcessId,
                app_name: from_wide_z(&info.strAppName),
                exe_path: None,
                user: None,
                status: String::new(),
                is_service: !service.is_empty(),
                restartable: info.bRestartable.as_bool(),
            }
        })
        .collect())
}

/// 用 sysinfo 补充 exe_path / user / status（RM 只给显示名）
fn enrich(state: &SnapshotState, lockers: &mut [HandleLocker]) {
    if lockers.is_empty() {
        return;
    }
    let pids: Vec<Pid> = lockers.iter().map(|l| Pid::from_u32(l.pid)).collect();
    let mut sys = state.system.lock().expect("system lock poisoned");
    sys.refresh_processes(ProcessesToUpdate::Some(&pids), true);
    for l in lockers.iter_mut() {
        match sys.process(Pid::from_u32(l.pid)) {
            Some(p) => {
                l.exe_path = p.exe().map(|e| e.to_string_lossy().into_owned());
                l.user = p
                    .user_id()
                    .and_then(|uid| state.users.get_user_by_id(uid))
                    .map(|u| u.name().to_string());
                l.status = format!("{:?}", p.status());
            }
            None => l.status = "已退出".into(),
        }
    }
}

#[tauri::command]
pub fn find_file_lockers(
    state: tauri::State<SnapshotState>,
    path: String,
) -> Result<Vec<HandleLocker>, String> {
    let path = path.trim().trim_matches('"').to_string();
    if path.is_empty() {
        return Err("请输入文件路径".into());
    }
    let mut lockers = query_lockers(&path)?;
    enrich(&state, &mut lockers);
    Ok(lockers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_self_holding_open_file() {
        // 本进程持有临时文件句柄 → RM 必须查出来（确定性测试）
        let path = std::env::temp_dir().join(format!("gprocess_rm_test_{}.tmp", std::process::id()));
        let file = std::fs::File::create(&path).unwrap();
        let lockers = query_lockers(&path.to_string_lossy()).unwrap();
        assert!(
            lockers.iter().any(|l| l.pid == std::process::id()),
            "应查出本进程持有句柄，实际：{lockers:?}"
        );
        drop(file);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn empty_when_nobody_holds_file() {
        // 创建后立即关闭：无人持有 → 空结果
        let path = std::env::temp_dir().join(format!("gprocess_rm_idle_{}.tmp", std::process::id()));
        std::fs::File::create(&path).unwrap();
        let lockers = query_lockers(&path.to_string_lossy()).unwrap();
        assert!(lockers.is_empty(), "无人持有应为空，实际：{lockers:?}");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn locker_serializes_to_camel_case() {
        let locker = HandleLocker {
            pid: 1,
            app_name: "app".into(),
            exe_path: Some("C:\\a.exe".into()),
            user: Some("u".into()),
            status: "Running".into(),
            is_service: false,
            restartable: true,
        };
        let json = serde_json::to_string(&locker).unwrap();
        assert!(json.contains("\"appName\":\"app\""));
        assert!(json.contains("\"exePath\":\"C:\\\\a.exe\""));
        assert!(json.contains("\"isService\":false"));
        assert!(json.contains("\"restartable\":true"));
    }
}
