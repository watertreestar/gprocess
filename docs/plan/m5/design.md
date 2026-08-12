# M5 设计：灵动岛通知

> **修订（M5 迭代 2）**：初版用独立 Tauri 窗口（`island`，透明无边框置顶）实现，实测后按用户反馈改为
> **主窗口内顶部悬浮胶囊**：不单独开窗口、macOS 黑色胶囊风格、单排紧凑高度（34px）。
> 独立窗口方案（island.rs / IslandApp / 窗口间事件）已整体删除，仅保留本修订记录。

## 1. 总体形态

主窗口根容器内绝对定位悬浮层 `IslandOverlay`（`src/components/IslandOverlay.tsx`）：

- 位置：主窗口顶部居中（`absolute top-2 left-1/2 -translate-x-1/2 z-50`）
- 样式：macOS 灵动岛风格——黑色胶囊（`bg-neutral-900/95` + 白字 + ring），**不随主题变色**
- 尺寸：胶囊 210px → 展开 400px，高度固定 34px（用户要求"不要太高"，单排布局）
- 动画：CSS transition 宽度展开，操作区淡入

## 2. 数据流（纯前端，无窗口间事件）

```
useWatchdog（快照判定 + 冷却）
  │  onIslandAlert(alert) 回调
  ▼
App islandQueue state
  ▼
IslandOverlay 渲染队列首条
  │  查看 → setPage + setSelectedPid
  │  结束 → setKillTarget（弹 KillDialog 确认，不破安全模型）
  │  忽略 → 出队
```

通知渠道设置不变：`notifyChannel: toast / island / both`，island 渠道从 `emitTo` 改为直接回调。

## 3. 行为

- **队列**：告警入队逐条展示，多条显示 `+N`
- **自动收起**：30 秒无操作自动忽略当前条
- **操作按钮**：查看（Eye）/ 结束（OctagonX，红色）/ 忽略（X），图标按钮单排排列
- 主窗口关闭（托盘常驻）时灵动岛不可见——此时由系统 toast 兜底（默认 both 渠道）

## 4. 独立窗口方案的删除内容（过时实现，已移除）

- `src-tauri/src/island.rs`（WebviewWindowBuilder 透明窗口）
- `src/island/IslandApp.tsx` 与 `main.tsx` hash 分流
- `island:alert` / `island:action` 窗口间事件与 `IslandAction` 类型
- capabilities 中的 island 窗口与多余 window/event 权限

删除收益：少一个 webview（内存 -4MB）、无跨窗口同步问题、无透明窗口兼容性边界。

## 5. 已知边界

- 灵动岛只在主窗口可见时有效；托盘常驻期间告警走系统 toast（默认渠道 both 已覆盖）
- 主窗口顶部 34px 悬浮层会短暂遮挡 TopBar 中部，30 秒自动收起，可接受

## 6. 与 WinIsland 的关系

不依赖、不集成。WinIsland 是 GPLv3 独立应用（winit + skia D3D 自绘），集成会带来许可证传染与异构渲染栈。本设计只借鉴其交互形态（顶部胶囊展开），实现完全基于主窗口内悬浮层。
