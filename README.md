# gprocess

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows_10%2F11-0078D4?logo=windows11&logoColor=white" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/version-0.1.0-7C3AED" alt="Version 0.1.0">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0B1522" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white" alt="Rust stable">
  <img src="https://img.shields.io/github/last-commit/watertreestar/gprocess?logo=github&color=7C3AED" alt="Last commit">
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · English
</p>

A lightweight Windows process and port management desktop application built for developer workstations. gprocess helps you find forgotten processes, occupied ports, and locked files, assess termination risks, and clean them up safely.

Built with Tauri 2, React 19, TypeScript, and Rust.

<p align="center">
  <img src="docs/assets/screenshots/processes.png" alt="gprocess process overview" width="100%">
</p>

## Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/ports.png" alt="Port inspection"><br>
      <sub>Inspect TCP/UDP bindings and listening ports</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/settings.png" alt="Application settings"><br>
      <sub>Configure monitoring, alerts, startup, and appearance</sub>
    </td>
  </tr>
</table>

## Features

- **Process overview** — Inspect CPU usage, memory usage, start time, and uptime with filtering, sorting, and virtualized rendering.
- **Orphan process detection** — Identify missing parents and PID reuse while treating system paths, Windows services, startup entries, and known launchers as expected sources.
- **Port inspection** — Review TCP/UDP bindings, filter listening ports, pin watched ports, and jump directly to the owning process.
- **Locked-file lookup** — Use the Windows Restart Manager API to find processes holding a file open.
- **Safe termination assessment** — Classify processes into four risk levels, display child processes and occupied ports, and optionally terminate the whole process tree.
- **In-app alerts** — Surface sustained high CPU usage and long-running orphan processes in a compact island-style notification.
- **Desktop integration** — Run from the system tray, monitor a 60-second resource history, start with Windows, and check GitHub Releases for updates.
- **Administrator relaunch** — Detect restricted mode and restart with elevated privileges when needed.

## Requirements

- Windows 10 or Windows 11
- Node.js 18 or later
- npm
- Rust stable with the `x86_64-pc-windows-msvc` target
- Visual Studio Build Tools with the MSVC toolchain
- WebView2 Runtime

## Development

```powershell
npm install
npm run tauri dev
```

For frontend-only UI development without native process data:

```powershell
npm run dev
```

## Verification

```powershell
npm run build

Push-Location src-tauri
cargo test
cargo clippy -- -D warnings
Pop-Location
```

## Build

Build the standalone executable with Tauri's production protocol enabled:

```powershell
Push-Location src-tauri
cargo build --release --features custom-protocol
Pop-Location
```

The executable is generated at `src-tauri/target/release/gprocess.exe`.

To create Windows installers after preparing the NSIS/WiX toolchains:

```powershell
npm run tauri build -- --bundles nsis,msi
```

See [docs/build.md](docs/build.md) for packaging, signing, and GitHub Releases update instructions.

## Project Structure

```text
src/                    React frontend
src/components/         Shared application and UI components
src/hooks/              Snapshot and watchdog state hooks
src/pages/              Processes, ports, handles, and settings pages
src-tauri/src/          Rust commands and Windows integrations
docs/                   Product, architecture, milestone, and build docs
```

## Documentation

- [Product and design specification](docs/design-spec.md)
- [Project roadmap](docs/plans.md)
- [Build and release guide](docs/build.md)
- [Milestone documentation](docs/plan)
- [Engineering guidelines](AGENTS.md)

## License

No license is currently granted. Unless explicitly authorized by the owner, the source code may not be copied, modified, or distributed.
