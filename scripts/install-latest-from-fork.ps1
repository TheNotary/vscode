#Requires -Version 5.1
#---------------------------------------------------------------------------------------------
# Downloads the latest successful 'Build Code OSS' workflow run from the thenotary/vscode
# fork (main branch), picks the portable zip artifact matching the local CPU architecture,
# rotates the current install at C:\l\code-oss-win32 to C:\l\old, and unpacks the new build.
#
# Requires the GitHub CLI ('gh') to be installed and authenticated.
#---------------------------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repo  = 'thenotary/vscode'
$Dest  = 'C:\l\code-oss-win32'
$Old   = 'C:\l\old'
$Stage = Join-Path $env:TEMP ("code-oss-install-" + [guid]::NewGuid().ToString('N'))

function Resolve-Arch {
	$raw = $env:PROCESSOR_ARCHITEW6432
	if (-not $raw) { $raw = $env:PROCESSOR_ARCHITECTURE }
	switch ($raw.ToUpperInvariant()) {
		'AMD64' { return 'x64' }
		'ARM64' { return 'arm64' }
		default { throw "Unsupported CPU architecture: '$raw' (expected AMD64 or ARM64)." }
	}
}

function Invoke-Gh {
	param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Args)
	$output = & gh @Args
	if ($LASTEXITCODE -ne 0) {
		throw "gh $($Args -join ' ') failed with exit code $LASTEXITCODE"
	}
	return $output
}

try {
	if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
		throw "GitHub CLI ('gh') is required but was not found on PATH. Install from https://cli.github.com/."
	}

	$arch = Resolve-Arch
	Write-Host "Detected architecture: $arch"

	Write-Host "Looking up latest successful 'build.yml' run on '$Repo' main..."
	$runId = Invoke-Gh run list --repo $Repo --workflow build.yml --branch main --status success --limit 1 --json databaseId -q '.[0].databaseId'
	if (-not $runId) {
		throw "No successful 'build.yml' runs found on $Repo main."
	}
	$runId = $runId.Trim()
	Write-Host "Found run id: $runId"

	$artifactNames = Invoke-Gh api "repos/$Repo/actions/runs/$runId/artifacts" --paginate -q '.artifacts[].name'
	$pattern = "^code-oss-win32-$arch-.*\.zip$"
	$artifact = $artifactNames | Where-Object { $_ -match $pattern } | Select-Object -First 1
	if (-not $artifact) {
		throw "No artifact matching '$pattern' on run $runId. Available: $($artifactNames -join ', ')"
	}
	Write-Host "Selected artifact: $artifact"

	New-Item -ItemType Directory -Path $Stage -Force | Out-Null
	Write-Host "Downloading to $Stage ..."
	Invoke-Gh run download $runId --repo $Repo --name $artifact --dir $Stage | Out-Null

	$innerZipName = "code-oss-win32-$arch.zip"
	$innerZip = Get-ChildItem -Path $Stage -Filter $innerZipName -Recurse -File | Select-Object -First 1
	if (-not $innerZip) {
		throw "Inner archive '$innerZipName' not found inside downloaded artifact at $Stage."
	}
	Write-Host "Inner archive: $($innerZip.FullName)"

	$parent = Split-Path -Parent $Dest
	if (-not (Test-Path -LiteralPath $parent)) {
		New-Item -ItemType Directory -Path $parent -Force | Out-Null
	}

	if (Test-Path -LiteralPath $Old) {
		Write-Host "Removing previous backup at $Old ..."
		Remove-Item -LiteralPath $Old -Recurse -Force
	}

	if (Test-Path -LiteralPath $Dest) {
		Write-Host "Rotating current install: $Dest -> $Old"
		Move-Item -LiteralPath $Dest -Destination $Old
	}

	Write-Host "Extracting to $Dest ..."
	Expand-Archive -LiteralPath $innerZip.FullName -DestinationPath $Dest -Force

	$codeExe = Join-Path $Dest 'Code.exe'
	if (-not (Test-Path -LiteralPath $codeExe)) {
		Write-Warning "Install completed but '$codeExe' was not found. Contents:"
		Get-ChildItem -LiteralPath $Dest | Select-Object -First 20 | ForEach-Object { Write-Host "  $($_.Name)" }
	} else {
		Write-Host "Done. Launch with: $codeExe" -ForegroundColor Green
	}
}
finally {
	if (Test-Path -LiteralPath $Stage) {
		Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
	}
}
