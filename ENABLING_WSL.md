# Enabling WSL / Remote support in custom VS Code OSS builds

This document captures the changes required to make this fork's binaries usable
as a drop-in replacement for VS Code from inside WSL (i.e. running `code-oss .`
from a WSL shell on Windows actually downloads a working remote server and
launches it). It is intended as a reference for future contributors maintaining
similar custom builds.

## Standard installation procedure

Day-to-day flow for picking up the latest build of the fork on a Windows
workstation. Assumes you have already done the one-time PATH setup at the
bottom of this section.

1. **Push to the fork's `main` branch** (or merge a PR). This triggers
   [`.github/workflows/build.yml`](.github/workflows/build.yml), which runs
   the four platform jobs in parallel: `linux`, `windows`, `windows-arm64`,
   and `macos`.

2. **Wait for the `Build Code OSS` workflow run to finish.** Track it at
   `https://github.com/<org>/vscode/actions/workflows/build.yml`. Each platform
   job uploads a portable artifact named like
   `code-oss-win32-arm64-<version>.zip`.

3. **Close any running `Code.exe` from the previous install.** The installer
   script renames the existing `C:\l\code-oss-win32` (or
   `C:\l\code-oss-win32-arm64`) directory; Windows refuses the rename if any
   binary inside it is loaded.

4. **Run the installer script** from a PowerShell prompt:

   ```pwsh
   .\scripts\install-latest-from-fork.ps1
   ```

   The script (see [scripts/install-latest-from-fork.ps1](scripts/install-latest-from-fork.ps1))
   uses `gh` to find the latest successful `build.yml` run on `main`,
   downloads the architecture-matched portable zip, rotates the current
   install at `C:\l\code-oss-win32-<arch>` to `C:\l\old`, and extracts the
   new build into place. Requires the GitHub CLI (`gh`) to be installed and
   authenticated.

5. **Verify the install** by launching once from PowerShell:

   ```pwsh
   & 'C:\l\code-oss-win32-arm64\bin\code-oss.cmd' --version
   ```

   This should print the upstream stable version, the upstream commit SHA
   (resolved by the `resolve-commit` workflow job), and the architecture.

6. **Open a WSL workspace** to confirm end-to-end:

   ```pwsh
   wsl.exe -d Ubuntu -- bash -lc "cd ~ && code-oss ."
   ```

   First run will download the matching server tarball into
   `~/.vscode-server-oss/bin/<commit>/` and apply the `wslDownload.sh` patch
   (see section 5 of "Changes made"). Subsequent runs reuse it.

### One-time setup: add `code-oss` to the Windows `PATH`

`install-latest-from-fork.ps1` does **not** modify `PATH`. After the first
install, add `C:\l\code-oss-win32-arm64\bin` (or `C:\l\code-oss-win32\bin` on
x64) to the user `PATH` so `code-oss` works from any shell, including the WSL
shim that locates the Windows binary via the `code-oss.cmd` shim on `PATH`.

Either through System Properties → Environment Variables → User variables →
`Path` → New, **or** in PowerShell:

```pwsh
$bin = 'C:\l\code-oss-win32-arm64\bin'
[Environment]::SetEnvironmentVariable(
  'Path',
  ([Environment]::GetEnvironmentVariable('Path','User') + ";$bin"),
  'User'
)
```

Sign out and back in (or restart any open shells) for the change to take
effect. This only needs to be done once — `install-latest-from-fork.ps1`
keeps the install path stable across upgrades.

## Background — what breaks by default

A vanilla `Code - OSS` build fails inside WSL for **seven** independent reasons.
The first four (and the seventh) are addressed by `product.json` + workflow
changes; the fifth and sixth require runtime patches to the official WSL
extension and to the downloaded MS server. All seven are required for an
end-to-end WSL session to work.

1. **`product.quality` is unset.** The Windows launcher script (`bin/code-oss`)
   bakes the quality value at build time. With no `quality`, the launcher passes
   `QUALITY="undefined"` to `wslCode.sh`, which then constructs a download URL
   like `https://update.code.visualstudio.com/commit:<sha>/server-linux-<arch>/undefined`
   and gets a 404.
2. **`product.commit` is the fork's HEAD SHA.** Even with a valid quality
   channel, Microsoft's update service has never seen the fork's commit, so the
   download still 404s.
3. **`applicationName` mismatch with upstream server tarball.** Once the server
   does download, the WSL extension's `wslCode.sh` invokes
   `$VSCODE_REMOTE_BIN/$COMMIT/bin/remote-cli/$APP_NAME`. Microsoft's server
   tarballs ship a binary named `code` (matching their `applicationName`), but
   our launcher passes `APP_NAME="code-oss"` (matching ours), so the exec fails
   with `code-oss: not found`.
4. **No `wsl` authority resolver is bundled or allowlisted.** Even after the
   server downloads cleanly, the Windows-side workbench receives a
   `vscode-remote://wsl+<distro>/...` URI and fails with
   `Failed to connect to remote extension host server (Error: no remote
   extension installed to resolve wsl)`. Official VS Code ships
   `ms-vscode-remote.remote-wsl` as a built-in. OSS does not. Even if a user
   manually installs that extension from the Marketplace, it activates but
   refuses to register its resolver because its `package.json` declares
   `enabledApiProposals: [resolvers, contribRemoteHelp, contribViewsRemote,
   telemetry]` and OSS has no `extensionEnabledApiProposals` allowlist for it.
5. **`hasVSDA()` activation gate in the WSL extension.** Once the resolver
   is allowlisted, activation still aborts with `WSL extension is supported
   only in Microsoft versions of VS Code`. The extension's `hasVSDA()`
   function checks for the proprietary `vsda` native module; OSS does not
   ship `vsda`, so activation returns early before `registerRemoteAuthorityResolver`
   is ever called.
6. **`serverApplicationName` mismatch + signed-handshake gate.** After the
   gate is bypassed and the server downloads:
   - `wslServer.sh` invokes `$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME`
     where `$SERVER_APPNAME` is our `serverApplicationName` (e.g.
     `code-server-oss`). The upstream tarball ships `bin/code-server`. Same
     class of mismatch as (3), but on the Linux side, and no launcher patch
     covers it.
   - The downloaded MS server then refuses every connection with
     `Unauthorized client refused`. The handshake requires a `vsda`-signed
     challenge response; the OSS client falls back to passing the challenge
     through unsigned (see `AbstractSignService.sign`) and the production
     server (running with `isBuilt=true`) rejects it. There is no
     forge-able key — this branch must be neutralized in the server bundle.
7. **Workspace-trust gating disables the resolver before it can run.** Once
   the resolver extension is bundled and proposed-API-allowlisted, the
   workbench still throws `No remote extension installed to resolve wsl`
   because `ms-vscode-remote.remote-wsl`'s manifest does not declare
   `capabilities.untrustedWorkspaces.supported`. Resolver extensions are run
   through `checkEnabledAndProposedAPI(..., ignoreWorkspaceTrust=false)` in
   [abstractExtensionService.ts](src/vs/workbench/services/extensions/common/abstractExtensionService.ts)
   (~line 523), so any untrusted workspace flips the extension to
   `EnablementState.DisabledByTrustRequirement`. The extension is then
   filtered out of the registry, `onResolveRemoteAuthority:wsl` never fires,
   and `registerRemoteAuthorityResolver` is never called. This is a
   chicken-and-egg deadlock: opening the workspace requires the resolver,
   but the resolver is killed by trust gating before the workspace exists
   to be trusted. The visible symptom is the WSL extension's view showing
   "Restricted Mode" and the trust prompt re-appearing on every reopen.
   Addressed by an `extensionUntrustedWorkspaceSupport` override in
   `product.json` (see section 1 below).

A common but **incorrect** assumption is that the WSL extension's
"WSL extension is supported only in Microsoft versions of VS Code" toast is
cosmetic. It is not — it is a hard activation gate, addressed by patch (5)
above.

## Design constraints

- **Side-by-side compatibility.** The `code-oss` binary, Windows shim, and
  user data folders must not collide with an installed official VS Code, so
  `applicationName`, `dataFolderName`, `urlProtocol`, `win32*`, and the bundle
  identifiers all stay at their OSS values.
- **No hardcoded commits in source.** The upstream commit is resolved at build
  time from the most recent stable release tag reachable from `HEAD`.
- **Minimum-viable spoof.** Only the fields that the WSL/Remote download path
  actually consumes are spoofed.

## Changes made

### 1. `product.json`

Added three fields plus a built-in extension entry and a proposed-API allowlist.
**No branding changes.**

```json
"quality": "stable",
"updateUrl": "https://update.code.visualstudio.com",
"downloadUrl": "https://code.visualstudio.com"
```

`quality` is what the launcher script bakes into `QUALITY=` and what the WSL
extension uses to construct the server download URL. `updateUrl` is the host
that URL points at.

Also added an entry to `builtInExtensions` so the build pipeline pre-bundles
the WSL resolver, plus an `extensionEnabledApiProposals` map that allowlists
the proposed APIs the resolver consumes, plus an
`extensionUntrustedWorkspaceSupport` override that lets the resolver activate
in untrusted workspaces:

```json
"builtInExtensions": [
  ...
  {
    "name": "ms-vscode-remote.remote-wsl",
    "version": "0.104.3",
    "sha256": "22534172b809daa91b26d34ea2764692e24760bf07a3b1156f61e56cc8a6c4af",
    "repo": "https://github.com/microsoft/vscode-remote-release",
    "metadata": { ... }
  }
],
"extensionEnabledApiProposals": {
  "ms-vscode-remote.remote-wsl": [
    "resolvers",
    "contribRemoteHelp",
    "contribViewsRemote",
    "telemetry"
  ]
},
"extensionUntrustedWorkspaceSupport": {
  "ms-vscode-remote.remote-wsl": {
    "default": true,
    "override": true
  }
}
```

The proposed-API allowlist is consumed by
`src/vs/workbench/services/extensions/common/extensionsProposedApi.ts` and is
the only mechanism (other than `--enable-proposed-api` or extension dev mode)
that lets a non-built-in or third-party extension activate proposed-API call
sites in production. Without it, the WSL extension's resolver activation
function aborts. **It is necessary but not sufficient** — the workspace-trust
override below is also required, otherwise the extension is disabled before
its activation function ever runs.

The `extensionUntrustedWorkspaceSupport` override is consumed by
`src/vs/workbench/services/extensions/common/extensionManifestPropertiesService.ts`
(via the `ExtensionUntrustedWorkspaceSupport` type in
`src/vs/base/common/product.ts`). `override: true` forces the support state to
`true` regardless of what the extension manifest declares, which is the
upstream-supported way to opt a built-in extension into untrusted workspaces
without shipping a forked manifest. Without this entry, opening any folder
over `vscode-remote://wsl+...` triggers the deadlock described in failure (7):
the resolver is filtered out by `_isDisabledByWorkspaceTrust()` in
`src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts`,
`onResolveRemoteAuthority:wsl` never fires, and the renderer surfaces
`No remote extension installed to resolve wsl`. _(Confirmed by reading the
relevant source files in this repo; the proposed-API allowlist alone does
not bypass trust gating.)_

When the version of `ms-vscode-remote.remote-wsl` is bumped, refresh the
`sha256` by downloading
`https://marketplace.visualstudio.com/_apis/public/gallery/publishers/ms-vscode-remote/vsextensions/remote-wsl/<version>/vspackage`
and running `Get-FileHash -Algorithm SHA256` on the (auto-decompressed) VSIX.
Node's `fetch` in `build/lib/fetch.ts` decompresses the response body before
hashing, so the PowerShell-computed hash matches.

### 2. `.github/workflows/build.yml` — `resolve-commit` job

A new lightweight Ubuntu job runs before each platform build:

- Checks out with `fetch-depth: 0` and `fetch-tags: true`.
- Runs `git describe --tags --abbrev=0 --match '[0-9]*.[0-9]*.[0-9]*' HEAD`
  to find the most recent stable VS Code release tag reachable from the
  branch (e.g. `1.117.0`).
- Resolves that tag to its commit SHA and exposes it as
  `outputs.sha` (and `outputs.tag` for logging).

If the workflow is dispatched manually, the existing `upstream_commit` input
overrides the auto-resolved value.

### 3. `.github/workflows/build.yml` — per-platform `BUILD_SOURCEVERSION`

Each of the four build jobs (`linux`, `windows`, `windows-arm64`, `macos`) now
declares `needs: resolve-commit` and sets:

```yaml
env:
  BUILD_SOURCEVERSION: ${{ needs.resolve-commit.outputs.sha }}
```

`build/lib/getVersion.ts` reads `BUILD_SOURCEVERSION` and `build/gulpfile.vscode.ts`
stamps it into both `product.commit` and the launcher script's
`@@COMMIT@@` placeholder. The result: the shipped binary advertises the
upstream stable commit, and the WSL flow downloads the matching server tarball
from `update.code.visualstudio.com`.

The workflow's top-level `env` also pins `VSCODE_QUALITY: 'stable'` for any
tooling that reads it independently of `product.json`.

### 4. `.github/workflows/build.yml` — Windows post-build launcher patch

Both Windows jobs (`windows`, `windows-arm64`) gained a step right after
`Build client` that rewrites the just-generated launcher:

```yaml
- name: Patch launcher APP_NAME for upstream server compat
  run: |
    $launcher = "../VSCode-win32-<arch>/bin/code-oss"
    if (-not (Test-Path $launcher)) { throw "Launcher not found at $launcher" }
    $c = Get-Content $launcher -Raw
    $c = $c -replace '(?m)^APP_NAME="code-oss"$', 'APP_NAME="code"'
    [System.IO.File]::WriteAllText((Resolve-Path $launcher), $c)
    Select-String -Path $launcher -Pattern '^APP_NAME='
```

This flips **only** the `APP_NAME` variable in the launcher script (which is
what the WSL extension uses to locate the server binary). The script's
filename, `product.applicationName`, and every other `code-oss`-named artifact
remain untouched, so side-by-side install with official VS Code still works.

The step throws if the launcher file is missing, so a future gulp refactor
that relocates the launcher will surface as a CI failure rather than silently
producing a broken build.

Linux and macOS launchers do not have the `APP_NAME` indirection
(`resources/linux/...` has no launcher script with that variable;
`resources/darwin/bin/code.sh` is renamed to `bin/code` and inlines
`@@APPNAME@@` only in a remote-CLI lookup, not a server spawn), so no patch is
needed there.

### 5. `build/lib/patchRemoteWsl.ts` — post-download patches to `ms-vscode-remote.remote-wsl`

Three runtime patches are baked into the downloaded WSL extension by
`build/lib/patchRemoteWsl.ts`, invoked from `getBuiltInExtensions()` in
`build/lib/builtInExtensions.ts` after every marketplace sync. All three are
idempotent and throw on a missing pattern, so an upstream extension version
bump fails the build loudly.

**The patch only runs when `getBuiltInExtensions()` is invoked.** That happens
when `npm run download-builtin-extensions` is called explicitly. It does
**not** happen as a side-effect of `npm run gulp core-ci` — the gulp task uses
`getExtensionStream` (in `build/lib/extensions.ts`), which downloads marketplace
extensions if they aren't already cached but does not call the patch. To make
the workflow apply the patches, each platform job in
`.github/workflows/build.yml` runs `npm run download-builtin-extensions` as a
dedicated step *before* `npm run gulp core-ci`. The download step populates
`.build/builtInExtensions/` and patches the WSL extension in place; the
subsequent `core-ci` build then reads the patched copy from disk via the
`isUpToDate` cache hit. _(Confirmed by testing: a prior workflow that omitted
this step produced installs with no patches applied, reproducing the
"Command 'remote-wsl.openFolder' not found" symptom even though `product.json`
overrides were correct.)_

1. **`dist/node/extension.js`** — replaces the `hasVSDA()` function body with
   `return!0`. Without this, activation aborts with
   `WSL extension is supported only in Microsoft versions of VS Code` and
   the resolver is never registered. (`dist/browser/extension.js` is patched
   on a best-effort basis; the pattern is not present in current versions.)

2. **`scripts/wslServer.sh`** — injects a fallback that symlinks
   `bin/code-server` (upstream tarball name) to
   `bin/$SERVER_APPNAME` (our `serverApplicationName`) before launch.
   Mirrors the Windows-side launcher `APP_NAME` patch from section 4.

3. **`scripts/wslDownload.sh`** — appends a hook that runs after the server
   tarball is extracted, rewriting the single
   `Unauthorized client refused` rejection branch in
   `out/server-main.js` to a no-op. The downloaded MS server thereby falls
   through to its existing dev-mode log path
   (`Unauthorized client handshake failed but we proceed because of dev
   mode`) and accepts the unsigned handshake the OSS client produces.
   Tagged with `/*vscode-oss-patched*/` so re-runs are idempotent.

The patches preserve everything else about the official extension and the
upstream server: behavior, version cadence, error messages on unrelated
paths. They strictly neutralize the three places where the official
distribution refuses to cooperate with a non-Microsoft client.

## File reference cheat sheet

| Concern | Source location |
|---|---|
| Launcher template (Windows portable) | `resources/win32/bin/code.sh` |
| Launcher template (Windows installer) | `resources/win32/versioned/bin/code.sh` |
| Launcher template (macOS) | `resources/darwin/bin/code.sh` |
| Template substitution + rename | `build/gulpfile.vscode.ts` (~line 600) |
| Commit env var read | `build/lib/getVersion.ts` |
| Build output path (Windows) | `../VSCode-win32-<arch>/` (see `build/gulpfile.vscode.win32.ts` line 24) |
| Build output path (Linux) | `../VSCode-linux-<arch>/` |
| Build output path (macOS) | `../VSCode-darwin-<arch>/` |
| WSL extension server-spawn shim | `wslCode.sh` (shipped by the WSL extension; line 60 invokes `$VSCODE_REMOTE_BIN/$COMMIT/bin/remote-cli/$APP_NAME`) |

## Patching an already-built local install

If you need to fix a pre-existing install (e.g. `C:\l\code-oss-win32-arm64\`)
without rebuilding, seven things need attention. (1)–(3) match the build-time
changes; (4)–(6) are the runtime patches that
`build/lib/patchRemoteWsl.ts` would apply to a fresh build; (7) is the
workspace-trust override.

1. `resources/app/product.json`: add/set `quality`, `commit`, `updateUrl`,
   `downloadUrl`, an `extensionEnabledApiProposals` map allowlisting
   `ms-vscode-remote.remote-wsl` for `resolvers`, `contribRemoteHelp`,
   `contribViewsRemote`, and `telemetry`, **and** an
   `extensionUntrustedWorkspaceSupport` map with
   `"ms-vscode-remote.remote-wsl": { "default": true, "override": true }`.
   Write with no BOM
   (`[System.IO.File]::WriteAllText` with a BOM-less UTF-8 encoding) — the
   WSL extension's product.json reader rejects a BOM-prefixed file with
   `SyntaxError: Unexpected token`.
2. `bin/code-oss` (the launcher script): set `COMMIT=`, `QUALITY=`, and
   `APP_NAME="code"` to match the values that would have been baked at build
   time.
3. Install the WSL resolver into the user extension folder:
   `code-oss --install-extension ms-vscode-remote.remote-wsl`. (A baked-in
   build will instead pick it up from `resources/app/extensions/` because of
   the `builtInExtensions` entry; on a patched install, the user-installed
   copy in `%USERPROFILE%\.vscode-oss\extensions\` is sufficient.)
4. Patch the user-installed extension's `dist/node/extension.js`:
   replace `t.hasVSDA=function(){...}` with `t.hasVSDA=function(){return!0}`
   (regex `/t\.hasVSDA=function\(\)\{[^}]+\}/`).
5. Patch `scripts/wslServer.sh` in the same extension dir: insert
   `if [ ! -x "$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME" ] && [ -x "$VSCODE_REMOTE_BIN/$COMMIT/bin/code-server" ]; then ln -sf code-server "$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME"; fi`
   immediately before the final `"$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME" "$@"`
   line.
6. Patch the already-downloaded server (or `wslDownload.sh` so future
   downloads get patched automatically): in
   `~/.vscode-server-oss/bin/<commit>/out/server-main.js`, replace
   `this._environmentService.isBuilt)return <ident>("Unauthorized client refused");`
   with `this._environmentService.isBuilt&&0);` — leave the surrounding code
   alone so the existing dev-mode log fall-through path is taken.
7. Wipe stale state on the WSL side after changing extension scripts:
   `rm -rf ~/.vscode-server-oss` (or just the per-commit subdir) so the
   patched `wslDownload.sh` re-applies on the next connect.

## Verifying

After a fresh build (or after applying the local patches above), from a WSL
shell:

```bash
code-oss --version    # should print the upstream stable version + commit
code-oss .            # should download the server, unpack it, and open the workspace
```

If the download still 404s, double-check `QUALITY=` in the launcher (must be
`stable`) and that `COMMIT=` matches a real upstream stable release SHA.
If the download succeeds but the launch fails with `code-oss: not found`,
the post-build `APP_NAME` patch did not apply.
If you instead see `Failed to connect to remote extension host server (Error:
no remote extension installed to resolve wsl)`, the resolver is not bundled
or its proposed-API allowlist is missing from `product.json`. Inspect
`%APPDATA%\Code - OSS\logs\<latest>\window<n>\renderer.log` for
`Extension 'ms-vscode-remote.remote-wsl CANNOT USE these API proposals` to
confirm it is the allowlist.

If you see `WSL extension is supported only in Microsoft versions of VS Code`
in the extension's output channel **or** the WSL command palette entries
(`WSL: Connect to WSL`, `WSL: Open Folder in WSL`) report
`Command 'remote-wsl.openFolder' not found`, the `hasVSDA` patch from
`build/lib/patchRemoteWsl.ts` did not apply. The extension's activation
function aborts before registering any commands or the resolver. Verify with:

```pwsh
Select-String -Path 'C:\l\code-oss-win32\resources\app\extensions\ms-vscode-remote.remote-wsl\dist\node\extension.js' -Pattern 'hasVSDA=function\(\)\{return!0\}'
```

If no match is found, the build that produced this install ran `gulp core-ci`
without first running `npm run download-builtin-extensions` (the patch only
runs in `getBuiltInExtensions()`, not in the gulp marketplace-bundle step).
Check that each platform job in `.github/workflows/build.yml` has the
"Download and patch built-in extensions" step before "Compile core". Also
verify the user-installed copy in
`%USERPROFILE%\.vscode-oss\extensions\ms-vscode-remote.remote-wsl-*\` is
overridden by the built-in copy under `resources/app/extensions/`.

If the connection fails with `Connection error: Unauthorized client refused`
in the renderer log, the server-side patch from `wslDownload.sh` did not
apply. Either the server was downloaded before the patch was added (delete
`~/.vscode-server-oss/bin/<commit>/` and reconnect) or
`out/server-main.js` does not contain the expected
`this._environmentService.isBuilt)return <ident>("Unauthorized client refused");`
pattern (upstream server may have changed; update the perl substitution in
`patchRemoteWsl.ts`).

If the launch fails with `code-server-oss: not found` (or whatever your
`serverApplicationName` is), the `wslServer.sh` symlink-fallback patch did
not apply.

If the WSL extension shows up but its view says **"Restricted Mode"** and the
renderer log still reports `No remote extension installed to resolve wsl`
(and/or the workspace-trust prompt re-appears every time you reopen the same
folder), the `extensionUntrustedWorkspaceSupport` override is missing from
`product.json`. Verify:

```pwsh
(Get-Content C:\l\code-oss-win32-arm64\resources\app\product.json -Raw | ConvertFrom-Json).extensionUntrustedWorkspaceSupport.'ms-vscode-remote.remote-wsl'
```

should print `default=True override=True`. If it doesn't, add the block (see
section 1 of "Changes made") and restart the app. _(Confirmed by testing on
`C:\l\code-oss-win32-arm64\` — adding only the proposed-API allowlist without
this override reproduces the exact "Restricted Mode" + `NoResolverFound`
failure described in failure (7).)_
