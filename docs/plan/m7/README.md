# M7 孤儿来源分类

## 目标

在 M6（父身份记忆 + 启动器降级 + 豁免）基础上进一步降低误报：用 Windows 上"有意守护"的**显式注册机制**识别正常后台进程，把孤儿视图收敛到真正的终端/IDE 遗留。核心反馈："依然很多后台正常进程"。

## 设计依据

纯结构判定（父死=孤儿）在 Windows 上有天然上限——父进程退出是常态（DCOM 启动器、快捷方式、更新器）。Windows 存在显式的"有意后台"注册机制，是最权威的意图信号：SCM 服务、计划任务、Run 键/启动文件夹。参考：Process Explorer 不做孤儿判定；macOS 对应物是 launchd 显式注册。

## 范围（四个来源/活跃度信号）

1. **系统路径降级**：exePath 在 `%WINDIR%` 下 → `expected`（系统组件），覆盖 RuntimeBroker/dllhost/conhost 等基础设施
2. **SCM 服务识别**：`EnumServicesStatusExW` 取服务→PID 映射，命中 → `expected`（Windows 服务）
3. **启动项匹配**：exePath 命中 HKCU/HKLM Run 键（含 RunOnce）→ `expected`（开机启动项）
4. **活跃度信号**：持有非本机 ESTABLISHED 连接数进入 OrphanInfo，confirmed 排序降权 + 详情提示（降分不降级）

服务与启动项集合带 30s TTL 缓存，避免每次快照全量枚举。

## 非目标

- Authenticode 签名信任（性能成本高，观察 M7 效果后再定）
- ETW/WMI 进程创建事件（需常驻高权限会话）
- 计划任务来源识别（父链追踪成本高，观察后补）
- 启动文件夹 .lnk 解析（仅做 Run 键；lnk 需 IShellLink，性价比低）

## 验收标准

1. `C:\Windows\` 下的系统进程（如 RuntimeBroker）即使父已退出也标 `expected`，不进孤儿计数
2. Windows 服务进程（如 spoolsv）标 `expected`（Windows 服务）
3. Run 键注册的程序（如 OneDrive）标 `expected`（开机启动项）
4. 终端遗留的 runtime 进程仍 `confirmed`；有活跃外部连接的 confirmed 在孤儿视图中排序靠后，详情提示连接数
5. 孤儿视图「来源未知」（面板启动前已孤儿）排在「来源已知」之后；进程行父进程列可显示已退出的父名
6. `cargo test` / `cargo clippy -D warnings` / `npm run build` 全绿
