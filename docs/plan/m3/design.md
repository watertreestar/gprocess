# M3 设计：效率与体验

## 刷新策略

- 前端轮询 hook 升级：间隔可配，`document.visibilitychange` + Tauri 窗口 focus 事件双通道控制暂停/恢复；恢复可见时立即补一次快照。
- 保持"全量快照"模型不变（M1 决策）；仅当 30 分钟稳定性验证不通过时，才引入增量刷新（新增/退出进程按 pid diff）。

## 设置持久化

- 最初用 localStorage 落地（最简单实现）；**M5 后已迁移为后端 JSON 文件**：
  `%APPDATA%\com.gprocess.app\settings.json`，Rust `settings.rs` 原子写（临时文件 + rename），
  前端 `loadSettings` 异步加载、加载完成前不落盘，侧栏展开状态也并入设置模型。
- 键空间：`refreshIntervalMs`、`orphanThresholdMin`、`defaultFilter`、`theme`、`showSystemProcesses`、`watchedPorts[]`、`notificationsEnabled`、`notifyChannel`、`highCpuThreshold`、`longOrphanMin`、`sidebarExpanded`。
- 设置变更实时生效：React state 广播，轮询 hook 与过滤逻辑订阅。

## 提权方案

- 检测：尝试读取一个仅管理员可见的端口属主（或以 Windows API `CheckTokenMembership` 判定）。
- 提权：ShellExecute `runas` 重启自身；普通权限模式下端口页顶部显示持久提示条（info 语义色），说明信息受限并可一键重启。

## 关注端口

- 设置页维护端口列表；端口页中关注端口行置顶并加 `accent` 背景；被占用时进程页对应行也显示标记。

## 可选项取舍原则

- 托盘与快捷键依赖 Tauri 托盘/全局快捷键 API，接入成本中等，放在最后。
- 批量结束只允许 `safe` 级别且展示逐条摘要，避免与 M2"可解释、逐个确认"的安全模型冲突。
