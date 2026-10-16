# M11 任务清单

- [x] settings.ts：Settings 增加 skippedVersion 字段（默认 null）
- [x] UpdateDialog.tsx：available / downloading / error 三态弹窗（版本说明、下载进度、跳过/稍后/下载安装）
- [x] App.tsx：启动延迟静默检查（错误吞掉、跳过版本抑制、ref 防重复）
- [x] App.tsx：手动检查入口状态与弹窗编排（手动检查忽略跳过）
- [x] SettingsPage.tsx：移除内联检查/安装逻辑，接入 App 弹窗流程（检查中 spinner、新版本可用提示）
- [x] npm build（tsc）验证
- [x] dev 启动行为核验（静默不打扰；dev 端口 1420 落入系统保留段，已迁移 14200）
- [ ] 发布侧：签名密钥配置 + 测试 release 端到端验证（依赖用户配置 TAURI_SIGNING_PRIVATE_KEY）
