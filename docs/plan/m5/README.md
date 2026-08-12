# M5 灵动岛通知（Dynamic Island）

## 目标

进程告警（超高占用 / 长时间孤儿）以「灵动岛」胶囊呈现：比 Windows 系统通知更显眼、可直接操作（查看 / 结束），且不破坏 M2 建立的杀前确认安全模型。

## 背景

- M4 已落地 Windows 原生 toast 通知（`useWatchdog` + tauri-plugin-notification）。
- 用户期望 WinIsland（https://github.com/Eatgrapes/WinIsland）式灵动岛体验。经评估**不集成 WinIsland**：GPLv3 传染、skia/winit 自绘栈与 Tauri/WebView 异构、体积与编译成本高、功能远超需求。
- **形态迭代**：初版为独立 Tauri 透明窗口；实测后按用户反馈改为**主窗口内顶部悬浮胶囊**（macOS 黑色胶囊风格、单排紧凑高度 34px）。独立窗口实现已删除，修订记录见 design.md。

## 范围

- 主窗口内 `IslandOverlay` 悬浮层：顶部居中黑色胶囊，告警时展开为单排操作条
- watchdog 通知渠道分发：系统通知 / 灵动岛 / 两者
- 交互：「查看」选中进程；「结束」弹出确认 Dialog；「忽略」出队
- 多告警排队展示；30 秒无操作自动收起
- 设置页「通知」区块形式选择

## 非目标

- 常驻迷你胶囊（实时 CPU 概览）——列入后续候选
- 屏幕级置顶（主窗口外可见）：主窗口隐藏（托盘常驻）时由系统 toast 兜底
- 媒体控制、音频可视化等 WinIsland 生态功能

## 验收标准

1. 构造高 CPU（阈值临时调到 50%，跑满任一进程 ≥ 两个采样周期），主窗口顶部中央展开黑色胶囊，显示进程名 / PID / 指标与操作按钮，高度紧凑（单排）
2. 「查看」切到进程页并选中该进程；「结束」弹出该进程的结束确认 Dialog，确认后才真正结束
3. 多个进程同时告警时排队展示并显示剩余条数；30 秒无操作自动收起
4. 设置页通知形式可切换 系统通知 / 灵动岛 / 两者，即时生效；「仅灵动岛」时不再弹 Windows toast
5. 不再有独立的 island 窗口 / 托盘外窗口；任务栏与 Alt+Tab 仅主窗口一项
6. `cargo test` / `cargo clippy -D warnings` / `npm run build` 全绿
