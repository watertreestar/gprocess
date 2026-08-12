# M2 设计：孤儿判定与杀前评估

## 评估管线

```text
assess_process(pid)
  ├─ 1. 定位目标进程（不存在 → NotFound）
  ├─ 2. 孤儿判定 orphan_verdict()
  │     ├─ ppid 不在进程表 → confirmed
  │     └─ ppid 存在但父 start_time > 本进程 start_time → confirmed + pid_reused
  ├─ 3. 子孙树构建（ppid 索引，DFS）
  ├─ 4. 安全分级 classify()
  │     ├─ 关键进程名单 / 本应用自身 → forbidden
  │     ├─ 高权限账户（SYSTEM 等）/ svchost 等共享宿主 → danger
  │     ├─ 有子进程 / 持 LISTEN 端口 / 运行 < 1min → caution
  │     └─ 其他 → safe
  └─ 5. 汇总 KillAssessment（level + reasons[] + children[] + owned_ports[]）
```

## 关键实现决策

### 孤儿判定

- 判定**纯函数**：输入 `&HashMap<Pid, ProcessInfo>` + 目标 pid，输出 `OrphanVerdict`，便于单测。
- `pid_reused` 排除是 Windows 正确性的关键：`ppid` 在父退出后残留，仅靠"ppid 存在"会大量漏报。比较双方 `start_time` 即可识别复用（父比子晚启动，逻辑上不可能是真父）。
- 启发式（runtime 名单、LISTEN 端口、运行时长 > 30min）只影响**排序与展示优先级**，不改变 confirmed 判定，避免误报争议。

### 安全分级

- 关键进程名单硬编码常量（`System`、`Registry`、`smss.exe`、`csrss.exe`、`wininit.exe`、`services.exe`、`winlogon.exe`、`lsass.exe`、`fontdrvhost.exe`、`dwm.exe`），外加本应用自身 pid。
- `danger` 与 `caution` 可以叠加理由，级别取最高；reasons 保留全部命中项，逐条展示——**可解释性是这个功能的卖点**。

### kill_tree

- 自底向上（叶子 → 根）依次 `kill()`，单个失败不中断整棵树，返回 `KillResult { succeeded: Vec<u32>, failed: Vec<(u32, KillError)> }`。
- 结束后由前端触发一次 `snapshot()` 刷新。

## 前端交互

### 进程树组件

- 侧栏内紧凑树：父链向上最多 3 层（超出省略），子孙树全量缩进展示，行高 28px，mono PID。
- 点击树中节点切换 `selectedPid`，复用同一侧栏。

### Dialog 分级行为

| 级别 | 行为 |
| --- | --- |
| `forbidden` | 不弹 Dialog；按钮禁用 + Tooltip「系统关键进程，禁止结束」 |
| `danger` | Dialog 内 Input 要求输入 PID 数字，匹配后主按钮才可点 |
| `caution` / `safe` | 标准确认 Dialog，展示影响面与理由 |

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 高权限账户枚举在普通权限下失败 | user 字段可空时降级为"未知"，不升级级别，仅展示 |
| 进程树规模大（数百子孙）导致 Dialog 过长 | 影响面只列前 10 个子进程 + 计数；树组件内部滚动 |
| 误标孤儿引发误杀 | 级别与理由显式可见；danger/caution 强制确认；不引入"一键清理全部孤儿"（M3 再评估） |
