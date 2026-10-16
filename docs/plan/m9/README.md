# M9 孤儿判定信号补全

## 目标

修复 M6/M7 人工验收反馈的两个判定缺口：

1. **系统级进程被误判为孤儿**：csrss/wininit/winlogon 等受保护进程在非提权下读不到 exe 路径，现有「系统路径」降级信号失效，导致它们被标为 confirmed。
2. **runtime 进程无来源标记**：node/python 等进程被判为孤儿时只显示「父进程 node.exe/bash.exe 已退出」，无法看出真实启动者（如 agent-browser、vite）。

结论（实测验证）：两类问题均为确定性信号缺失，不需要引入本地模型。

## 范围

- 新增系统进程名名单：confirmed 孤儿命中名单 → expected + 来源 system（不依赖 exe 路径可读性）
- `KNOWN_LAUNCHERS` 补充 `smss.exe`（会话启动器）
- runtime 进程从 cmdline 提取脚本标记（如 `vite`、`npm`、`agent-browser`），在详情展示
- 父身份记忆对 runtime 父进程同时记录脚本标记，孤儿文案显示「父进程 node.exe（agent-browser）已退出」
- 不做：脚本标记不改变孤儿判定（父退出后残留的 runtime 进程仍为 confirmed）、不引入模型/在线服务

## 验收标准

- [ ] 非提权运行 gprocess，孤儿视图中不再出现 csrss/wininit/winlogon/conhost 等系统进程
- [ ] 选中运行中的 node 进程（如 vite dev server），详情显示「启动脚本: vite」
- [ ] 某 node 脚本（如 agent-browser）退出后残留的子进程，详情显示「父进程 node.exe（agent-browser）已退出」
- [ ] 脚本标记对非 runtime 进程不出现
- [ ] cargo test / clippy / npm build 全绿

## 已知限制

- 系统进程名名单为静态名单：新系统组件名需手动补充；伪装成系统进程名的进程会被降级（仅影响孤儿展示，不影响杀前安全评估）
- 脚本标记按进程名（node/python/...）门控，改名运行的 runtime 不识别
