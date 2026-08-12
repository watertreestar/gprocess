# M7 设计：孤儿来源分类

## 1. 判定流水线（attach_orphan 内，自上至下短路）

```
进程名命中豁免名单            → none（M6 已有）
结构判定父存活                → none
结构判定父死/父 PID 复用：
  exePath 在 %WINDIR% 下      → expected(origin=system)     系统组件
  pid 命中 SCM 服务映射        → expected(origin=service)    Windows 服务
  exePath 命中 Run 键启动项    → expected(origin=autostart)  开机启动项
  父身份是已知系统启动器        → expected(origin=launcher)   （M6 已有）
  其余                        → confirmed
```

刻意不做：签名信任（成本）、ETW（常驻会话）、计划任务（父链追踪）。

## 2. 三个来源信号的实现

### 2.1 系统路径

`is_system_path(exe_path)`：`exe_path` 规范化（小写、正斜杠）后以规范化 `%WINDIR%` 为前缀。覆盖系统基础设施进程（RuntimeBroker/dllhost/conhost/WmiPrvSE/backgroundTaskHost 等），不需要维护名单。

### 2.2 SCM 服务

`EnumServicesStatusExW`（SC_ENUM_PROCESS_INFO + SERVICE_WIN32 + SERVICE_STATE_ALL）枚举服务→PID。非管理员通常也可枚举；失败返回空集（不降级，保持 confirmed，宁可误报不漏判断依据）。

### 2.3 启动项

读注册表 Run 键（HKCU/HKLM × Run/RunOnce，共 4 个），解析值中的 exe 路径：

- 先 `ExpandEnvironmentStrings` 展开 `%ProgramFiles%` 等
- 引号包裹：取引号内；否则截到 `.exe` 出现处（`extract_exe_path` 纯函数，可单测）
- 与进程 exePath 规范化后比较（小写、统一斜杠）

启动文件夹 .lnk 不做（需 IShellLink 解析，性价比低，文档声明）。

### 2.4 缓存

服务 PID 集与启动项路径集放入 `SnapshotState`，`Instant + 30s TTL`：服务安装/启动项变更频率低，避免每次快照枚举注册表与 SCM。

## 3. 活跃度信号

- `PortBinding` 增加 `remote_addr`（TCP 有效）
- 快照统计每个 pid 的**非本机** ESTABLISHED 连接数（remote 非 127.0.0.1 / ::1 / 0.0.0.0 / ::）→ `OrphanInfo.external_connections`
- 语义：**降权不降级**——有活跃外部连接说明仍被使用，confirmed 排序靠后 + 详情提示；localhost 连接不算（浏览器连本地 dev server 是遗留的常见形态）

## 4. 前端呈现

- 孤儿视图排序：`confirmed` 按 score 降序 → 来源未知（parentName=null）靠后 → 有外部连接靠后
- 进程行父进程列：父死时显示历史父名 + （已退出），不再只有 `#pid`
- 详情 expected 文案按 origin 区分：系统组件 / Windows 服务 / 开机启动项 / 系统启动器拉起
- confirmed 详情增加：`仍有 N 条活跃外部连接，可能仍在被使用`

## 5. 失败降级原则

所有来源信号采集失败（权限/注册表读取异常）→ 视为未命中，保持 `confirmed`。即"宁可标孤儿，不假装正常"——用户可在详情里看到完整判断依据并一键豁免。
