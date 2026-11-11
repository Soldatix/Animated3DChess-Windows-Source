# Animated 3D Chess Windows V4.1 -- portable PRIVATE review build recipe.
# UNTESTED ON WINDOWS; NOT APPROVED FOR A PUBLIC RELEASE.
# Only verified in source review: command shape matches the historical private packer.
# This script never signs, installs, uploads or publishes. Offline package caches required.
param(
    [ValidateSet('Verify','BuildPrivate')]
    [string]$Mode = 'Verify',
    [string]$WinAppExe = '',
    [string]$OutputRoot = '',
    [switch]$AcceptPrivateDraftNotices
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-File([string]$p) {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "MISSING_FILE=$p" }
}
function Check-Exit([string]$label) {
    if ($LASTEXITCODE -ne 0) { throw "$label=$LASTEXITCODE" }
}
function Hash([string]$p) {
    Test-File $p
    return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant()
}
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$app = Join-Path $root 'APP-SOURCE'
$pkg = Join-Path $root 'WINDOWS-PACKAGING-INPUTS'
$notices = Join-Path $root 'MSIX-NOTICES'
$stock = Join-Path $root 'STOCKFISH-SOURCE'
$manifest = Join-Path $root 'SHA256SUMS.txt'

Write-Host '=== CHESS V4.1 PORTABLE SOURCE / PRIVATE MSIX RECIPE ==='
Write-Host "MODE=$Mode; NETWORK=OFFLINE_ONLY; SIGN=NONE; INSTALL=NONE; UPLOAD=NONE"
Write-Host 'PUBLICATION=NO_GO; ASSET_RIGHTS=UNRESOLVED'

# This manifest is a file-integrity statement, not a cryptographic signature.
# It validates extracted content byte-for-byte against the reviewer bundle.
Test-File $manifest
$records = @(Get-Content -LiteralPath $manifest -Encoding UTF8)
if ($records.Count -lt 160) { throw 'SOURCE_MANIFEST_UNEXPECTEDLY_SHORT' }
$checked = 0
foreach ($record in $records) {
    if ($record -cnotmatch '^([0-9A-Fa-f]{64})  (.+)$') { throw 'BAD_SHA256SUMS_FORMAT' }
    $want = $Matches[1].ToUpperInvariant()
    $rel = $Matches[2]
    if ($rel.StartsWith('/') -or $rel.StartsWith('\\') -or
        $rel -match '(^|/|\\)\.\.(?:/|\\|$)' -or $rel.Contains(':')) {
        throw "UNSAFE_MANIFEST_ENTRY=$rel"
    }
    $full = Join-Path $root ($rel.Replace('/', '\'))
    if ((Hash $full) -ne $want) { throw "HASH_MISMATCH=$rel" }
    $checked++
}
Write-Host "SOURCE_MANIFEST_HASHES=$($checked)_PASS"

foreach ($rel in @(
  'APP-SOURCE/package.json', 'APP-SOURCE/package-lock.json',
  'APP-SOURCE/src-tauri/Cargo.toml', 'APP-SOURCE/src-tauri/Cargo.lock',
  'APP-SOURCE/scripts/desktop-cleanup.mjs',
  'WINDOWS-PACKAGING-INPUTS/AppxManifest.xml',
  'WINDOWS-PACKAGING-INPUTS/Assets/AppList.targetsize-24_altform-lightunplated.png',
  'STOCKFISH-SOURCE/stockfish.js-v19.0.1-pinned-source.zip',
  'STOCKFISH-SOURCE/nn-61e7af4bb97d.nnue',
  'MSIX-NOTICES/THIRD_PARTY_NOTICES.txt'
)) { Test-File (Join-Path $root ($rel.Replace('/', '\'))) }
if ((Hash (Join-Path $stock 'nn-61e7af4bb97d.nnue')) -ne
    '61E7AF4BB97D51EEEB25D322916F86513B5CD3A827CE189C98C6E31946F99E5B') {
    throw 'NNUE_HASH_MISMATCH'
}
if ((Hash (Join-Path $pkg 'Assets\AppList.targetsize-24_altform-lightunplated.png')) -ne
    '36F29F8605CA660B2AE64FA8BC5A5ECF0B13906C4B00850A8606F1A58DFD867D') {
    throw 'ICON_SHA256_MISMATCH'
}
# Load XML from a byte stream so the UTF-8 BOM is consumed correctly.
$config = [System.Xml.XmlDocument]::new()
$config.XmlResolver = $null
$xmlStream = [IO.File]::OpenRead((Join-Path $pkg 'AppxManifest.xml'))
try { $config.Load($xmlStream) } finally { $xmlStream.Dispose() }
$identity = $config.SelectSingleNode("/*[local-name()='Package']/*[local-name()='Identity']")
if (-not $identity -or
    $identity.GetAttribute('Name') -ne 'Soldatix.Animated3DChess' -or
    $identity.GetAttribute('Publisher') -ne 'CN=AD206FDB-4EAC-4060-8F05-FC95B75B6C61' -or
    $identity.GetAttribute('ProcessorArchitecture') -ne 'x64' -or
    $identity.GetAttribute('Version') -ne '1.0.0.0') {
    throw 'PACKAGE_IDENTITY_MISMATCH'
}
$tauri = Get-Content -LiteralPath (Join-Path $app 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
if ($tauri.version -ne '1.0.0' -or
    $tauri.build.beforeBuildCommand -ne 'npm run build:windows' -or
    $tauri.build.frontendDist -ne '../dist') { throw 'TAURI_BUILD_CONFIG_MISMATCH' }
$assetCount = @(Get-ChildItem -LiteralPath (Join-Path $pkg 'Assets') -File).Count
if ($assetCount -ne 50) { throw "WINDOWS_ASSET_COUNT=$assetCount" }
$noticeFiles = @(
    'LICENSE-GPL-3.0.txt', 'THIRD_PARTY_NOTICES.txt',
    'licenses/THIRD-PARTY-JAVASCRIPT.txt', 'licenses/THIRD-PARTY-RUST.txt',
    'licenses/stockfish/AUTHORS.txt', 'licenses/stockfish/Copying.txt'
)
foreach ($rel in $noticeFiles) { Test-File (Join-Path $notices ($rel.Replace('/','\'))) }
Write-Host 'APP_SOURCES=PASS; STOCKFISH_SOURCE=PASS; NNUE=PASS'
Write-Host 'WINDOWS_ASSETS=50_OF_50_PASS; NOTICE_FILES=6_OF_6_PASS'
Write-Host 'STORE_IDENTITY=PASS'
if ($Mode -eq 'Verify') {
    Write-Host 'SOURCE_REVIEW_PREFLIGHT=PASS'
    Write-Host 'BUILDS=NONE; FILES_MODIFIED=NONE; STORE_PUBLICATION=NO_GO'
    return
}

# Explicitly opt in to private testing with draft license/source notices.
if (-not $AcceptPrivateDraftNotices) {
    throw 'PRIVATE_BUILD_REQUIRES_EXPLICIT_ACCEPT_PRIVATE_DRAFT_NOTICES'
}
if (-not $WinAppExe) { throw 'REQUIRED_PARAMETER_WinAppExe' }
Test-File $WinAppExe
if (-not $OutputRoot) { throw 'REQUIRED_PARAMETER_OutputRoot' }
foreach ($cmd in @('npm.cmd', 'node.exe', 'cargo.exe')) {
    if ($null -eq (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "MISSING_WINDOWS_BUILD_TOOL=$cmd"
    }
}
# Output must be a different directory from the source bundle.
$outParent = [IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
$bundleRoot = [IO.Path]::GetFullPath($root).TrimEnd('\')
if ($outParent.Equals($bundleRoot,[StringComparison]::OrdinalIgnoreCase) -or
    $outParent.StartsWith($bundleRoot + '\',[StringComparison]::OrdinalIgnoreCase) -or
    $bundleRoot.StartsWith($outParent + '\',[StringComparison]::OrdinalIgnoreCase)) {
    throw 'OUTPUT_ROOT_MUST_BE_SEPARATE_FROM_SOURCE_BUNDLE'
}
if (-not (Test-Path -LiteralPath $outParent -PathType Container)) {
    throw 'OUTPUT_ROOT_MUST_ALREADY_EXIST'
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $outParent ("ChessV4_1-private-build-$stamp")
if (Test-Path -LiteralPath $work) { throw 'OUTPUT_ALREADY_EXISTS' }
New-Item -ItemType Directory -Path $work -Force | Out-Null
$buildApp = Join-Path $work 'APP-SOURCE'
$stage = Join-Path $work 'MSIX-STAGE'
New-Item -ItemType Directory -Path $buildApp, $stage -Force | Out-Null
Copy-Item -Path (Join-Path $app '*') -Destination $buildApp -Recurse -Force
Write-Host "BUILD_FOLDER=$work"

$oldCargo = $env:CARGO_NET_OFFLINE
$oldNpm = $env:npm_config_offline
$oldTelemetry = $env:WINAPP_CLI_TELEMETRY_OPTOUT
$env:CARGO_NET_OFFLINE = 'true'
$env:npm_config_offline = 'true'
$env:WINAPP_CLI_TELEMETRY_OPTOUT = '1'
try {
    Push-Location $buildApp
    try {
        & npm.cmd ci --offline
        Check-Exit 'NPM_OFFLINE_CACHE_OR_INSTALL_FAILURE'
        & npm.cmd run tauri -- build --no-bundle
        Check-Exit 'TAURI_NATIVE_BUILD_FAILED'
    }
    finally { Pop-Location }

    $exe = Join-Path $buildApp 'src-tauri\target\release\app.exe'
    Test-File $exe
    foreach ($forbidden in @(
        'sw.js', 'manifest.webmanifest', 'chess-adsterra-loader.js',
        'assets\glb\option8_cathedral.glb.gz.b64'
    )) {
        if (Test-Path -LiteralPath (Join-Path $buildApp "dist\$forbidden")) {
            throw "DESKTOP_BUILD_CONTAINS_FORBIDDEN_ASSET=$forbidden"
        }
    }
    Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'app.exe')
    Copy-Item -LiteralPath (Join-Path $pkg 'Assets') -Destination $stage -Recurse
    Copy-Item -LiteralPath (Join-Path $pkg 'AppxManifest.xml') -Destination (
        Join-Path $stage 'Package.appxmanifest')
    foreach ($rel in $noticeFiles) {
        $target = Join-Path $stage ($rel.Replace('/','\'))
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $notices ($rel.Replace('/','\'))) -Destination $target
    }
    $msix = Join-Path $work 'Animated3DChess_1.0.0.0_x64_PRIVATE_UNSIGNED.msix'
    & $WinAppExe pack $stage --manifest (Join-Path $stage 'Package.appxmanifest') `
        --executable 'app.exe' --output $msix --no-sign
    Check-Exit 'WINAPP_PACK_FAILED'
    Test-File $msix
    Write-Host 'PRIVATE_UNSIGNED_MSIX_CREATED=TRUE'
    Write-Host "PRIVATE_MSIX_PATH=$msix"
    Write-Host "PRIVATE_MSIX_SHA256=$(Hash $msix)"
    Write-Host 'BINARY_REPRODUCIBILITY=NOT_ESTABLISHED'
    Write-Host 'STORE_PUBLICATION=NO_GO'
}
finally {
    $env:CARGO_NET_OFFLINE = $oldCargo
    $env:npm_config_offline = $oldNpm
    $env:WINAPP_CLI_TELEMETRY_OPTOUT = $oldTelemetry
}
