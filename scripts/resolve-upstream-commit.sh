#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
# Resolves the upstream Microsoft VS Code stable release commit SHA and exports it as
# BUILD_SOURCEVERSION so that subsequent local builds stamp product.commit with a real
# upstream commit that exists on update.code.visualstudio.com.
#
# Usage:
#   source scripts/resolve-upstream-commit.sh    # exports BUILD_SOURCEVERSION
#   eval $(scripts/resolve-upstream-commit.sh)   # alternative for non-interactive shells
#
# The script uses the same resolution logic as .github/workflows/build.yml's
# resolve-commit job:
#   1. `git describe --tags` to find the nearest upstream stable release tag
#   2. `git rev-list -n 1 <tag>` to resolve the tag to a commit SHA
#   3. Fallback: query microsoft/vscode via GitHub CLI if no local tag is reachable
#
# Requires: git. Optional: gh (GitHub CLI) for the fallback path.
#---------------------------------------------------------------------------------------------

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --exclude '*-*' rejects fork-specific tags like '1.126.1-custom';
# real upstream VS Code release tags are always bare N.N.N.
TAG=$(git -C "$REPO_ROOT" describe --tags --abbrev=0 --match '[0-9]*.[0-9]*.[0-9]*' --exclude '*-*' HEAD 2>/dev/null || true)

if [ -n "$TAG" ]; then
	SHA=$(git -C "$REPO_ROOT" rev-list -n 1 "$TAG")
	echo "Resolved upstream tag $TAG -> $SHA (from local refs)" >&2
else
	if ! command -v gh &>/dev/null; then
		echo "ERROR: No upstream tag reachable from HEAD and 'gh' CLI is not available for fallback." >&2
		echo "Install from https://cli.github.com/ or set BUILD_SOURCEVERSION manually." >&2
		exit 1
	fi

	echo "No matching tag reachable from HEAD; querying microsoft/vscode releases..." >&2
	TAG=$(gh api repos/microsoft/vscode/releases/latest --jq '.tag_name')
	SHA=$(gh api "repos/microsoft/vscode/commits/$TAG" --jq '.sha')
	echo "Resolved upstream tag $TAG -> $SHA (from microsoft/vscode API)" >&2
fi

if ! echo "$SHA" | grep -qE '^[0-9a-f]{40}$'; then
	echo "ERROR: Resolved SHA '$SHA' does not look like a valid 40-char hex commit." >&2
	exit 1
fi

export BUILD_SOURCEVERSION="$SHA"
echo "" >&2
echo "BUILD_SOURCEVERSION=$SHA" >&2
echo "" >&2
echo "Environment variable set. Run your build command now, e.g.:" >&2
echo "  npm run gulp \"vscode-linux-x64-min-ci\"" >&2

# Also print the export statement to stdout so `eval $(...)` works.
echo "export BUILD_SOURCEVERSION=$SHA"
