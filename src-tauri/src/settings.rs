//! 设置持久化：JSON 文件存于应用数据目录（%APPDATA%/com.gprocess.app/settings.json）
//! 原子写入（临时文件 + rename），避免写入中断损坏设置

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn read_settings_file(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write_settings_file(path: &Path, json: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 读取设置 JSON；文件不存在返回 None（前端回退默认值）
#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Option<String>, String> {
    read_settings_file(&settings_path(&app)?)
}

/// 保存设置 JSON（前端负责序列化与字段校验）
#[tauri::command]
pub fn save_settings(app: AppHandle, json: String) -> Result<(), String> {
    write_settings_file(&settings_path(&app)?, &json)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("gprocess-test-{}-{}", std::process::id(), name))
    }

    #[test]
    fn missing_file_returns_none() {
        let path = temp_path("missing-settings.json");
        let _ = fs::remove_file(&path);
        assert_eq!(read_settings_file(&path).unwrap(), None);
    }

    #[test]
    fn write_then_read_roundtrip() {
        let path = temp_path("roundtrip-settings.json");
        let _ = fs::remove_file(&path);
        write_settings_file(&path, r#"{"theme":"console-dark"}"#).unwrap();
        assert_eq!(
            read_settings_file(&path).unwrap(),
            Some(r#"{"theme":"console-dark"}"#.to_string())
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn overwrite_replaces_existing() {
        let path = temp_path("overwrite-settings.json");
        let _ = fs::remove_file(&path);
        write_settings_file(&path, "{}").unwrap();
        write_settings_file(&path, r#"{"v":2}"#).unwrap();
        assert_eq!(
            read_settings_file(&path).unwrap(),
            Some(r#"{"v":2}"#.to_string())
        );
        assert!(!path.with_extension("json.tmp").exists());
        let _ = fs::remove_file(&path);
    }
}
