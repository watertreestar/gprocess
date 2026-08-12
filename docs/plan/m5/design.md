# M5 设计：刘海屏通知

## 1. 总体形态

新增第二个 Tauri webview 窗口 `island`，与主窗口共享同一前端 bundle，通过 URL hash 分流渲染：

```
主窗口  index.html          → <App />       （现有）
island  index.html#/island  → <IslandApp /> （新增）
```

不引入 vite 多页配置、不新增构建入口，`main.tsx` 一行判断分流。

## 2. island 窗口参数

在 Rust `setup` 中用 `WebviewWindowBuilder` 动态创建（需要主屏尺寸计算居中位置，不写死 tauri.conf.json）：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| 尺寸 | 340 × 170（logical px） | 固定尺寸=展开卡片大小；收起=整个窗口 `hide()`，不做窗口尺寸动画（避免透明窗口 resize 闪烁） |
| 位置 | 主屏顶部居中，y = 8px | `primary_monitor()` 取尺寸计算 |
| decorations | false | 无边框，圆角由 HTML/CSS 画 |
| transparent | true | 透明背景，卡片本体是不透明胶囊 |
| always_on_top | true | 保证可见性 |
| skip_taskbar | true | 不进任务栏 / Alt+Tab |
| resizable / maximizable | false | — |
| visible | false | 初始隐藏，有告警才弹出 |
| focused | false | 弹出时不抢输入焦点（通知语义） |

弹出动画在**窗口内部**做：`show()` 后内容从 220×40 胶囊过渡到 340×160 卡片（CSS transition），视觉上是灵动岛展开，窗口本身不动。

## 3. 数据流（沿用现有事件体系，零轮询）

island 不自己拉快照，全部事件驱动：

```
主窗口 useWatchdog（现有，快照到达时判定）
  │  emitTo("island", "island:alert", AlertPayload)
  ▼
IslandApp 监听入队 → show() → 渲染卡片
  │  用户点击按钮 → emit("island:action", { action, pid })
  ▼
主窗口 App 监听：
  view → 主窗口 show/focus + 切进程页 + setSelectedPid(pid)
  kill → 同上 + setKillTarget({ process, mode: "single" })（弹确认 Dialog）
```

```ts
interface AlertPayload {
  kind: "highCpu" | "longOrphan";
  pid: number;
  name: string;
  /** highCpu: 当前 CPU%；longOrphan: 运行分钟数 */
  value: number;
}
```

**关键约束**：island 的「结束」**不直接调 kill command**——必须唤起主面板走 KillDialog 确认，M2 安全模型不破。

## 4. IslandApp 行为

- **队列**：告警入队，逐条展示；多条时卡片角落显示 `+N`
- **自动收起**：30 秒无操作 `hide()` 并清空当前条（队列其余保留，下次告警再弹）；点击任一按钮立即出队，队空即 hide
- **按钮**：
  - 「查看」→ emit view → hide
  - 「结束」→ emit kill → hide（确认 Dialog 在主面板完成）
  - 「忽略」→ 仅出队
- **关闭行为**：CloseRequested → `hide()`（与主窗口一致，退出只走托盘菜单）
- **视觉**：黑胶囊卡片（`--popover` 底色 + 圆角 20px），指标用等宽数字，颜色复用 `--chart-1`（CPU）/ `--warning`（孤儿）；沿用 `workbench-design-system.md` token，不新造色

## 5. watchdog 渠道分发

settings 增加：

```ts
notifyChannel: "toast" | "island" | "both"  // 默认 both
```

`useWatchdog` 现有冷却/连续判定逻辑不变，仅把 `notify()` 改为按渠道分发：

- `toast` → `sendNotification`（M4 已有）
- `island` → `emitTo("island", "island:alert", payload)`（窗口隐藏时事件仍能送达，由 IslandApp 自行 show）

设置页「通知」区块加 Select：系统通知 / 刘海屏 / 两者。

## 6. 权限与 capabilities

- `capabilities/default.json` 可能需要补 `core:window:allow-show / allow-hide / allow-set-focus / allow-start-dragging` 及 `core:event:allow-listen / allow-emit / allow-emit-to`（按编译运行报错补齐，island 与 main 共用同一 capability 集）
- 无新增 npm / cargo 依赖（`emitTo` 来自 `@tauri-apps/api/event`，已随 api 包存在）

## 7. 已知边界（如实说明）

- **全屏游戏/独占全屏**下 alwaysOnTop 窗口会被压住，刘海不可见——Windows 桌面合成限制，无法规避
- 透明窗口依赖 WebView2 合成，个别远程桌面/旧显卡环境下可能不透明（退化为不透明黑底，功能不受影响）
- 多显示器仅主屏显示（非目标）

## 8. 与 WinIsland 的关系

不依赖、不集成。WinIsland 是 GPLv3 独立应用（winit + skia D3D 自绘），集成会带来许可证传染与异构渲染栈。本设计只借鉴其交互形态（顶部胶囊展开卡片），实现完全基于 Tauri 多窗口 + 现有前端体系。若日后想要 WinIsland 完整生态（媒体控制、音频可视化），正确姿势是单独安装 WinIsland 本体并写它的插件，而非塞进 gprocess。
