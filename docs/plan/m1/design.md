# M1 设计：端到端骨架

## 实现路径

```text
sysinfo + netstat2（Rust）
  → snapshot() Tauri command（单次全量快照）
    → 前端轮询 hook（手动 + 2s）
      → 进程页 / 端口页共享同一份快照
        → 详情侧栏 → 确认 Dialog → kill_process(pid)
```

## 后端设计（src-tauri）

### 数据模型（serde 序列化到前端）

```rust
struct ProcessSnapshot {
    processes: Vec<ProcessInfo>,
    ports: Vec<PortBinding>,
    captured_at: i64,          // unix ms
}

struct ProcessInfo {
    pid: u32,
    ppid: Option<u32>,
    name: String,
    exe_path: Option<String>,
    cmdline: Vec<String>,
    start_time: i64,           // unix ms
    cpu_percent: f32,
    memory_bytes: u64,
    user: Option<String>,
    status: String,
}

struct PortBinding {
    protocol: Protocol,        // Tcp | Udp
    local_addr: String,
    local_port: u16,
    state: Option<String>,     // TCP 才有状态；UDP 为 None
    pid: u32,
}

enum KillError { NotFound, AccessDenied, Failed(String) }
```

### 采集要点

- `sysinfo::System` 实例复用（command 内由后端持有 `Mutex<System>`），`refresh_processes` 两次采样间隔取 CPU；端口每次全量重采（开销小）。
- `cmdline` 取 `process.cmd()`，前端 join 展示；空命令行的系统进程正常展示为空。
- 端口 ↔ 进程在**前端**按 pid join，后端不做耦合。

### kill_process

- `sysinfo::Process::kill()`；杀前重新校验进程存在，映射 `KillError`。
- 不做任何安全分级（M2 才引入 `assess`），但确认 Dialog 必须展示命令行与影响端口，让用户自己判断。

## 前端设计（src）

### 状态与数据流

- 单一 `useSnapshot` hook：持有最新快照、`refresh()`、2s 轮询（页面不可见时暂停）。
- 进程页与端口页共用 hook（提升到 App 层），保证跨页跳转时数据一致。
- 选中态：`selectedPid` 存 URL query，跨页跳转即改写 query。

### 进程页布局

- 工具行：搜索 Input（32px）+ 排序 Select。
- 数据行 36px，列宽固定 + 命令行列 `flex-1 truncate`；`react` 原生手写虚拟滚动或 `@tanstack/react-virtual`（优先用成熟库）。
- 详情侧栏 300px 左边线；未选中显示 `tool-empty-state`。

### 端口页布局

- 默认只显示 LISTEN；Tabs 过滤 全部/TCP/UDP。
- "释放端口"按钮复用结束进程确认 Dialog（属主进程作为目标）。

### 确认 Dialog

- 浮层变体（`rounded-md` + `shadow-lg`，最大 512px）。
- 内容：目标进程名 + PID（mono）、命令行摘要、占用端口列表、警告文案。
- 失败结果用行内通知（toast/inline alert）："进程已退出" / "权限不足，需要管理员运行"。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| Windows 下部分进程 cmdline 读取权限不足 | 字段可空，UI 显示进程名兜底 |
| 2s 轮询全量快照卡顿 | 先测 300+ 进程规模；虚拟滚动保底；M3 再优化增量 |
| netstat2 需要管理员权限才能看全部进程端口 | 普通权限下仅能看部分；文档注明，M3 提供提权入口 |
