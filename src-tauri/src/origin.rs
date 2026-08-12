//! 孤儿来源信号：SCM 服务、Run 键启动项、系统路径
//! 所有采集失败一律返回空集（视为未命中，保持 confirmed），不阻断快照

use std::collections::HashSet;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, REG_EXPAND_SZ, REG_SZ, RegCloseKey,
    RegEnumValueW, RegOpenKeyExW,
};
use windows::Win32::System::Services::{
    CloseServiceHandle, ENUM_SERVICE_STATUS_PROCESSW, EnumServicesStatusExW, OpenSCManagerW,
    SC_ENUM_PROCESS_INFO, SC_MANAGER_ENUMERATE_SERVICE, SERVICE_STATE_ALL, SERVICE_WIN32,
};

/// 规范化路径用于比较：小写 + 统一反斜杠
pub fn normalize_path(p: &str) -> String {
    p.trim().replace('/', "\\").to_lowercase()
}

/// exePath 是否位于 %WINDIR% 下（系统组件）
pub fn is_system_path(exe_path: Option<&str>, windir: &str) -> bool {
    let Some(p) = exe_path else { return false };
    let p = normalize_path(p);
    let windir = normalize_path(windir);
    p.starts_with(&format!("{windir}\\"))
}

/// 展开 %VAR% 环境变量（未知变量保留原文）
pub fn expand_env(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) if end > 0 => {
                let var = &after[..end];
                match std::env::var(var) {
                    Ok(v) => out.push_str(&v),
                    Err(_) => {
                        out.push('%');
                        out.push_str(var);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            _ => {
                out.push_str(&rest[start..]);
                return out;
            }
        }
    }
    out.push_str(rest);
    out
}

/// 从启动项命令行提取 exe 路径：引号包裹取引号内，否则截到 .exe
pub fn extract_exe_path(cmdline: &str) -> Option<String> {
    let s = expand_env(cmdline.trim());
    let s = s.trim_start();
    if let Some(stripped) = s.strip_prefix('"') {
        let end = stripped.find('"')?;
        let path = &stripped[..end];
        return path
            .to_lowercase()
            .ends_with(".exe")
            .then(|| path.to_string());
    }
    let idx = s.to_lowercase().find(".exe")?;
    Some(s[..idx + 4].to_string())
}

/// 枚举 SCM 服务 → 宿主 PID 集合
pub fn collect_service_pids() -> HashSet<u32> {
    let mut out = HashSet::new();
    unsafe {
        let Ok(scm) = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_ENUMERATE_SERVICE)
        else {
            return out;
        };

        // 第一次调用取所需缓冲区大小
        let mut needed = 0u32;
        let mut returned = 0u32;
        let mut resume = 0u32;
        let _ = EnumServicesStatusExW(
            scm,
            SC_ENUM_PROCESS_INFO,
            SERVICE_WIN32,
            SERVICE_STATE_ALL,
            None,
            &mut needed,
            &mut returned,
            Some(&mut resume),
            PCWSTR::null(),
        );
        if needed > 0 {
            let mut buf = vec![0u8; needed as usize];
            // ERROR_MORE_DATA 时返回的条目仍有效，按 resume handle 翻页
            loop {
                returned = 0;
                let mut more_needed = 0u32;
                let r = EnumServicesStatusExW(
                    scm,
                    SC_ENUM_PROCESS_INFO,
                    SERVICE_WIN32,
                    SERVICE_STATE_ALL,
                    Some(buf.as_mut_slice()),
                    &mut more_needed,
                    &mut returned,
                    Some(&mut resume),
                    PCWSTR::null(),
                );
                let entries = std::slice::from_raw_parts(
                    buf.as_ptr() as *const ENUM_SERVICE_STATUS_PROCESSW,
                    returned as usize,
                );
                for e in entries {
                    if e.ServiceStatusProcess.dwProcessId != 0 {
                        out.insert(e.ServiceStatusProcess.dwProcessId);
                    }
                }
                let no_more = r.is_ok() || (returned == 0 && more_needed == 0);
                if no_more {
                    break;
                }
                if more_needed > 0 && returned == 0 {
                    // 缓冲区连一条都放不下，扩容重试一次
                    buf.resize(buf.len() + more_needed as usize, 0);
                }
            }
        }
        let _ = CloseServiceHandle(scm);
    }
    out
}

const RUN_KEYS: &[(HKEY, &str)] = &[
    (
        HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Run",
    ),
    (
        HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\RunOnce",
    ),
    (
        HKEY_LOCAL_MACHINE,
        r"Software\Microsoft\Windows\CurrentVersion\Run",
    ),
    (
        HKEY_LOCAL_MACHINE,
        r"Software\Microsoft\Windows\CurrentVersion\RunOnce",
    ),
];

/// 收集 Run 键（HKCU/HKLM × Run/RunOnce）中注册的开机启动 exe 路径（规范化后）
pub fn collect_autostart_paths() -> HashSet<String> {
    let mut out = HashSet::new();
    for &(root, subkey) in RUN_KEYS {
        enum_run_key(root, subkey, &mut out);
    }
    out
}

fn enum_run_key(root: HKEY, subkey: &str, out: &mut HashSet<String>) {
    unsafe {
        let wide: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(root, PCWSTR(wide.as_ptr()), None, KEY_READ, &mut hkey)
            != ERROR_SUCCESS
        {
            return;
        }
        let mut index = 0u32;
        loop {
            let mut name_buf = [0u16; 256];
            let mut name_len = name_buf.len() as u32;
            let mut data_buf = [0u8; 4096];
            let mut data_len = data_buf.len() as u32;
            let mut value_type = 0u32;
            let err = RegEnumValueW(
                hkey,
                index,
                Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                &mut name_len,
                None,
                Some(&mut value_type),
                Some(data_buf.as_mut_ptr()),
                Some(&mut data_len),
            );
            if err == ERROR_NO_MORE_ITEMS || err != ERROR_SUCCESS {
                break;
            }
            index += 1;
            if value_type != REG_SZ.0 && value_type != REG_EXPAND_SZ.0 {
                continue;
            }
            let units: &[u16] = std::slice::from_raw_parts(
                data_buf.as_ptr() as *const u16,
                (data_len as usize) / 2,
            );
            let value = String::from_utf16_lossy(units);
            let value = value.trim_end_matches('\0');
            if let Some(path) = extract_exe_path(value) {
                out.insert(normalize_path(&path));
            }
        }
        let _ = RegCloseKey(hkey);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_quoted_path() {
        assert_eq!(
            extract_exe_path(r#""C:\Program Files\OneDrive\OneDrive.exe" /background"#),
            Some(r"C:\Program Files\OneDrive\OneDrive.exe".to_string())
        );
    }

    #[test]
    fn extract_unquoted_path_with_args() {
        assert_eq!(
            extract_exe_path(r"C:\Tools\agent.exe --serve --port 3000"),
            Some(r"C:\Tools\agent.exe".to_string())
        );
    }

    #[test]
    fn extract_expands_env_vars() {
        let path = extract_exe_path(r"%WINDIR%\System32\cmd.exe /c start x").unwrap();
        assert!(path.to_lowercase().ends_with(r"system32\cmd.exe"));
        assert!(!path.contains('%'));
    }

    #[test]
    fn extract_returns_none_without_exe() {
        assert_eq!(extract_exe_path("notacommand"), None);
    }

    #[test]
    fn system_path_matches_windir_prefix() {
        assert!(is_system_path(
            Some(r"C:\Windows\System32\RuntimeBroker.exe"),
            r"C:\Windows"
        ));
        // 正斜杠与大小写规范化
        assert!(is_system_path(
            Some("c:/windows/system32/svchost.exe"),
            r"C:\WINDOWS"
        ));
        assert!(!is_system_path(
            Some(r"C:\Users\dev\agent\node.exe"),
            r"C:\Windows"
        ));
        assert!(!is_system_path(None, r"C:\Windows"));
    }

    #[test]
    fn service_pids_enumerated() {
        // 任何运行中的 Windows 都有服务（如 Schedule/EventLog）
        let pids = collect_service_pids();
        assert!(!pids.is_empty(), "应能枚举到服务宿主 PID");
    }

    #[test]
    fn autostart_paths_collected_without_panic() {
        // 不断言非空（干净系统可能为空），只要不 panic 且路径规范化
        let paths = collect_autostart_paths();
        assert!(paths.iter().all(|p| !p.contains('/')));
    }
}
