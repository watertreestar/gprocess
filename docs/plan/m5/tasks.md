# M5 任务清单

## 后端（Rust）

- [x] setup 中创建 `island` 窗口：透明 / 无边框 / 置顶 / skipTaskbar / 主屏顶部居中 / 初始隐藏
- [x] island 窗口 CloseRequested → hide（不退出应用）
- [x] capabilities 覆盖 island 窗口并补 window / event 权限

## 前端：窗口路由与 Island UI

- [x] `main.tsx` 按 `#/island` hash 分流渲染 `<IslandApp />`（复用同一 bundle，不加 vite 多页）
- [x] `IslandApp`：监听 `island:alert` 事件入队，卡片渲染（进程名 / PID / 指标 / 排队计数）
- [x] 卡片动画：窗口内胶囊 → 卡片展开（CSS transition，固定窗口尺寸不变）
- [x] 交互：「查看」「结束」「忽略」；30 秒无操作自动 hide；点击后出队显示下一条

## 前端：watchdog 渠道分发

- [x] settings 增加 `notifyChannel: "toast" | "island" | "both"`（默认 `both`）
- [x] `useWatchdog` 按 channel 分发：toast → `sendNotification`；island → `emitTo("island", "island:alert", payload)`
- [x] 设置页「通知」区块增加形式选择（Select）

## 前端：主面板联动

- [x] App 监听 `island:action`：`view` → 显示主窗口 + 切进程页 + 选中 pid；`kill` → 同上并打开 KillDialog
- [ ] island 窗口弹出时主窗口隐藏（托盘常驻）场景验证 —— 待人工验收

## 质量门禁

- [x] `cargo test`（19 通过）/ `cargo clippy -D warnings` / `npm run build` 全绿
- [ ] release 构建完成；人工验收（README 1–6）待用户确认
- [x] 更新 `docs/plans.md`（M5 勾选）
