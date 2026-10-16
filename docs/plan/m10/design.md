# M10 设计

## 背景

小分类器路线（M9 讨论结论）的瓶颈是标注数据：模型价值在长尾模糊案例，但无样本无从训练。M10 先建数据管道：人工反馈 → 本地 JSONL → 离线训练（M11）。

## 样本结构

一条样本 = 人工标签 + 提交时刻的完整进程特征，特征集全部复用现有采集（M6/M7/M9 已具备）：

```json
{
  "ts": 1760000000000,
  "label": "not_orphan",
  "note": "这是杀毒软件的守护进程",
  "thresholdMin": 30,
  "listenCount": 1,
  "process": {
    "pid": 1234, "name": "node.exe", "exePath": "...", "cmdline": [...],
    "script": "agent-browser", "startTime": ..., "user": "...",
    "orphan": { "status": "confirmed", "pidReused": false, "heuristicScore": 2,
                "parentName": "node.exe", "parentScript": "agent-browser",
                "origin": null, "externalConnections": 3 }
  }
}
```

标签语义：

- `not_orphan`：confirmed 但实际不是孤儿（误报）
- `origin_wrong`：expected 但来源分类/文案错误
- `is_orphan`：none/expected 但实际是孤儿（漏判）

## 实现

- `feedback.rs`：
  - `append_sample(path, sample) -> Result<u32, String>` 纯函数：`create(true).append(true)` 追加一行 JSON，返回文件总行数（写后读计数，文件很小）。路径参数化便于 temp 目录单测。
  - `record_feedback` 命令：刷新进程（`process_refresh_kind`，M9 引入）→ `collect_processes` → `build_orphan_context` + `attach_orphan`（与 assess 同一管线）→ 找到目标进程 → 组装样本 → 写 `app_data_dir()/feedback.jsonl`。
- 前端：ProcessDetail 孤儿判定区加 ghost 按钮，Dialog 三选一 + 备注输入，未选标签禁用提交；成功后内联显示「已记录第 N 条样本」。

## 边界与权衡

- 样本不含用户豁免名单（前端可传 excludes 参数保留扩展位，首版不传）。
- JSONL 无并发写保护：单用户桌面应用，写冲突风险可忽略。
- 不建样本浏览 UI：文件就在应用数据目录，文本编辑器即可查看；浏览/统计界面等训练立项时再评估。
