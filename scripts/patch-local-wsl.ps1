#Requires -Version 5.1
<#
.SYNOPSIS
    Patches an existing Code OSS install so WSL server downloads work correctly.

.DESCRIPTION
    When a Code OSS build is stamped with the fork's own commit SHA (instead of an
    upstream Microsoft VS Code release commit), the WSL extension tries to download a
    server tarball from update.code.visualstudio.com that doesn't exist (404). This
    script resolves the correct upstream commit SHA and patches the installed build's
    product.json, launcher script, and WSL extension so that WSL connections succeed.

    Equivalent to the manual "Patching an already-built local install" steps in
    ENABLING_WSL.md, but automated and idempotent.

.PARAMETER InstallPath
    Path to the Code OSS portable install directory.
    Default: C:\l\code-oss-win32-arm64

.PARAMETER UpstreamCommit
    Override the upstream commit SHA to stamp. If omitted, the script resolves it
    automatically from local git tags or the GitHub API.

.PARAMETER CleanWSLServer
    When set, removes the stale server directory inside WSL (~/.vscode-server-oss/bin/*)
    so the next connection re-downloads with the correct commit.

.PARAMETER Distro
    WSL distro name used with -CleanWSLServer. Default: Ubuntu

.EXAMPLE
    .\scripts\patch-local-wsl.ps1
    # Patches the default install path with auto-resolved upstream commit.

.EXAMPLE
    .\scripts\patch-local-wsl.ps1 -InstallPath C:\l\code-oss-win32-arm64 -CleanWSLServer
    # Patches and cleans up stale WSL server state.
#>

[CmdletBinding()]
param(
    [string] $InstallPath = 'C:\l\code-oss-win32-arm64',
    [string] $UpstreamCommit = '',
    [switch] $CleanWSLServer,
    [string] $Distro = 'Ubuntu'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

#region --- Resolve upstream commit -------------------------------------------------

function Resolve-UpstreamCommit {
    # Try local tags first.
    # --exclude '*-*' rejects fork-specific tags like '1.126.1-custom';
    # real upstream VS Code release tags are always bare N.N.N.
    $tag = $null
    try {
        $tag = & git -C $repoRoot describe --tags --abbrev=0 --match '[0-9]*.[0-9]*.[0-9]*' --exclude '*-*' HEAD 2>$null
    } catch { }

    if ($tag) {
        $sha = (& git -C $repoRoot rev-list -n 1 $tag).Trim()
        if ($sha -match '^[0-9a-f]{40}$') {
            Write-Host "Resolved upstream tag '$tag' -> $sha (from local refs)"
            return $sha
        }
    }

    # Fallback: GitHub CLI.
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "No upstream tag reachable from HEAD and 'gh' CLI not available. Pass -UpstreamCommit manually."
    }

    Write-Host "No matching tag reachable from HEAD; querying microsoft/vscode releases..."
    $tag = (& gh api repos/microsoft/vscode/releases/latest --jq '.tag_name') | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -or -not $tag) {
        throw "Failed to query microsoft/vscode latest release."
    }
    $tag = $tag.Trim()

    $sha = (& gh api "repos/microsoft/vscode/commits/$tag" --jq '.sha') | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -or -not $sha) {
        throw "Failed to resolve commit for tag '$tag'."
    }
    $sha = $sha.Trim()

    if ($sha -notmatch '^[0-9a-f]{40}$') {
        throw "Resolved SHA '$sha' is not a valid 40-char hex commit."
    }
    Write-Host "Resolved upstream tag '$tag' -> $sha (from microsoft/vscode API)"
    return $sha
}

if ($UpstreamCommit) {
    if ($UpstreamCommit -notmatch '^[0-9a-f]{40}$') {
        throw "-UpstreamCommit '$UpstreamCommit' is not a valid 40-char hex SHA."
    }
    $commit = $UpstreamCommit
    Write-Host "Using provided upstream commit: $commit"
} else {
    $commit = Resolve-UpstreamCommit
}

#endregion

#region --- Validate install path ---------------------------------------------------

if (-not (Test-Path -LiteralPath $InstallPath)) {
    throw "Install path does not exist: $InstallPath"
}

$productJsonPath = Join-Path $InstallPath 'resources\app\product.json'
$launcherPath    = Join-Path $InstallPath 'bin\code-oss'

if (-not (Test-Path -LiteralPath $productJsonPath)) {
    throw "product.json not found at: $productJsonPath"
}
if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "Launcher script not found at: $launcherPath"
}

#endregion

#region --- Patch product.json ------------------------------------------------------

Write-Host ""
Write-Host "=== Patching product.json ===" -ForegroundColor Cyan

$productJson = Get-Content $productJsonPath -Raw | ConvertFrom-Json

$productJson | Add-Member -NotePropertyName 'commit' -NotePropertyValue $commit -Force

# Validate required fields exist
$requiredFields = @('quality', 'updateUrl', 'serverDataFolderName')
foreach ($field in $requiredFields) {
    if (-not $productJson.$field) {
        Write-Warning "product.json is missing '$field' - WSL may not work correctly."
    }
}

# Check extensionEnabledApiProposals
if (-not $productJson.extensionEnabledApiProposals -or
    -not $productJson.extensionEnabledApiProposals.'ms-vscode-remote.remote-wsl') {
    Write-Warning "product.json is missing extensionEnabledApiProposals for ms-vscode-remote.remote-wsl"
}

# Check extensionUntrustedWorkspaceSupport
if (-not $productJson.extensionUntrustedWorkspaceSupport -or
    -not $productJson.extensionUntrustedWorkspaceSupport.'ms-vscode-remote.remote-wsl') {
    Write-Warning "product.json is missing extensionUntrustedWorkspaceSupport for ms-vscode-remote.remote-wsl"
}

# Ensure mcpGallery is configured
$hasMcpGallery = $productJson.PSObject.Properties['mcpGallery'] -and $productJson.mcpGallery.serviceUrl
if (-not $hasMcpGallery) {
    Write-Host "  Adding mcpGallery configuration..." -ForegroundColor Yellow
    $mcpGallery = [PSCustomObject]@{
        serviceUrl        = "https://api.mcp.github.com"
        itemWebUrl        = "https://github.com/mcp/{name}"
        publisherUrl      = "https://github.com/{name}"
        supportUrl        = "https://support.github.com"
        privacyPolicyUrl  = "https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"
        termsOfServiceUrl = "https://docs.github.com/site-policy/github-terms/github-terms-of-service"
        reportUrl         = "https://docs.github.com/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam"
    }
    $productJson | Add-Member -NotePropertyName 'mcpGallery' -NotePropertyValue $mcpGallery -Force
}

# Write back BOM-free UTF-8
$jsonText = $productJson | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Resolve-Path $productJsonPath).Path, $jsonText, $utf8NoBom)

Write-Host "  commit = $commit" -ForegroundColor Green

#endregion

#region --- Patch launcher script ---------------------------------------------------

Write-Host ""
Write-Host "=== Patching launcher bin/code-oss ===" -ForegroundColor Cyan

$launcherContent = Get-Content $launcherPath -Raw

# Patch COMMIT=
$launcherContent = $launcherContent -replace '(?m)^COMMIT="[^"]*"', "COMMIT=`"$commit`""

# Patch APP_NAME= to "code" (matches upstream server tarball binary names)
$launcherContent = $launcherContent -replace '(?m)^APP_NAME="code-oss"', 'APP_NAME="code"'

# Ensure QUALITY="stable"
if ($launcherContent -match '(?m)^QUALITY=""' -or $launcherContent -match '(?m)^QUALITY="undefined"') {
    $launcherContent = $launcherContent -replace '(?m)^QUALITY="[^"]*"', 'QUALITY="stable"'
}

# Write back (launcher is a Unix shell script - use LF line endings, no BOM)
$launcherContent = $launcherContent -replace "`r`n", "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Resolve-Path $launcherPath).Path, $launcherContent, $utf8NoBom)

Write-Host "  COMMIT=$commit" -ForegroundColor Green
Write-Host "  APP_NAME=code" -ForegroundColor Green
Write-Host "  QUALITY=stable" -ForegroundColor Green

#endregion

#region --- Patch WSL extension -----------------------------------------------------

Write-Host ""
Write-Host "=== Patching WSL extension ===" -ForegroundColor Cyan

# Look for the bundled extension first, then the user-installed copy.
$wslExtDirs = @(
    (Join-Path $InstallPath 'resources\app\extensions\ms-vscode-remote.remote-wsl')
)
# Also check user extension folder
$userExtBase = Join-Path $env:USERPROFILE '.vscode-oss\extensions'
if (Test-Path $userExtBase) {
    $userWslExt = Get-ChildItem -Path $userExtBase -Directory -Filter 'ms-vscode-remote.remote-wsl-*' |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($userWslExt) {
        $wslExtDirs += $userWslExt.FullName
    }
}

$patched = $false
foreach ($extDir in $wslExtDirs) {
    if (-not (Test-Path -LiteralPath $extDir)) {
        continue
    }
    Write-Host "  Found WSL extension at: $extDir"
    $patched = $true

    # Patch 1: hasVSDA → return!0
    $extJs = Join-Path $extDir 'dist\node\extension.js'
    if (Test-Path $extJs) {
        $content = Get-Content $extJs -Raw
        if ($content -match 't\.hasVSDA=function\(\)\{return!0\}') {
            Write-Host "    dist/node/extension.js: already patched" -ForegroundColor Gray
        } elseif ($content -match 't\.hasVSDA=function\(\)\{[^}]+\}') {
            $content = $content -replace 't\.hasVSDA=function\(\)\{[^}]+\}', 't.hasVSDA=function(){return!0}'
            [System.IO.File]::WriteAllText($extJs, $content, $utf8NoBom)
            Write-Host "    dist/node/extension.js: patched hasVSDA" -ForegroundColor Green
        } else {
            Write-Warning "    dist/node/extension.js: hasVSDA pattern not found (upstream may have changed)"
        }
    } else {
        Write-Warning "    dist/node/extension.js not found"
    }

    # Patch 2: wslServer.sh symlink fallback
    $wslServerSh = Join-Path $extDir 'scripts\wslServer.sh'
    if (Test-Path $wslServerSh) {
        $content = Get-Content $wslServerSh -Raw
        $symlinkSnippet = 'if [ ! -x "$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME" ] && [ -x "$VSCODE_REMOTE_BIN/$COMMIT/bin/code-server" ]'
        if ($content.Contains($symlinkSnippet)) {
            Write-Host "    scripts/wslServer.sh: already patched" -ForegroundColor Gray
        } else {
            $launchLine = '"$VSCODE_REMOTE_BIN/$COMMIT/bin/$SERVER_APPNAME" "$@"'
            $replacement = @"
if [ ! -x "`$VSCODE_REMOTE_BIN/`$COMMIT/bin/`$SERVER_APPNAME" ] && [ -x "`$VSCODE_REMOTE_BIN/`$COMMIT/bin/code-server" ]; then
    ln -sf code-server "`$VSCODE_REMOTE_BIN/`$COMMIT/bin/`$SERVER_APPNAME"
fi

"$launchLine"
"@
            if ($content.Contains($launchLine)) {
                $content = $content.Replace($launchLine, $replacement)
                $content = $content -replace "`r`n", "`n"
                [System.IO.File]::WriteAllText($wslServerSh, $content, $utf8NoBom)
                Write-Host "    scripts/wslServer.sh: patched symlink fallback" -ForegroundColor Green
            } else {
                Write-Warning "    scripts/wslServer.sh: launch line pattern not found"
            }
        }
    } else {
        Write-Warning "    scripts/wslServer.sh not found"
    }

    # Patch 3: wslDownload.sh auth-reject neutralization
    $wslDownloadSh = Join-Path $extDir 'scripts\wslDownload.sh'
    if (Test-Path $wslDownloadSh) {
        $content = Get-Content $wslDownloadSh -Raw
        $marker = '# vscode-oss: neutralize server auth reject'
        if ($content.Contains($marker)) {
            Write-Host "    scripts/wslDownload.sh: already patched" -ForegroundColor Gray
        } else {
            $hook = @"

$marker
SERVER_MAIN="`$VSCODE_REMOTE_BIN/`$COMMIT/out/server-main.js"
if [ -f "`$SERVER_MAIN" ] && ! grep -q "vscode-oss-patched" "`$SERVER_MAIN"; then
    perl -pi -e 's/this\._environmentService\.isBuilt\)return [a-zA-Z_\`$][\w\`$]*\("Unauthorized client refused"\);/this._environmentService.isBuilt\&\&0);\/\*vscode-oss-patched\*\//g' "`$SERVER_MAIN"
fi
"@
            $content = $content + $hook
            $content = $content -replace "`r`n", "`n"
            [System.IO.File]::WriteAllText($wslDownloadSh, $content, $utf8NoBom)
            Write-Host "    scripts/wslDownload.sh: patched auth-reject hook" -ForegroundColor Green
        }
    } else {
        Write-Warning "    scripts/wslDownload.sh not found"
    }

    # Only patch the first found extension directory (bundled takes priority)
    break
}

if (-not $patched) {
    Write-Warning "WSL extension not found (neither bundled nor user-installed)."
    Write-Warning "Install it with: code-oss --install-extension ms-vscode-remote.remote-wsl"
}

#endregion

#region --- Clean WSL server (optional) ---------------------------------------------

if ($CleanWSLServer) {
    Write-Host ""
    Write-Host "=== Cleaning stale WSL server state ===" -ForegroundColor Cyan

    $serverDataFolder = $productJson.serverDataFolderName
    if (-not $serverDataFolder) { $serverDataFolder = '.vscode-server-oss' }

    Write-Host "  Removing ~/$serverDataFolder/bin/ in WSL distro '$Distro'..."
    & wsl.exe -d $Distro -- rm -rf "~/$serverDataFolder/bin/"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Cleaned. Next WSL connection will re-download the server." -ForegroundColor Green
    } else {
        Write-Warning "  wsl.exe returned exit code $LASTEXITCODE"
    }
}

#endregion

#region --- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Patch complete!" -ForegroundColor Green
Write-Host "  Upstream commit: $commit"
Write-Host ""
Write-Host "  Verify with:"
Write-Host "    wsl.exe -d $Distro -- bash -lc `"code-oss --version`""
Write-Host ""
Write-Host "  Then test WSL connection:"
Write-Host "    wsl.exe -d $Distro -- bash -lc `"code-oss .`""
Write-Host "================================================================" -ForegroundColor Cyan

#endregion
