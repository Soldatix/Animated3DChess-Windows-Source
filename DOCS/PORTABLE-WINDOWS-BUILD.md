# Animated 3D Chess V4.1 — portable Windows build instructions (DRAFT)

**Review-only build recipe. Not an approved public release.** These instructions describe the setup needed to rebuild the *application* and a new unsigned *private* MSIX using relative paths. They do not claim byte-for-byte reproducibility of the already-audited package.

## 1. Files and toolchain

Extract the Phase 1K private source review ZIP to a short local path, such as `D:\ChessV4-SourceReview`. Do not run commands from a ZIP viewer.

Its layout is:

```text
APP-SOURCE/                      frontend + Rust/Tauri + six GLBs + runtime Stockfish JS/WASM
WINDOWS-PACKAGING-INPUTS/        AppxManifest.xml and Assets/ (50 files)
MSIX-NOTICES/                    six reviewed notice files (still release-candidate text)
SOURCE-DEPENDENCY-NOTICES/       build-only and exact-version license supplement texts
STOCKFISH-SOURCE/               pinned upstream ZIP and verified NNUE file
DOCS/                           this guide, review report, and private build helper
SHA256SUMS.txt                   all files except itself
```

For portability, follow **this** guide rather than the historical `APP-SOURCE/docs/RELEASE-V1-PLAYBOOK.md`, which still has machine-specific `E:\GitHub` examples.

The known working Lenovo development toolchain was Node.js 24.13.0, npm 11.6.2, Rust/Cargo 1.98.1 (Windows MSVC toolchain), Windows SDK 10.0.26100.0, Tauri CLI 2.12.4, and Microsoft WinApp CLI 0.8.0. The frontend Vite resolved as 8.3.5. These are **reference versions**, not a guarantee that other versions produce the same binary.

Install Rust MSVC prerequisites, C++ build tools, Windows SDK, WebView2 runtime/SDK prerequisites, Node and the WinApp CLI separately. `winapp.exe` is **not** contained in this source archive.

## 2. Integrity verification (READ_ONLY)

Open PowerShell in the extracted root and run:

```powershell
& .\DOCS\Build-Windows-Portable-REVIEW.ps1 -Mode Verify
```

This checks the package's per-file SHA256 values, Stockfish NNUE, Windows icon, package identity, Tauri version and six notice paths. A passed check proves the extracted source archive was not unintentionally modified after assembly; it does **not** establish full corresponding-source or third-party asset rights compliance.

## 3. A separate private build (optional; not yet executed from this bundle)

Only after independent review of the draft script, use a separate destination such as `D:\ChessV4-Private-Outputs`. The destination folder must already exist and not contain the source bundle. The script copies `APP-SOURCE` to a new timestamped work directory so that it does not edit the extracted archive.

```powershell
& .\DOCS\Build-Windows-Portable-REVIEW.ps1 `
    -Mode BuildPrivate `
    -WinAppExe 'C:\Path\To\WinAppCLI-v0.8.0\bin\winapp.exe' `
    -OutputRoot 'D:\ChessV4-Private-Outputs' `
    -AcceptPrivateDraftNotices
```

The build intentionally sets `CARGO_NET_OFFLINE=true` and `npm_config_offline=true`. It invokes:

```powershell
npm.cmd ci --offline
npm.cmd run tauri -- build --no-bundle
```

This requires the exact packages to be available locally in npm/Cargo caches. On a fresh PC, the offline step may fail: that is a **missing dependency cache**, not proof the source is invalid. Do not replace packages with arbitrary versions. Document and explicitly approve any later network retrieval from official registries before changing the build workflow.

The Tauri `beforeBuildCommand` performs `npm run build:windows` (Vite desktop build + desktop cleanup). The expected release executable is `APP-SOURCE/src-tauri/target/release/app.exe` **inside the copied working directory**. The desktop build must exclude SW/PWA/ad loaders and `option8_cathedral.glb.gz.b64`. Six piece GLB files remain unchanged.

## 4. Packaging command and inputs

The helper creates a separate MSIX stage with:

- `app.exe` — newly compiled release executable
- `Assets/*` — exact 50 icon/logo resources from the reviewed package
- `Package.appxmanifest` — copy of `WINDOWS-PACKAGING-INPUTS/AppxManifest.xml`
- six paths copied from `MSIX-NOTICES/`

Then calls the validated WinApp CLI 0.8.0 command form:

```powershell
& $WinAppExe pack $stage `
    --manifest (Join-Path $stage 'Package.appxmanifest') `
    --executable 'app.exe' `
    --output $msix `
    --no-sign
```

The WinApp CLI generates `resources.pri` and the unsigned MSIX. The package identity must remain `Soldatix.Animated3DChess`, publisher `CN=AD206FDB-4EAC-4060-8F05-FC95B75B6C61`, architecture `x64`, version `1.0.0.0`, executable `app.exe`. The reviewer ZIP does **not** include `resources.pri`: it is generated during packaging.

This same identity/version is **not intended for parallel installation** with the earlier private V3 candidate. The script never signs, installs or uploads the package.

## 5. Before a final public release

The reviewed license-index text still explicitly says public source access is pending; `Cargo.toml` contains scaffold metadata, and inherited GLB rights are unresolved. Also review the licenses and source obligations of the 130 npm lock entries and 411 Cargo lock packages, and make a version-specific public corresponding-source archive available to recipients. The final source mapping must be tied to the exact distributed MSIX; changing `app.exe` or packaging contents can require updating checksums and a fresh audit.

**Status: SOURCE_RELEASE=REVIEW_ONLY; STORE_PUBLICATION=NO_GO.**
