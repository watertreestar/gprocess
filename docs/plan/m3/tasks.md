# M3 任务清单

## 刷新与性能

- [x] 刷新间隔设置（1s / 2s / 5s / 手动）+ 不可见暂停 / 恢复可见立即补一次
- [ ] 30 分钟连续运行稳定性验证（随人工验收进行）

## 设置页

- [x] 设置数据模型 + 持久化（localStorage，键 `gprocess.settings`；未引入 tauri store，满足当前需求的最简单实现）
- [x] 设置页 UI：刷新间隔、孤儿阈值、默认过滤、主题切换、系统进程显隐
- [x] 主题即时生效（`data-theme` 切换，prism-light / console-dark 两套 token）

## 权限

- [x] 当前权限状态检测（`IsUserAnAdmin`）与展示（顶栏「受限模式」Badge + 设置页状态）
- [x] "以管理员重启"操作（ShellExecute `runas`，成功后当前进程退出）

## 筛选增强

- [x] 排序方向切换（升/降）+ 名称/PID 次序 tiebreaker
- [x] 自定义关注端口列表：设置页维护、端口页置顶高亮 + 行内星标快捷关注、进程页行级「关注端口」Badge

## 可选项（未做，留待后续评估）

- [ ] 系统托盘常驻 + 全局快捷键
- [ ] safe 级别批量结束
- [ ] 快照 diff 高亮

## 质量门禁

- [x] `cargo test`（19 passed）/ `cargo clippy`（无警告）/ `npm run build`（tsc + vite）全绿
- [x] M1/M2 全功能 Level 1 回归（代码路径保留，构建无破坏）
- [ ] 按 README 验收标准 1–4 逐项人工验收（release 版本已启动）

## 备注

- 孤儿阈值仅影响展示优先级评分（heuristic_score），不影响孤儿判定本身
- 提权重启后设置保留（localStorage 与应用实例无关）
