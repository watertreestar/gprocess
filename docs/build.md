# 构建与发版

> 本文记录 gprocess 的本地构建、安装包打包与工具链准备。环境一次性配置后，日常发版只需一条命令。

## 1. 环境依赖（一次性）

| 依赖 | 说明 | 验证 |
| --- | --- | --- |
| Node.js + npm | 前端构建 | `node -v` / `npm -v` |
| Rust stable（x86_64-pc-windows-msvc） | Tauri 后端 | `rustc --version` |
| Visual Studio Build Tools | MSVC 链接器（cargo build 需要） | vswhere 可查 |
| WebView2 Runtime | 应用运行时（Win11 一般自带） | `Program Files (x86)\Microsoft\EdgeWebView` |

网络提示：rustup / crates.io / GitHub 直连可能极慢。

- Rust 工具链：`RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static rustup default stable`
- crates：项目已内置 rsproxy 镜像（`src-tauri/.cargo/config.toml`）
- GitHub 下载：用加速镜像替换前缀，如 `https://gh-proxy.com/https://github.com/...`

## 2. 打包工具链（一次性，bundler 自动校验）

tauri-bundler 在打包时校验固定缓存目录下的工具链，缺文件会**清空目录并尝试从 GitHub 重下**（网络差时必然失败），因此需手动部署。

### 2.1 NSIS（打 `*-setup.exe` 用）

目标目录：`%LOCALAPPDATA%\tauri\NSIS\`（即 `C:\Users\<user>\AppData\Local\tauri\NSIS\`）

1. 下载 `nsis-3.11.zip`（tauri-apps/binary-releases），解压后把 `nsis-3.11/` 的内容放进 `NSIS\`，使 `NSIS\makensis.exe` 存在
2. 下载插件 `nsis_tauri_utils.dll`（tauri-apps/nsis-tauri-utils, `nsis_tauri_utils-v0.5.3`），放到 `NSIS\Plugins\x86-unicode\additional\nsis_tauri_utils.dll`
   - SHA1 必须为 `75197FEE3C6A814FE035788D1C34EAD39349B860`

bundler 必需文件清单：`makensis.exe`、`Bin/makensis.exe`、`Stubs/lzma-x86-unicode`、`Stubs/lzma_solid-x86-unicode`、`Plugins/x86-unicode/additional/nsis_tauri_utils.dll`、`Include/{MUI2,FileFunc,x64,nsDialogs,WinMessages}.nsh`、`Include/Win/{COM,Propkey,RestartManager}.nsh`

### 2.2 WiX 3.14（打 `.msi` 用）

目标目录：`%LOCALAPPDATA%\tauri\WixTools314\`

1. 下载 `wix314-binaries.zip`（wixtoolset/wix3, tag `wix3141rtm`）
   - SHA256 必须为 `6AC824E1642D6F7277D0ED7EA09411A508F6116BA6FAE0AA5F2C7DAA2FF43D31`
2. 解压到 `WixTools314\`，确保 `candle.exe` **直接**位于该目录下（不要多套一层子目录）

bundler 必需文件清单：`candle.exe(.config)`、`light.exe(.config)`、`darice.cub`、`wconsole.dll`、`winterop.dll`、`wix.dll`、`WixUIExtension.dll`、`WixUtilExtension.dll`。WiX 运行于 .NET 4.x，Win11 自带 .NET 4.8 即可。

## 3. 日常构建命令

```bash
npm install            # 首次或依赖变更
cargo test             # 后端单测（src-tauri 目录）
cargo clippy           # 静态检查
npm run build          # 前端类型检查 + 产物（tsc --noEmit && vite build）
```

## 4. 发版打包

```bash
# 1. 改版本号（两处保持一致）
#    src-tauri/tauri.conf.json  → "version"
#    src-tauri/Cargo.toml       → [package] version

# 2. 关闭正在运行的 gprocess.exe（否则 exe 被占用链接失败）
taskkill //IM gprocess.exe //F

# 3. 打包（nsis / msi 可单选）
npm run tauri build -- --bundles nsis,msi
```

产物：

- `src-tauri/target/release/bundle/nsis/gprocess_<ver>_x64-setup.exe`（当前用户安装，免管理员，推荐个人使用）
- `src-tauri/target/release/bundle/msi/gprocess_<ver>_x64_en-US.msi`（标准 MSI，适合企业分发）

## 5. 已知坑（踩过）

1. **bundle.icon 必须包含 `.ico`**：MSI 打包强制要求，缺则报 `Couldn't find a .ico icon`
2. **工具链目录校验失败会被清空重建**：手动部署 NSIS/WiX 后若仍报 missing，对照上文必需文件清单逐个检查（常见于插件 dll 缺失或多套了一层目录）
3. **debug 版 exe 不能直接运行**：debug 构建走 devUrl（需要 vite dev server）；独立运行请用 release 构建 `src-tauri/target/release/gprocess.exe`
4. **`cargo build` 与 `tauri build` 都会嵌入 `dist/`**：发版前确保 `npm run build` 产物是最新的（`tauri build` 会自动执行 `beforeBuildCommand`）
