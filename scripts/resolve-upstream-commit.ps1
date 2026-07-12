#Requires -Version 5.1
#---------------------------------------------------------------------------------------------
# Resolves the upstream Microsoft VS Code stable release commit SHA and sets it as
# $env:BUILD_SOURCEVERSION so that subsequent local builds (e.g.
# `npm run gulp vscode-win32-arm64-min-ci`) stamp product.commit with a real upstream
# commit that exists on update.code.visualstudio.com.
#
# Usage:
#   . .\scripts\resolve-upstream-commit.ps1          # dot-source to export env var
#   scripts\resolve-upstream-commit.ps1              # prints the SHA (useful in pipelines)
#
# The script uses the same resolution logic as .github/workflows/build.yml's
# resolve-commit job:
#   1. `git describe --tags` to find the nearest upstream stable release tag
#   2. `git rev-list -n 1 <tag>` to resolve the tag to a commit SHA
#   3. Fallback: query microsoft/vscode via GitHub CLI if no local tag is reachable
#
# Requires: git. Optional: gh (GitHub CLI) for the fallback path.
#---------------------------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-UpstreamCommit {
    # Try local tags first (works when the fork tracks upstream tags).
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

    # Fallback: query microsoft/vscode releases via GitHub CLI.
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "No upstream tag reachable from HEAD and GitHub CLI ('gh') is not available for fallback. Install from https://cli.github.com/ or pass -UpstreamCommit manually."
    }

    Write-Host "No matching tag reachable from HEAD; querying microsoft/vscode releases..."
    $tag = (& gh api repos/microsoft/vscode/releases/latest --jq '.tag_name') | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -or -not $tag) {
        throw "Failed to query microsoft/vscode latest release via gh CLI."
    }
    $tag = $tag.Trim()

    $sha = (& gh api "repos/microsoft/vscode/commits/$tag" --jq '.sha') | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -or -not $sha) {
        throw "Failed to resolve commit for tag '$tag' via gh CLI."
    }
    $sha = $sha.Trim()

    if ($sha -notmatch '^[0-9a-f]{40}$') {
        throw "Resolved SHA '$sha' does not look like a valid 40-char hex commit."
    }

    Write-Host "Resolved upstream tag '$tag' -> $sha (from microsoft/vscode API)"
    return $sha
}

$commit = Resolve-UpstreamCommit
$env:BUILD_SOURCEVERSION = $commit
Write-Host ""
Write-Host "BUILD_SOURCEVERSION=$commit" -ForegroundColor Green
Write-Host ""
Write-Host "Environment variable set for this session. Run your build command now, e.g.:"
Write-Host "  npm run gulp `"vscode-win32-arm64-min-ci`""
