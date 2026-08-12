//! 管理员权限检测与提权重启（Windows）

/// 当前进程是否以管理员身份运行
#[tauri::command]
pub fn is_admin() -> bool {
    #[cfg(windows)]
    unsafe {
        windows::Win32::UI::Shell::IsUserAnAdmin().as_bool()
    }
    #[cfg(not(windows))]
    false
}

/// 以管理员身份重启自身（ShellExecute runas），成功后当前进程退出
#[tauri::command]
pub fn restart_as_admin() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::{w, PCWSTR};
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let path: Vec<u16> = exe
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let handle = unsafe {
            ShellExecuteW(
                None,
                w!("runas"),
                PCWSTR(path.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        // ShellExecuteW 返回值大于 32 表示成功
        if handle.0 as usize > 32 {
            std::process::exit(0);
        }
        Err("提权启动被取消或失败".into())
    }
    #[cfg(not(windows))]
    Err("仅支持 Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_admin_does_not_crash() {
        // 不断言结果（取决于运行环境），只验证 API 可调用
        let _ = is_admin();
    }
}
