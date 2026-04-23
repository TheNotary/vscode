# Local Build Guide — Code OSS

Quick reference for building, running, and testing VS Code (Code OSS) from source.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** | Version pinned in `.nvmrc` / `remote/.npmrc` |
| **npm** | Ships with Node |
| **Python 3** | For native module compilation |
| **C/C++ toolchain** | `build-essential` on Linux, Xcode CLT on macOS, VS Build Tools on Windows |
| **Git** | Already available in the dev container |
| **Linux extras** | `libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev` |

In the dev container, all prerequisites are pre-installed.

---

## 1. Install Dependencies

```bash
npm ci
```

> **ARM note:** On ARM64 (e.g., Apple Silicon, Snapdragon), `npm ci` takes ~15–20 minutes due to native module compilation (sqlite3, node-pty, spdlog, @vscode/watcher) and the copilot extension's large dependency tree.

## 2. Build (Watch Mode — Recommended)

Incremental build with live recompilation on save:

```bash
npm run watch
```

This runs four parallel watchers: transpile, typecheck, extensions, and copilot.

For a one-shot fast transpile (no type checking):

```bash
npm run transpile-client
```

## 3. Launch Desktop (Electron)

```bash
./scripts/code.sh          # Linux / macOS
scripts\code.bat            # Windows
```

On first launch, `build/lib/preLaunch.ts` automatically:
1. Runs `npm ci` if `node_modules/` is missing
2. Downloads the correct Electron binary
3. Compiles TypeScript if `out/` is missing
4. Downloads built-in extensions from the marketplace

Skip this with `VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh`.

## 4. Launch Web (Browser)

```bash
# Full server (REH + web client) — port 9888
./scripts/code-server.sh

# Lightweight browser-only workbench
./scripts/code-web.sh --port 8080 --browser none
```

---

## Extension Marketplace

The OSS build has no marketplace configured by default. This repo's `product.json` has been patched with [Open VSX](https://open-vsx.org) so extensions can be searched and installed out of the box.

The added block in `product.json`:

```json
"extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item",
    "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
    "controlUrl": "",
    "nlsBaseUrl": "",
    "publisherUrl": ""
}
```

### Alternative: VS Marketplace (personal testing only)

The VS Marketplace ToS restricts usage to Microsoft products. For personal local testing you can swap in:

```json
"extensionsGallery": {
    "serviceUrl": "https://marketplace.visualstudio.com/_apis/public/gallery",
    "itemUrl": "https://marketplace.visualstudio.com/items",
    "resourceUrlTemplate": "https://{publisher}.vscode-unpkg.net/{publisher}/{name}/{version}/{path}",
    "controlUrl": "",
    "nlsBaseUrl": "https://www.vscode-unpkg.net/_lp/",
    "publisherUrl": "https://marketplace.visualstudio.com/publishers"
}
```

### Installing Extensions from VSIX

You can always install any `.vsix` file directly regardless of marketplace config:

```
Extensions view → ⋯ menu → Install from VSIX…
```

Or from the command line:

```bash
./scripts/code.sh --install-extension path/to/extension.vsix
```

---

## Remote / WSL Server Build

VS Code's remote features (WSL, SSH, Dev Containers) use the **Remote Extension Host (REH)** server.

### Build the Server

```bash
# Unminified (faster build, better for debugging)
npm run gulp vscode-reh-linux-x64

# Minified (production-like)
npm run gulp vscode-reh-linux-x64-min

# With web client included
npm run gulp vscode-reh-web-linux-x64
```

Output lands in a sibling folder: `../vscode-reh-linux-x64/`.

Other platforms: replace `linux-x64` with `win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-arm64`, `linux-armhf`, `alpine-arm64`.

### Use a Pre-Built Server

Point the `VSCODE_REMOTE_SERVER_PATH` env variable at your built server folder before launching:

```bash
export VSCODE_REMOTE_SERVER_PATH="$(realpath ../vscode-reh-linux-x64)"
./scripts/code.sh
```

### Run the Dev Server Directly

```bash
# Basic launch (opens browser automatically)
./scripts/code-server.sh

# Headless with explicit token (recommended for dev containers)
./scripts/code-server.sh --no-launch --connection-token dev-token --port 9888
```

The server binds to port 9888 by default. You should see:
```
Server bound to 127.0.0.1:9888 (IPv4)
Extension host agent listening on 9888
```

Connect from a browser at `http://127.0.0.1:9888/?tkn=<connection-token>`.

This starts the REH server using your compiled `out/` directory in development mode.

---

## Testing Remote Connections (Without WSL)

The built-in `vscode-test-resolver` extension simulates a full remote connection on the same machine — same architecture as WSL/SSH, no actual remote needed.

### Steps

1. Launch Code OSS: `./scripts/code.sh`
2. Open the Command Palette (`Ctrl+Shift+P`)
3. Run **"Remote-TestResolver: New TestResolver Window"**

This spawns a local REH server via `scripts/code-server.sh`, sets up a TCP proxy, and opens a new window connected to the `test+test` remote authority. You get a remote file system, remote terminal, and remote extension host — identical to a real WSL/SSH session.

### Simulate Network Conditions

| Command | Effect |
|---|---|
| `Remote-TestResolver: Toggle Connection Pause` | Simulates disconnect/reconnect |
| `Remote-TestResolver: Toggle Connection Slowdown` | Adds 800ms latency |

### Environment Variables

| Variable | Purpose |
|---|---|
| `TESTRESOLVER_DATA_FOLDER` | Custom server data directory |
| `TESTRESOLVER_LOGS_FOLDER` | Custom log directory |
| `TESTRESOLVER_LOG_LEVEL` | Server log verbosity |
| `VSCODE_REMOTE_SERVER_PATH` | Use a pre-built server instead of compiling on the fly |

---

## Quick Reference

| Task | Command |
|---|---|
| Install deps | `npm ci` |
| Watch build (recommended) | `npm run watch` |
| Fast transpile only | `npm run transpile-client` |
| Type-check `src/` | `npm run compile-check-ts-native` |
| Compile extensions | `npm run gulp compile-extensions` |
| Launch desktop | `./scripts/code.sh` |
| Launch web server | `./scripts/code-server.sh` |
| Build REH server | `npm run gulp vscode-reh-linux-x64` (or `linux-arm64` on ARM) |
| Download built-in extensions | `npm run download-builtin-extensions` |
| Run unit tests | `./scripts/test.sh` |
| Run unit tests (filtered) | `./scripts/test.sh --grep "pattern"` |
| Run integration tests | `./scripts/test-integration.sh` |
| Check layering | `npm run valid-layers-check` |
| Full compile (one-shot) | `npm run compile` |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Stale compiled output | Delete `out/` and rebuild: `rm -rf out && npm run compile` |
| Electron not found | `npm run electron` |
| Docker shared memory errors | Already handled — `scripts/code.sh` adds `--disable-dev-shm-usage` when it detects Docker |
| Extensions view shows "No extensions found" | Check that `extensionsGallery` is present in `product.json` (see above) |
| Server build fails with OOM | Gulp uses `--max-old-space-size=8192`; ensure 8 GB+ RAM available |
| Skip prelaunch on launch | `VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh` |
| ARM: slow `npm ci` | Normal — native modules compile from source (~15–20 min) |

---

## Platform Targets

When building REH servers or packaged builds, use the correct platform suffix:

| Platform | Suffix |
|---|---|
| Linux x64 | `linux-x64` |
| Linux ARM64 | `linux-arm64` |
| Linux ARM32 | `linux-armhf` |
| Alpine ARM64 | `alpine-arm64` |
| Windows x64 | `win32-x64` |
| Windows ARM64 | `win32-arm64` |
| macOS x64 (Intel) | `darwin-x64` |
| macOS ARM64 (Apple Silicon) | `darwin-arm64` |

For example, on ARM64 Linux (dev container on Windows ARM host):
```bash
npm run gulp vscode-reh-linux-arm64
```
