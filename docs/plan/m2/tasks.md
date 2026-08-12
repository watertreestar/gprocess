# M2 任务清单

## Rust 后端

- [x] `assess.rs`：孤儿判定（父存活检查 + PID 复用排除），随 `snapshot()` 全量输出
- [x] `assess.rs`：四级安全分级（forbidden / danger / caution / safe），reasons 逐条生成
- [x] 系统关键进程名单与高权限账户判定（SYSTEM / LOCAL SERVICE / NETWORK SERVICE）
- [x] 子孙树构建（ppid 索引 + 环保护）与父链追溯（前端由快照派生）
- [x] `assess_process(pid)` command 输出 `KillAssessment`（级别 / 理由 / 子孙 / 端口 / 孤儿判定）
- [x] `kill_tree(pid)` command：自底向上 kill，逐个记录结果（成功/失败分别返回）
- [x] 单元测试：孤儿判定真/假阳性、PID 复用、各级别判定、树构建与环保护（共 18 个用例通过）

## 前端

- [x] 进程页行级孤儿标记（Badge + 低饱和 warning 背景 + Tooltip 说明）与「疑似孤儿 / 监听端口 / 高占用」过滤 Tabs
- [x] 详情侧栏：孤儿判定区块（状态 + PID 复用说明 + 特征匹配度）
- [x] 详情侧栏：进程树组件（父链最多 3 层 + 子孙缩进树，点击切换选中，超 50 个折叠计数）
- [x] 详情侧栏：杀前评估区块（级别 Badge + reasons 列表 + notes）
- [x] 确认 Dialog 升级：级别 Badge、影响面（子孙列表 / 端口列表）、`danger` 输入 PID 确认、`forbidden` 禁用确认按钮
- [x] 「结束进程树」按钮（无子孙时禁用）与结果通知（成功 N / 失败 M 逐条）

## 质量门禁

- [x] `cargo test`（18 passed）/ `cargo clippy`（无警告）通过
- [x] 前端 `npm run build`（tsc --noEmit + vite build）通过
- [x] Level 1 回归：M1 功能代码路径保留（列表 / 跨页跳转 / 杀单进程），构建无破坏
- [ ] 按 README 验收标准 1–5 逐项人工验收（需运行 `npm run tauri dev`，含孤儿场景实测）

## 备注

- 孤儿判定在 `snapshot()` 内全量计算（每 2s 刷新随快照更新），行标记与过滤零额外开销
- `assess_process` 仅在选中进程 / 打开确认 Dialog 时调用
- 孤儿运行时长阈值当前为常量 30 分钟，M3 设置页开放配置
