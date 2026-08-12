# M8 设计：文件句柄占用查找

## 技术选型

用 Windows **Restart Manager API**（rstrtmgr.dll）：

- `RmStartSession` → `RmRegisterResources`（注册文件路径）→ `RmGetList`（两段式取占用进程列表）→ `RmEndSession`
- 这是安装程序（MSI）查文件占用的官方机制，稳定、文档化、无需驱动
- 否决方案：`NtQuerySystemInformation(SystemHandleInformation)` 枚举全系统句柄——需要未公开结构、反复重试缓冲、定位对象需打开进程句柄逐个比对，脆弱且对高权限进程几乎必然失败

windows crate 0.61.3 已验证签名（本地 registry 源码）：

- `RmStartSession(*mut u32, Option<u32>, PWSTR) -> WIN32_ERROR`
- `RmRegisterResources(u32, Option<&[PCWSTR]>, Option<&[RM_UNIQUE_PROCESS]>, Option<&[PCWSTR]>) -> WIN32_ERROR`
- `RmGetList(u32, *mut u32, *mut u32, Option<*mut RM_PROCESS_INFO>, *mut u32) -> WIN32_ERROR`
- `RmEndSession(u32) -> WIN32_ERROR`
- `RM_PROCESS_INFO`：含 `Process.dwProcessId`、`strAppName[256]`、`strServiceShortName[64]`、`ApplicationType`、`AppStatus`、`bRestartable`
- `CCH_RM_SESSION_KEY = 32`，session key 缓冲需 33 个 u16（含 NUL）

## 查询流程

1. 路径转 UTF-16（`HSTRING` / 手动 wide），校验文件存在性交给 RM（不存在即无占用，返回空）
2. `RmStartSession` 拿 session handle
3. `RmRegisterResources` 注册单个文件路径（`&[PCWSTR]`，长度 1）
4. `RmGetList` 第一次调用 `rgaffectedapps=None`，得 `nProcInfoNeeded`；为 0 直接返回空
5. 按 needed 分配 `Vec<RM_PROCESS_INFO>`，第二次调用取数据
6. `RmEndSession`（无论成败，用作用域守卫保证）
7. 对每个 PID，用 `SnapshotState.system` 刷新后补充 exe_path / user / status（RM 只给 appName 和服务名）

## 降级策略

- RM 查不到的高权限/跨用户占用：返回能查到的部分，不报错；空结果提示「没有进程占用该文件（或占用进程权限过高无法查询）」
- 任意 RM 步骤返回非零 WIN32_ERROR：返回 `Err(String)`，前端 toast 提示

## 数据结构

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandleLocker {
    pub pid: u32,
    pub app_name: String,      // RM strAppName
    pub exe_path: Option<String>,
    pub user: Option<String>,
    pub status: String,
    pub is_service: bool,      // strServiceShortName 非空
    pub restartable: bool,
}
```

## 前端

- `PageId` 加 `"handles"`；Sidebar 第四项「句柄」（lucide `FileSearch`）
- HandlesPage 仿 PortsPage 布局：顶部输入框 + 查询按钮（Enter 触发），结果用 workbench token 的列表行
- 行操作：「查看」→ `onViewProcess(pid)`；「结束…」→ 从 `byPid` 取 ProcessInfo 调 `onKill(process, "single")`
- 无自动刷新，查询是显式动作

## 测试

确定性测试：创建临时文件并保持 `File` 打开 → 调查询函数 → 断言结果包含 `std::process::id()`。无需管理员权限（查自己进程的句柄 RM 可见）。
