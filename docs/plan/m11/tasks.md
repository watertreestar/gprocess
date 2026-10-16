# M11 任务清单

- [x] settings.ts：Settings 增加 skippedVersion 字段（默认 null）
- [x] UpdateDialog.tsx：available / downloading / error 三态弹窗（版本说明、下载进度、跳过/稍后/下载安装）
- [x] App.tsx：启动延迟静默检查（错误吞掉、跳过版本抑制、ref 防重复）
- [x] App.tsx：手动检查入口状态与弹窗编排（手动检查忽略跳过）
- [x] SettingsPage.tsx：移除内联检查/安装逻辑，接入 App 弹窗流程（检查中 spinner、新版本可用提示）
- [x] npm build（tsc）验证
- [x] dev 启动行为核验（静默不打扰；dev 端口 1420 落入系统保留段，已迁移 14200）
- [x] 签名密钥：生成新密钥对（~/.tauri/gprocess-v2.key）、更新 pubkey、签名构建产出 .sig 验证通过
- [ ] 发布 v0.1.1：CI 签名构建与 latest.json 上传成功
- [ ] 在已安装的 0.1.0（新公钥）客户端验证检查、下载、安装和重启
