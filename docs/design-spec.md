# gprocess 设计规格

> 版本：v0.1（设计阶段）
> 关联文档：`workbench-design-system.md`（视觉体系）、`docs/plans.md`（里程碑计划）

## 1. 产品定位

**gprocess** 是一个 Windows 桌面端的进程与端口管理面板，面向 Agent 时代的高频开发场景：

- 各类 Agent / CLI 工具（Claude Code、Kimi、Copilot、Cursor 等）在本地拉起 dev server、node / python / bun 子进程，会话结束后大量进程与端口被遗留。
- 用户需要快速回答三个问题：**谁占了这个端口？这个进程是孤儿吗？能不能杀？**
- 给出明确的杀前评估，让用户可以**准确判断并安全清理**，而不是在任务管理器和 `netstat -ano | findstr` 之间来回切换。

一句话：**看见 → 判断 → 安全清理**。

## 2. 目标用户与核心场景

| 场景 | 现状痛点 | gprocess 解法 |
| --- | --- | --- |
| 端口被占（3000 / 5173 / 8080…） | `netstat -ano` + `tasklist` 两条命令手工关联 | 端口页直接列出 端口 → PID → 进程 → 启动时间，一键释放 |
| 孤儿进程堆积 | 父进程（终端 / Agent）已退出，node/python 子进程仍在后台跑，无任何界面提示 | 进程页"疑似孤儿"标记 + 筛选，批量识别 |
| 不确定能不能杀 | 怕误杀系统进程或正在干活的进程 | 杀前评估面板：进程树、占用端口、运行时长、安全分级 |
| 反复清理 | 每次都要重新查一遍 | 自动刷新 + 孤儿/监听端口过滤视图常驻 |

非目标：不做远程主机管理、不做性能 profiler、不做服务/计划任务管理（任务管理器和 services.msc 已覆盖）。

## 3. 领域模型

```text
ProcessSnapshot          某一时刻的系统快照（后端一次采集，前端一次渲染）
├─ processes: ProcessInfo[]
│    ├─ pid, ppid, name, exe_path, cmdline
│    ├─ start_time, run_duration（由 start_time 派生）
│    ├─ cpu_percent, memory_bytes, user
│    └─ status（running / sleeping …）
├─ ports: PortBinding[]
│    ├─ protocol（tcp / udp）, local_addr, local_port
│    ├─ state（LISTEN / ESTABLISHED / TIME_WAIT …）
│    └─ pid（属主进程）
└─ captured_at

OrphanVerdict（孤儿判定，M2）
├─ parent_alive: bool
├─ pid_reused: bool        父 PID 已被新进程复用
└─ suspicion: none / likely / confirmed

KillAssessment（杀前评估，M2）
├─ level: forbidden / danger / caution / safe
├─ reasons: string[]       评估依据，逐条展示
├─ children: ProcessInfo[] 整个子孙树
└─ owned_ports: PortBinding[]
```

### 3.1 孤儿判定规则（M2 核心）

Windows 的 `ppid` 在父进程退出后不会被清除，且 PID 会被复用，因此判定分两步：

1. **父进程存活检查**：`ppid` 不在当前进程表中 → 父进程已退出，记 `confirmed`。
2. **PID 复用排除**：`ppid` 存在，但该"父进程"的 `start_time` 晚于本进程 `start_time` → 父 PID 被复用，真正的父进程已退出，同样记 `confirmed`，并标注 `pid_reused`。

在 `confirmed` 基础上叠加启发式信息帮助用户决策（不改变判定结果，只影响展示优先级）：

- 可执行体是常见 runtime：`node.exe` / `python.exe` / `bun.exe` / `deno.exe` / `cmd.exe` / `pwsh.exe` 等；
- 持有 LISTEN 状态的端口；
- 运行时长超过阈值（默认 30 分钟，可调）。

### 3.2 杀前安全分级（M2 核心）

| 级别 | 判定 | UI 表现 | 操作 |
| --- | --- | --- | --- |
| `forbidden` | 系统关键进程名单（`System`、`smss.exe`、`csrss.exe`、`wininit.exe`、`winlogon.exe`、`services.exe`、`lsass.exe` 等）或本应用自身 |  destructive 标记 | 禁止，按钮禁用 |
| `danger` | 以 SYSTEM / LOCAL SERVICE 等高权限账户运行，或 `svchost.exe` 等共享宿主 | warning 标记 | 强确认（输入 PID 确认） |
| `caution` | 有子进程，或持有 LISTEN 端口，或运行时长 < 1 分钟（可能刚被拉起） | info/warning 标记 | 普通确认 Dialog，展示影响面 |
| `safe` | 用户态、无子进程、无监听端口 | 默认 | 普通确认 Dialog |

所有级别在确认 Dialog 中都展示完整影响面：子孙进程树、占用端口列表、命令行、评估依据。

## 4. 信息架构与页面设计

严格遵循 `workbench-design-system.md`：固定应用壳（侧栏 52/192px + 全局顶栏 48px）、`tool-page` 骨架、边线分区、最低宽度 1180px、两套主题 token。所有 PID、端口、路径、命令行、时间戳显式使用 `font-mono`。

### 4.1 应用壳与导航

```text
主导航（顺序固定）
├─ 进程      Activity 图标
├─ 端口      Plug/Network 图标
└─ 设置      Settings 图标（M3）
底部：帮助、主题切换、侧栏展开/收起
```

全局顶栏（48px）：左侧当前页上下文，右侧自动刷新开关 + 刷新间隔选择 + 手动刷新按钮 + 快照时间（`captured_at`，mono）。

### 4.2 进程页（主页面）

```text
tool-page
├─ tool-page-header
│    ├─ 标题「进程」+ 总数/疑似孤儿数摘要（12px muted）
│    └─ 主操作：刷新
├─ tool-section（工具行，高 40px，底部边线）
│    ├─ 搜索框（名称 / PID / 命令行模糊匹配）
│    ├─ 快捷过滤 Tabs：全部 | 疑似孤儿 | 监听端口 | 高占用
│    └─ 排序：CPU / 内存 / 启动时间（默认启动时间倒序）
├─ 数据行区（虚拟滚动，行高 36px）
│    列：状态点 | 名称 | PID(mono) | 父进程 | 端口数(mono) | 运行时长(mono)
│         | CPU | 内存 | 启动时间(mono) | 命令行（截断，mono，tooltip 全文）
└─ 右侧详情侧栏（300px，左边线，未选中时显示空选择态）
     ├─ 概要：名称、PID、用户、启动时间、运行时长、CPU/内存
     ├─ 命令行（mono，可换行，可复制）
     ├─ 孤儿判定（M2）：父进程状态 + 判定依据
     ├─ 进程树（M2）：父链 + 子孙树，可点击跳转
     ├─ 占用端口：端口(mono) + 协议 + 状态，点击跳端口页
     ├─ 杀前评估（M2）：级别标记 + reasons 逐条列出
     └─ 操作区（底部边线分隔）：结束进程 / 结束进程树（M2）
```

行的语义背景：疑似孤儿行使用低饱和 `warning` 背景（M2）；选中行使用 `accent`。状态点仅 7px `.status-dot`，用于运行/挂起提示。

### 4.3 端口页

```text
tool-page
├─ tool-page-header：标题「端口」+ LISTEN 数量摘要
├─ 工具行：搜索（端口号 / 进程名）、协议过滤（全部/TCP/UDP）、状态过滤（默认 LISTEN）
└─ 数据行：端口(mono) | 协议 | 状态 | PID(mono) | 进程名 | 启动时间(mono) | 运行时长
     └─ 行尾操作：查看进程（跳进程页并选中）、释放端口（即杀属主进程，走同一确认流程）
```

端口页与进程页共享同一份 `ProcessSnapshot`，两页切换不重新采集。

### 4.4 结束进程确认 Dialog（浮层变体）

- `rounded-md`、`shadow-lg`，最大宽 512px；标题「结束进程 {name} (PID {pid})」。
- 内容：杀前评估级别标记、影响面（子进程 N 个、监听端口列表）、命令行摘要。
- `danger` 级别要求输入 PID 确认；`forbidden` 不打开 Dialog（按钮禁用 + tooltip 说明）。
- 主按钮 destructive 变体，文案「结束进程」/「结束进程树」。

### 4.5 设置页（M3）

- 刷新间隔（1s / 2s / 5s / 手动）、孤儿运行时长阈值、默认过滤视图、主题切换、是否显示系统进程。

## 5. 技术架构

### 5.1 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 壳 | Tauri 2 | 本地系统 API 访问 + 小体积，比 Electron 更适合系统工具 |
| 进程采集 | `sysinfo` crate | 成熟跨平台，覆盖进程/CPU/内存/启动时间 |
| 端口采集 | `netstat2` crate（`GetExtendedTcpTable`/`GetExtendedUdpTable` 封装） | 直接拿到 端口 ↔ PID 映射，免解析 netstat |
| 前端 | React 19 + Vite + Tailwind CSS 4 + Radix UI + Lucide | 与设计体系第 2 节完全一致 |
| 字体 | Geist Variable + Ubuntu Mono | 设计体系规定 |

新增依赖前先查现有依赖；不自行重写进程/端口采集。

### 5.2 前后端契约（Tauri commands）

```rust
// 一次全量快照：进程 + 端口 + 采集时间（M1）
snapshot() -> ProcessSnapshot

// 结束单个进程（M1）；结束进程树（M2）
kill_process(pid: u32) -> KillResult
kill_tree(pid: u32) -> KillResult

// 杀前评估（M2）：孤儿判定 + 安全分级 + 影响面
assess_process(pid: u32) -> KillAssessment
```

- 刷新策略（M1）：前端手动刷新 + 固定 2s 轮询；M3 再做增量/事件化优化。
- 错误路径：进程在采集后已退出、权限不足（`AccessDenied`）是常态错误，统一返回结构化错误并在行内/通知中提示，不弹崩溃式报错。
- 权限：默认普通权限运行；结束高权限进程失败时提示"需要管理员权限"，M3 再考虑提权入口。

### 5.3 工程结构

```text
gprocess/
├─ src/                    前端（React）
│    ├─ app/               应用壳、导航、顶栏
│    ├─ pages/processes/   进程页
│    ├─ pages/ports/       端口页
│    ├─ components/        本地组件层（Button/Dialog/Table…，shadcn 风格）
│    └─ lib/               api 封装（invoke）、格式化、过滤逻辑
├─ src-tauri/              Rust 后端
│    ├─ src/snapshot.rs    进程+端口采集
│    ├─ src/assess.rs      孤儿判定与杀前评估（M2）
│    └─ src/kill.rs        结束进程/进程树
└─ docs/
     ├─ design-spec.md     本文
     ├─ plans.md           总体里程碑计划
     └─ plan/m{N}/         各里程碑 README / tasks / design
```

## 6. 验收标准（产品级）

1. 打开应用 2 秒内看到完整进程列表与 LISTEN 端口列表，列信息足以定位"谁占了端口"。
2. 孤儿判定在典型场景（终端关闭后遗留 node dev server）下命中，且 PID 复用不误报。
3. 任意进程的杀前评估可在 1 次点击内看到，系统关键进程无法被杀。
4. 视觉通过 `workbench-design-system.md` 第 8 节复刻检查清单。
5. 连续运行 30 分钟（2s 轮询）无明显卡顿与内存增长。
