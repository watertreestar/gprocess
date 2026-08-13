# gprocess

Windows 进程与端口管理面板。Agent 时代，开发机上到处都是被遗忘的孤儿进程和被占用的端口——gprocess 帮你**看清楚、判准确、放心杀**。

基于 Tauri 2 + React 19 + Rust，单 exe 约数 MB，系统托盘常驻。

## 功能

- **进程总览**：实时 CPU / 内存 / 启动时间 / 运行时长，排序筛选，虚拟滚动
- **孤儿进程判定**：父进程退出或 PID 复用识别；系统路径 / SCM 服务 / 开机启动项 / 已知启动器自动降级为「正常守护」；支持用户豁免名单，只把真正可疑的留给你
- **端口占用**：TCP/UDP 绑定清单，LISTEN 过滤，关注端口置顶，一键跳进程
- **文件句柄查找**：文件删不掉？输入路径查出占用进程（Restart Manager API）
- **杀前安全评估**：四级分级（可安全结束 / 需谨慎 / 高风险 / 禁止结束），结束前列出子进程与持有端口，支持结束进程树
- **灵动岛告警**：主窗口顶部 macOS 风格胶囊，超高 CPU / 长时间孤儿进程告警，可直接查看或结束
- **常驻与自动化**：系统托盘、详情资源曲线（近 60s）、开机自启、GitHub Releases 自动更新
- **管理员提权**：受限模式提示，一键以管理员重启

## 界面

四套页面：进程 / 端口 / 句柄 / 设置；浅色（棱镜）与深色（控制台）双主题。视觉体系见 `workbench-design-system.md`。

## 开发

环境要求：Node.js 18+、Rust（rustup）、Windows 10/11。

```bash
npm install          # 安装前端依赖
npm run dev          # 浏览器预览（无后端数据，仅调试 UI）
npm run tauri dev    # 桌面开发模式（热更新）
```

## 构建与测试

```bash
npm run build                                    # 前端类型检查 + 打包
cd src-tauri && cargo test                       # 后端单元测试
cd src-tauri && cargo clippy -- -D warnings      # 静态检查
```

构建可执行文件（**必须带 `custom-protocol` feature**，否则运行时窗口会误走 devUrl）：

```bash
cd src-tauri
cargo build --release --features custom-protocol
# 产物：src-tauri/target/release/gprocess.exe
```

MSI 安装包与自动更新发版流程（WiX 工具链、签名密钥环境变量）见 `docs/build.md`。

## 文档

| 路径 | 内容 |
| --- | --- |
| `docs/design-spec.md` | 产品定位与设计规格 |
| `docs/plans.md` | 里程碑总览与关键决策 |
| `docs/plan/m{N}/` | 各里程碑 README / tasks / design 三件套 |
| `docs/build.md` | 安装包构建与发版流程 |
| `AGENTS.md` | 工程原则与协作规范 |

## 许可证

私有项目，未授权分发。
