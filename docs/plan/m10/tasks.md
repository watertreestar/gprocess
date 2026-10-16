# M10 任务清单

- [x] feedback.rs：FeedbackSample 结构（标签/备注/时间戳/ProcessInfo/listen 端口数/阈值）
- [x] append_sample 纯函数：JSONL 追加写 + 返回行数（temp 目录可单测）
- [x] record_feedback 命令：复用 snapshot 判定管线采集进程特征，注册到 lib.rs
- [x] 前端 types.ts：FeedbackLabel 类型；api.ts：recordFeedback 封装
- [x] ProcessDetail：孤儿判定区「判定有误」按钮 + 标签选择 Dialog（含备注、未选标签禁用提交）
- [x] 提交成功内联展示累计样本数
- [x] 单测：append_sample 追加/计数/多行
- [x] cargo test / clippy / npm build 验证 + 实机写一条样本核验 JSONL
- [x] 文档勾选 + plans.md
- [ ] 提交
