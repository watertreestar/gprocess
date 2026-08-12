# M4 任务清单

## 依赖与配置

- [x] 引入 `tauri-plugin-autostart / notification / updater / process`（Cargo + npm）
- [x] capabilities 增加 `autostart:default`、`notification:default`、`updater:default`、`process:default`
- [x] 生成 updater 签名密钥（私钥存 `~/.tauri/` 不入库），pubkey 写入 `tauri.conf.json`
- [x] `tauri.conf.json`：plugins.updater endpoints（GitHub Release）、bundle.createUpdaterArtifacts

## 后端

- [x] 系统托盘：托盘图标 + 菜单（显示主面板 / 退出）、关窗拦截转隐藏、托盘点击恢复窗口
- [x] 注册 autostart / notification / updater / process 插件

## 前端

- [x] 详情侧栏「资源曲线」：近 60s CPU/内存 sparkline（SVG，chart token 配色）
- [x] 通知触发器：高 CPU 持续判定（连续 2 次快照）、长时间孤儿（阈值可调）、按 pid 冷却 10 分钟
- [x] 设置页「通知」区块：总开关、CPU 阈值、孤儿时长阈值
- [x] 设置页「常规」增加开机自启开关（isEnabled 同步）
- [x] 设置页「更新」区块：当前版本、检查更新、下载安装并重启

## 质量门禁

- [x] `cargo test`（19 通过）/ `cargo clippy -D warnings` / `npm run build` 全绿
- [ ] release 构建完成；人工验收（README 1–5）待用户确认
- [x] 更新 `docs/plans.md` 与 `docs/build.md`（updater 发版流程）
