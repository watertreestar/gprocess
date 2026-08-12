# M1 任务清单

## 工程脚手架

- [x] 初始化 Tauri 2 + React 19 + Vite + Tailwind CSS 4 工程
- [x] 接入 Radix UI 交互基元与 Lucide 图标，搭建本地组件层（Button / Input / Dialog / Tabs / Tooltip / Badge）
- [x] 注入 prism-light / console-dark 两套主题 token，定义 `tool-*` 全局原语（tool-page / tool-page-header / tool-section / tool-row / tool-empty-state / tool-sidebar）
- [x] 应用壳：52/192px 侧栏（当前项 1px 指示线 + 收起态 Tooltip）、48px 全局顶栏、导航「进程 / 端口」

## Rust 后端

- [x] 引入 `sysinfo`、`netstat2` 依赖
- [x] `snapshot()` command：进程列表（pid / ppid / name / exe / cmdline / start_time / cpu / memory / user / status）
- [x] `snapshot()` 集成端口采集（tcp/udp、local_addr、local_port、state、pid）
- [x] `kill_process(pid)` command，结构化错误（NotFound / Failed）
- [x] 单元测试：快照字段完整性、端口采集、错误枚举序列化（5 个用例通过）

## 前端

- [x] `invoke` 封装与类型定义（ProcessSnapshot / ProcessInfo / PortBinding）
- [x] 手动刷新 + 固定 2s 轮询 hook（页面不可见时暂停）
- [x] 进程页：虚拟滚动数据行、搜索（名称/PID/命令行）、排序（CPU/内存/启动时间）
- [x] 进程详情侧栏：概要、命令行（可复制）、占用端口列表（点击跳端口页）
- [x] 端口页：数据行 + 协议/状态过滤 + "查看进程"跨页跳转选中
- [x] 结束进程确认 Dialog（浮层变体，destructive 主按钮）+ 结果通知
- [x] 空状态（无匹配 / 未选中进程 / 浏览器预览降级）

## 质量门禁

- [x] `cargo test`（5 passed）/ `cargo clippy`（无警告）通过
- [x] `npm run build`（tsc --noEmit + vite build）通过
- [ ] 按 README 验收标准 1–5 逐项人工验收（需运行 `npm run tauri dev`）
- [ ] 视觉走查：`workbench-design-system.md` 第 8 节检查清单（需运行后确认）

## 备注

- 项目内已配置 rsproxy crates 镜像（`src-tauri/.cargo/config.toml`）
- `KillError::AccessDenied` 合并为 `Failed`（sysinfo kill 仅返回 bool，无法区分权限错误）；M3 提权入口再细化
