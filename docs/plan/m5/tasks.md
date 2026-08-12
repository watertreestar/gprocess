# M5 任务清单

> 迭代 1（独立窗口）已完成并交付；迭代 2 按用户反馈改为主窗口内悬浮胶囊，迭代 1 实现整体删除（见 design.md 修订记录）。

## 迭代 2：主窗口内灵动岛（当前实现）

### 清理（删除迭代 1）

- [x] 删除 `island.rs` / `IslandApp.tsx` / main.tsx hash 分流 / 窗口间事件 / `IslandAction` 类型
- [x] capabilities 回退为仅 main 窗口 + 插件权限

### 前端

- [x] `IslandOverlay` 组件：主窗口顶部居中黑色胶囊（macOS 风格，不随主题变色），单排 34px
- [x] 胶囊 → 展开动画（210px → 400px，CSS transition），操作区淡入
- [x] 队列 + `+N` 计数；30 秒无操作自动忽略；查看/结束/忽略三键
- [x] `useWatchdog` island 渠道从 `emitTo` 改为 App 回调（islandQueue state）
- [x] 查看 → 选中进程；结束 → KillDialog 确认（不破安全模型）

### 质量门禁

- [x] `cargo test`（27 通过）/ `cargo clippy -D warnings` / `npm run build` 全绿
- [ ] release 构建完成；人工验收（README 1–6）待用户确认

## 迭代 1：独立 island 窗口（已删除，仅留档）

- [x] setup 创建透明无边框置顶 island 窗口 + CloseRequested 拦截
- [x] `#/island` hash 分流渲染；`island:alert` / `island:action` 窗口间事件
- [x] watchdog 渠道分发与设置页形式选择（设置项沿用至迭代 2）
