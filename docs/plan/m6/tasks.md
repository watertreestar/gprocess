# M6 任务清单

## 后端

- [x] `SnapshotState` 增加 `parent_history`（pid → { child_start, parent_name }），每次快照刷新，PID 复用/退出清理
- [x] `OrphanStatus` 增加 `expected`；`OrphanInfo` 增加 `parent_name`
- [x] 已知启动器名单（explorer / svchost / services / wininit / winlogon / taskhostw / sihost / userinit）来源降级
- [x] `attach_orphan` 接入豁免名单；`snapshot` / `assess_process` 命令增加 excludes 参数
- [x] 新增单测：启动器降级、豁免命中、历史刷新与清理；回归 detect_orphan 既有测试（共 27 通过）

## 前端

- [x] 类型：OrphanInfo 增加 parentName、status 增加 "expected"
- [x] settings 增加 `orphanExcludes: string[]`；useSnapshot / assessProcess 传递 excludes
- [x] 详情侧栏孤儿判定区：展示父进程身份、expected 说明、豁免/取消豁免按钮
- [x] 设置页「孤儿判定」区块：豁免名单编辑（添加/移除）
- [x] 孤儿计数与过滤视图仅统计 `confirmed`（expected 不计入）

## 质量门禁

- [x] `cargo test`（27 通过）/ `cargo clippy -D warnings` / `npm run build` 全绿
- [ ] release 构建完成；人工验收（README 1–4）待用户确认
- [x] 更新 `docs/plans.md`（M6 行）
