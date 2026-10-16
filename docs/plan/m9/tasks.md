# M9 任务清单

- [x] snapshot.rs：SYSTEM_NAMES 名单降级（expected + System），KNOWN_LAUNCHERS 补 smss.exe
- [x] snapshot.rs：extract_script_label 从 cmdline 提取脚本标记（node_modules 包名规则）
- [x] snapshot.rs：ProcessInfo.script 填充；ParentRef 增加 parent_script；OrphanInfo 增加 parent_script
- [x] attach_orphan 填充 parent_script（父身份记忆对 runtime 父进程记录脚本）
- [x] 根因修复：refresh_processes_specifics + process_refresh_kind（默认不刷新 cmd/user）；handles.rs enrich 同修
- [x] 前端 types.ts 加 script/parentScript 字段
- [x] ProcessesPage 列表：名称列脚本后缀 + 父列脚本标记；ProcessDetail「启动脚本」行与孤儿文案父脚本标记
- [x] 单测：系统名单降级、脚本提取（包名/作用域包/npm/普通路径/非路径参数）、父脚本记忆
- [x] cargo test（47 通过）/ clippy / npm build 验证
- [x] 实机诊断验证：非提权快照中系统进程不再误判；node 进程脚本标记正确提取（npm / vite）
- [ ] release 构建启动人工验收
- [ ] 文档勾选 + plans.md + 提交
