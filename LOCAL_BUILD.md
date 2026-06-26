# Local Install and Build Guide — Code OSS

Quick reference for building, running, and testing VS Code (Code OSS) from source, concerned mostly with builds on Windows with WSL support.

Please note that if you're an agent, this document is not always up-to-date so you must validate any assertions here by reading source files.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** | Version pinned in `.nvmrc` / `remote/.npmrc` |
| **Python 3** | For native module compilation |
| **C/C++ toolchain** | `build-essential` on Linux, Xcode CLT on macOS, VS Build Tools on Windows |

In the dev container, all prerequisites are pre-installed,but... last I checked, the dev container is using linux and so isn't suitable for building windows binaries (unconfirmed).

---

## Installing from Github Action Builds

Currently, the `build.yml` workflow produces a build of Code OSS along with the REH server required on WSL.  The install method is to download the artifacts from the latest successful build of main and extract them to a folder you'll put in your path (I hope ENVs are documented elsewhere...).

For windows on arm, https://github.com/TheNotary/vscode/actions/runs/28287257204

1. Rename the prior install from `C:\l\code-oss-win32` to `C:\l\code-oss-win32-old`

2. Download `code-oss-win32-arm64-1.126.0.zip` from the GH Actions build and extract the nested zips to `C:\l\code-oss-win32`

3. Download `code-oss-server-win32-arm64-1.126.0.zip` and extract this on the WSL side to `~/.vscode-server/bin/SHA` where SHA will be listed in product.json.

4. Rename `~/.vscode-server/bin/SHA/bin/remote-cli/code-oss` to `~/.vscode-server/bin/SHA/bin/remote-cli/code`

You should be good-to-go as long as copilot did it's part maintaining the build.

---

## Local Production Build Quickstart (From Source)

NOTE: I haven't finished this because I don't like leaving copilot unattended on my local for hours at a time with the idea that it should be making environment configuration "improvements" especially on arm64-based devices.

To produce a fully bundled and minified build equivalent to the CI pipeline:

```bash
npm ci
npm run core-ci
```

This single command runs the same compilation pipeline as Azure DevOps CI:
1. Copies codicons and compiles all extensions (non-native + copilot + media)
2. Type-checks with tsgo (no emit)
3. Transpiles source to `out-build/`
4. Bundles and minifies three targets **in parallel**:
   - `out-vscode-min/` — Desktop (Electron) client
   - `out-vscode-reh-min/` — Remote Extension Host server (WSL, SSH, tunnels)
   - `out-vscode-reh-web-min/` — VS Code Web (browser workbench)

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

### Package for a Platform

After `core-ci` completes, package into a runnable application with a platform-specific gulp task:

```bash
# Desktop client
npm run gulp vscode-win32-x64-min-ci
npm run gulp vscode-linux-x64-min-ci
npm run gulp vscode-darwin-arm64-min-ci

# REH server (for WSL / SSH / tunnels)
npm run gulp vscode-reh-win32-x64-min-ci
npm run gulp vscode-reh-linux-x64-min-ci
npm run gulp vscode-reh-linux-arm64-min-ci

# Web server (browser workbench)
npm run gulp vscode-reh-web-linux-x64-min-ci
```

Output lands in sibling folders at the repo root:
- `../VSCode-win32-x64/` (desktop client)
- `../vscode-reh-linux-x64/` (REH server)
- `../vscode-reh-web-linux-x64/` (web server)

See the [Platform Targets](#platform-targets) table for all valid platform suffixes.

### Recipe: Build a Patched REH Server for WSL

If you need your source changes available in a WSL/SSH remote session:

```bash
# 1. Full production compile + bundle + minify
npm run core-ci

# 2. Package the REH server for your target platform
npm run gulp vscode-reh-linux-x64-min-ci

# 3. Deploy to your WSL server path (adjust commit hash as needed)
SERVER_DIR="$HOME/.vscode-server-oss/bin/$(cat .build/commit)"
mkdir -p "$SERVER_DIR"
cp -r ../vscode-reh-linux-x64/* "$SERVER_DIR/"
```

Next time VS Code connects to WSL, it will use your patched server.

> **Tip:** For an unminified debug-friendly server, use `npm run gulp vscode-reh-linux-x64` (without `-min-ci`) instead — this skips `core-ci` and runs the full pipeline standalone, but produces larger unminified output.

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
| Build REH server (dev) | `npm run gulp vscode-reh-linux-x64` (or `linux-arm64` on ARM) |
| **Production build (CI equivalent)** | `npm run core-ci` |
| Package desktop (after core-ci) | `npm run gulp vscode-{platform}-{arch}-min-ci` |
| Package REH server (after core-ci) | `npm run gulp vscode-reh-{platform}-{arch}-min-ci` |
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
