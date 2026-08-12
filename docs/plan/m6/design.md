# M6 设计：孤儿判定准确性

## 1. 三级状态模型

```
none      父进程存活，或被用户豁免
expected  父已退出，但父身份是已知系统启动器 → 正常守护，不算孤儿
confirmed 父已退出（或父 PID 被复用），且父身份不是系统启动器 → 疑似孤儿
```

`expected` 与 `confirmed` 都是"结构上父已退出"，区别只在**父进程是谁**。这要求回答一个此前无法回答的问题：父进程死后，它是谁？

## 2. 父进程身份记忆

`SnapshotState` 增加：

```rust
pub struct ParentRef { pub child_start: i64, pub parent_name: String }
pub parent_history: Mutex<HashMap<u32, ParentRef>>  // key = 子进程 pid
```

每次快照（`snapshot` 命令）在采集后调用 `refresh_parent_history`：

1. **清理**：子 pid 已退出、或子 start_time 变化（PID 被复用）→ 删除记录
2. **记录**：父 pid 在当前进程表中存活 → 写入/更新 `pid → {child_start, 父进程名}`
   （父存活期间我们总能看到父名；父死后记录保留，供判定使用）

容量有界：记录数 ≤ 存活进程数，每次快照自清理。

**局限（如实说明）**：面板启动前就已经孤儿的进程，父身份无法回溯 → `parent_name = None`，保持 `confirmed` 并提示"父进程身份未知"。随面板常驻运行（M4 托盘/自启），覆盖率随时间提升。

## 3. 启动器降级

```rust
const KNOWN_LAUNCHERS: &[&str] = &[
    "explorer.exe", "svchost.exe", "services.exe", "wininit.exe",
    "winlogon.exe", "taskhostw.exe", "sihost.exe", "userinit.exe",
];
```

`confirmed` 且 `parent_name` 命中名单 → 降级为 `expected`。依据：这些是 Windows 启动应用/服务的标准路径（Explorer 桌面与开始菜单、DCOM 启动器、SCM），父进程退出属设计行为。

刻意**不**把 cmd.exe / powershell.exe / WindowsTerminal.exe / code.exe 列入——终端与编辑器退出后遗留 runtime 进程正是本工具的核心场景。

## 4. 用户豁免名单

- settings 增加 `orphanExcludes: string[]`（exe 名小写精确匹配，如 `"node.exe"`）
- `attach_orphan` 最后一步：进程名命中豁免 → `status = none`（覆盖一切判定）
- 入口一：详情侧栏孤儿判定区「标记为有意后台进程」/「取消豁免」
- 入口二：设置页「孤儿判定」区块管理名单

## 5. 数据流变更

```
settings.orphanExcludes ─┬─ useSnapshot → invoke snapshot(thresholdMin, excludes)
                         └─ assessProcess(pid, thresholdMin, excludes)
```

`expected` 进程：不进孤儿过滤视图、不计入孤儿计数、不触发长时间孤儿通知（watchdog 只看 `confirmed`）。

## 6. 兼容性说明

- `OrphanInfo` 新增 `parentName` 字段、`status` 新增 `"expected"` 值：纯新增，前端类型同步更新
- 命令参数 `excludes: Option<Vec<String>>`：可缺省，向后兼容调用
- 按 AGENTS.md 无持久化格式迁移负担（豁免名单是新增字段，默认空）
