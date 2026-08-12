# M7 任务清单

## 后端

- [x] `origin.rs`：`collect_service_pids`（EnumServicesStatusExW）、`collect_autostart_paths`（HKCU/HKLM Run + RunOnce）、`extract_exe_path`（纯函数）、`is_system_path`
- [x] `SnapshotState` 增加服务 PID / 启动项路径缓存（30s TTL）
- [x] `OrphanInfo` 增加 `origin`（system/service/autostart/launcher）与 `external_connections`
- [x] `PortBinding` 增加 `remote_addr`（TCP）；统计非本机 ESTABLISHED 连接
- [x] `attach_orphan` 重构为 OrphanContext 传参，接入三个来源信号（优先级：豁免 > 系统路径 > 服务 > 启动项 > 启动器）
- [x] 单测：extract_exe_path（引号/参数/环境变量）、系统路径、服务/启动项降级、外部连接统计（共 39 通过）

## 前端

- [x] 类型同步：origin / externalConnections / remoteAddr
- [x] 详情侧栏：expected 按 origin 显示来源文案；confirmed 显示活跃外部连接提示
- [x] 进程行父进程列：父已退出时显示历史父名（"cmd.exe（已退出）"）
- [x] 孤儿视图排序：confirmed 来源未知排后、有活跃外部连接降权

## 质量门禁

- [x] `cargo test`（39 通过）/ `cargo clippy -D warnings` / `npm run build` 全绿
- [ ] release 构建完成；人工验收（README 1–5）待用户确认
- [x] 更新 `docs/plans.md`（M7 行）
