# M11 设计：自动更新检查

## 背景

M4 已接入 updater 插件（`tauri_plugin_updater` 在 `lib.rs` 初始化，pubkey / endpoints 指向 GitHub Releases `latest.json`），并在设置页提供了手动「检查更新 / 下载并安装」的内联入口。本里程碑补上自动检查与完整交互：启动静默检查、弹窗确认、下载进度、跳过版本持久化。

## 方案总览

前端为主，复用现有依赖：

- 检查：`check()`（`@tauri-apps/plugin-updater` JS API）→ `Update | null`
- 安装：`update.downloadAndInstall(onEvent)`，`DownloadEvent` 提供 Started（contentLength）/ Progress（chunkLength）/ Finished
- 重启：安装完成后 `relaunch()`（`@tauri-apps/plugin-process`，依赖已有）
- 跳过版本：`Settings.skippedVersion` 字段，随 settings.json 原子写持久化

## 状态编排

- **App.tsx** 持有 `update`（Update 实例）/ `updateOpen` / `updateChecking`，弹窗全局仅一份
- **UpdateDialog.tsx** 内部三态：`available`（版本说明 + 三按钮）/ `downloading`（进度条）/ `error`（重试）
- 每次打开弹窗重置内部状态

## 启动自动检查

- 条件：`isTauri` 且 settings 已加载（需要 skippedVersion 比较）
- 时机：settingsLoaded 后延迟 8 秒执行一次，ref 防重复（避免 StrictMode / 设置变更重触发）
- 抑制规则：`update.version === settings.skippedVersion` 时静默；无更新、检查异常同样静默
- 手动检查（设置页按钮）：忽略跳过版本；无更新 / 失败时 toast 反馈

## 边界与降级

- **开发环境**：非 Tauri（浏览器）直接跳过；`tauri dev` 下 endpoint 无 release 时 check 抛错 → 启动检查静默、手动检查 toast
- **下载进度**：contentLength 缺失时进度条显示不确定态
- **签名缺失**：`createUpdaterArtifacts` 需要 `TAURI_SIGNING_PRIVATE_KEY`；未配置时构建不生成 latest.json/.sig，端到端验证受限（发布侧问题，非本里程碑代码缺陷）

## 发布注意事项（供后续 release 流程）

1. 生成密钥对：`npx tauri signer generate -w <路径>`（私钥妥善保管，建议存 CI Secret）
2. 更新 `tauri.conf.json` 中 `plugins.updater.pubkey` 为新的公钥（生成时同步输出的 `.pub` 文件内容）
3. 构建时设置环境变量（实机验证通过的方式）：
   - `TAURI_SIGNING_PRIVATE_KEY`：密钥文件**内容**（`$(cat <key>)`，传文件路径不生效）
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：无密码密钥必须显式设为空字符串，否则签名步骤阻塞等待密码输入
4. 产物：安装包 + 同名 `.sig`；`latest.json` 需在发布时手工生成（含 version/notes/pub_date/platforms[windows-x86_64].signature/.url，signature 为 .sig 文件内容 base64），与安装包、.sig 一起上传到 GitHub Release 资产
