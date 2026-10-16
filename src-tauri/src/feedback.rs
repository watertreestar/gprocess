//! 判定反馈样本采集：孤儿判定的人工反馈落盘 JSONL（应用数据目录 feedback.jsonl），
//! 供后续小分类器离线训练使用

use std::fs;
use std::path::Path;

use serde::Serialize;
use sysinfo::ProcessesToUpdate;
use tauri::{AppHandle, Manager};

use crate::snapshot::{
    attach_orphan, build_orphan_context, collect_ports, collect_processes, now_millis,
    process_refresh_kind, refresh_parent_history, ProcessInfo, SnapshotState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackSample {
    ts: i64,
    label: String,
    note: Option<String>,
    threshold_min: u32,
    listen_count: u32,
    process: ProcessInfo,
}

/// JSONL 追加一行，返回文件总行数（路径参数化便于单测）
pub fn append_sample(path: &Path, sample: &FeedbackSample) -> Result<u32, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let line = serde_json::to_string(sample).map_err(|e| e.to_string())?;
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "{line}")
        })
        .map_err(|e| e.to_string())?;
    let total = fs::read_to_string(path)
        .map(|s| s.lines().count() as u32)
        .unwrap_or(0);
    Ok(total)
}

#[tauri::command]
pub fn record_feedback(
    app: AppHandle,
    state: tauri::State<SnapshotState>,
    pid: u32,
    label: String,
    note: Option<String>,
    threshold_min: Option<u32>,
) -> Result<u32, String> {
    let threshold_min = threshold_min.unwrap_or(30);
    let now_ms = now_millis();

    let mut processes = {
        let mut sys = state.system.lock().expect("system lock poisoned");
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh_kind());
        collect_processes(&sys, &state.users)
    };
    let ports = collect_ports();
    let ctx = build_orphan_context(&state, &ports, now_ms, threshold_min);
    {
        let mut history = state.parent_history.lock().expect("history lock poisoned");
        refresh_parent_history(&mut history, &processes);
        attach_orphan(&mut processes, &ctx, &history, &std::collections::HashSet::new());
    }
    let process = processes
        .into_iter()
        .find(|p| p.pid == pid)
        .ok_or_else(|| "目标进程已退出".to_string())?;
    let listen_count = ports
        .iter()
        .filter(|p| p.pid == pid && p.state.as_deref() == Some("Listen"))
        .count() as u32;

    let sample = FeedbackSample {
        ts: now_ms,
        label,
        note,
        threshold_min,
        listen_count,
        process,
    };
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    append_sample(&dir.join("feedback.jsonl"), &sample)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::{OrphanInfo, OrphanStatus};

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("gprocess-test-{}-{name}", std::process::id()))
    }

    fn sample(label: &str) -> FeedbackSample {
        FeedbackSample {
            ts: 1_760_000_000_000,
            label: label.into(),
            note: None,
            threshold_min: 30,
            listen_count: 1,
            process: ProcessInfo {
                pid: 1234,
                ppid: None,
                name: "node.exe".into(),
                exe_path: None,
                cmdline: vec![],
                script: Some("vite".into()),
                start_time: 1_000_000,
                cpu_percent: 0.0,
                memory_bytes: 0,
                user: None,
                status: "Running".into(),
                orphan: OrphanInfo {
                    status: OrphanStatus::Confirmed,
                    pid_reused: false,
                    heuristic_score: 2,
                    parent_name: Some("node.exe".into()),
                    parent_script: Some("agent-browser".into()),
                    origin: None,
                    external_connections: 0,
                },
            },
        }
    }

    #[test]
    fn append_counts_lines_and_writes_jsonl() {
        let path = temp_path("feedback.jsonl");
        let _ = fs::remove_file(&path);
        assert_eq!(append_sample(&path, &sample("not_orphan")).unwrap(), 1);
        assert_eq!(append_sample(&path, &sample("origin_wrong")).unwrap(), 2);
        let content = fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        // 每行是合法 JSON 且 camelCase 序列化
        let parsed: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(parsed["label"], "not_orphan");
        assert_eq!(parsed["thresholdMin"], 30);
        assert_eq!(parsed["process"]["script"], "vite");
        assert_eq!(parsed["process"]["orphan"]["parentScript"], "agent-browser");
        let _ = fs::remove_file(&path);
    }
}
