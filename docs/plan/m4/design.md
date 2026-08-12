# M4 设计：常驻与自动化

## 托盘

- 使用 Tauri 2 核心 `tray-icon` feature，不引入插件。
- 主窗口 `CloseRequested` 事件拦截：`prevent_close()` + `hide()`；托盘左键点击或菜单「显示主面板」→ `show()` + `set_focus()`；菜单「退出」→ `app.exit(0)`。
- 决策：不提供"关窗即退出"选项（当前需求最简单实现；用户要退出走托盘菜单，语义唯一）。

## 资源曲线

- 纯前端：`ProcessDetail` 内维护 `Map<pid, {cpu[], mem[]}>`，每次快照到达追加样本，各保留最近 30 个（2s 间隔 ≈ 60s）。
- SVG 双折线：CPU 用 `chart-1`，内存按区间峰值归一用 `chart-2`；不引入图表库（30 个点的 polyline 足够）。
- 切换进程不清空 Map，回看有连续性；Map 超 500 项时整体重置防膨胀。

## 开机自启

- `tauri-plugin-autostart`（Windows 走注册表 Run 键，免管理员）。
- 设置页开关：`isEnabled()` 挂载时同步真实状态，切换即调用 `enable()/disable()`。

## 自动更新（GitHub Release）

- `tauri-plugin-updater` + `tauri-plugin-process`（安装后 relaunch）。
- 签名：`tauri signer generate` 生成密钥对；私钥放 `~/.tauri/gprocess.key`（**不入库**），pubkey 写 `tauri.conf.json`。
- `bundle.createUpdaterArtifacts: true` 使 NSIS 打包额外产出 `*.nsis.zip` + `*.sig`，连同 `latest.json` 上传到 GitHub Release；`latest.json` 格式见 build.md。
- 前端流程：设置页点「检查更新」→ `check()` → 有新版本显示版本号 → 「下载并安装」→ `downloadAndInstall()` → `relaunch()`。
- endpoint 先指向 `https://github.com/yaping/gprocess/releases/latest/download/latest.json`，仓库建立后立即可用。

## 系统通知

- `tauri-plugin-notification`（Windows 原生 toast）。
- 触发器在前端（快照数据就在前端，无需后端轮询）：
  - **超高资源占用**：某进程连续 2 次快照 CPU ≥ 阈值（默认 90%）
  - **长时间孤儿**：orphan confirmed 且运行时长 ≥ 阈值（默认 240 分钟）
- 冷却：按 pid 记录最近通知时间，10 分钟内不重复；仅当前会话内存态（重启应用重置，可接受）。
- 设置：`notificationsEnabled`、高 CPU 阈值、孤儿时长阈值；挂载时 `isPermissionGranted()`，未授权则 `requestPermission()`。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| updater 端到端依赖 GitHub 仓库与发版流程 | 配置先行、文档齐备；"已是最新"路径可立即验收 |
| 私钥误提交 | 存 `~/.tauri/` 仓库外；build.md 明确警示 |
| 托盘 + 提权重启交互（管理员实例托盘退出） | 行为一致，无特殊处理 |
| 通知权限被拒 | 触发失败静默，不打断主流程 |
