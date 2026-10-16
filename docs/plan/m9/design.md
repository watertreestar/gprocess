# M9 设计

## 背景与问题定位（实测数据）

用户机器实测（Win32_Process 全量快照）：

- 受保护进程在非提权下 `ExecutablePath` 为空：`csrss.exe`、`wininit.exe`、`winlogon.exe` 等。现有降级链 = {路径在 %WINDIR%, SCM 服务, Run 键, 已知启动器}，这些进程四项全不命中 → 误判 confirmed。
- runtime 进程的 cmdline 携带完整身份（`node ...\vite\bin\vite.js`、`node ...\npm-cli.js run dev`），但判定只用了进程名，父退出后无从追溯启动者。

两个缺口均为确定性信号缺失，补信号即可，不引入模型。

### 附带根因：sysinfo 默认不刷新 cmd/user

验证中发现 sysinfo 的 `refresh_processes` 默认刷新项不含 `cmd` 与 `user`（属 UpdateKind 门控项），导致进程 cmdline 与用户字段一直是空——详情页命令行展示同样受影响。改用 `refresh_processes_specifics` + `ProcessRefreshKind`（`with_cmd`/`with_user`，`OnlyIfNotSet` 只取一次）。`handles.rs` 的 enrich 同因修复。

## 方案

### 1. 系统进程名名单

- `SYSTEM_NAMES`：约 30 个 Windows 会话关键进程 / 受保护进程 / 常见系统宿主（csrss、wininit、winlogon、conhost、WmiPrvSE、SearchIndexer、dllhost、RuntimeBroker、TabTip 等，全小写）。
- `attach_orphan` 降级链顺序变为：豁免 > 系统路径 > SCM 服务 > **系统名名单** > 启动项 > 启动器 > confirmed。命中名单 → expected + origin=System。服务枚举是更强的信号，名单只兜底服务枚举未覆盖的受保护进程。
- 名单按名字匹配不依赖 exe 路径，非提权同样生效。
- `KNOWN_LAUNCHERS` 补 `smss.exe`（会话管理器拉起 csrss/wininit/winlogon，属正常守护）。

### 2. runtime 脚本标记

- `extract_script_label(cmdline) -> Option<String>`：仅对 `RUNTIME_NAMES` 进程调用。取第一个非 flag 参数：
  - 是路径且包含 `node_modules` 段 → 取该段后第一个包名（`@scope/pkg` 取两段），如 `...\node_modules\vite\bin\vite.js` → `vite`，`...\npm-cli.js` → `npm`；
  - 其他路径 → 取文件名，如 `server.py`；
  - 非路径参数 → 原样（如 `-m uvicorn` 场景取 `uvicorn`）。
- 存储：
  - `ProcessInfo.script: Option<String>`：进程自身运行的脚本（collect_processes 填充）。
  - `ParentRef.parent_script: Option<String>`：父身份记忆对 runtime 父进程记录其脚本（refresh_parent_history 填充）。
  - `OrphanInfo.parent_script: Option<String>`：孤儿文案用（attach_orphan 从历史取）。
- 前端：
  - 详情概要区新增「启动脚本」行（process.script）。
  - 孤儿文案：`父进程 node.exe（agent-browser）已退出，该进程在后台遗留运行。`
- 脚本标记只做展示与归因，**不改判定**：父退出后残留的 runtime 进程仍是 confirmed。

## 边界与权衡

- 名单误伤：伪装成系统进程名的用户进程会被降级为 expected。仅影响孤儿视图与文案，杀前安全评估（四级分级）不受影响，风险可接受；Process Explorer 等成熟工具同样采用名名单。
- 不用用户账户（SYSTEM 账户）作降级信号：非提权下 `user` 字段常为 None，信号不稳定；名名单在两种模式下都可用。
- 脚本标记门控在 `RUNTIME_NAMES`（进程名），避免对 exe 类进程做无意义的 cmdline 解析。
