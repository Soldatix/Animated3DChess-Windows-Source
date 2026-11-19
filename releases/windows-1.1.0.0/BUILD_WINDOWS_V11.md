# Windows V1.1.0.0 — production build recipe

Toolchain used on the build machine: Node 24.x, npm 11.x, Tauri 2.x CLI from `APP-SOURCE/package-lock.json`, Rust toolchain capable of edition 2024 (actual earlier compiler 1.98.1). Ensure Windows prerequisites/WebView2/Tauri build requirements are installed.

Start from the `APP-SOURCE/` folder. The repo's historical `src-tauri/tauri.conf.json` is intentionally a V1.0 base config. The V1.1 release was built with `src-tauri/tauri.p3c-prod.conf.json` plus the additional **production-only override** preserved here as `src-tauri/Production-Only-Tauri-Override.json`. Do not use the test/pilot identity for the Store release.

PowerShell commands (example; use `npm ci` to restore packages):

```powershell
npm ci
$env:VITE_CHESS_MP_URL = 'https://chess-multiplayer-v11-prod.soldatix.workers.dev'
npm run tauri -- build --config src-tauri/tauri.p3c-prod.conf.json --config src-tauri/Production-Only-Tauri-Override.json --no-bundle --ci
```

This executes the existing `build:windows` frontend pipeline, including `scripts/desktop-cleanup.mjs` which excludes the unshipped `option8_cathedral` model asset from the desktop distribution. The app executable is at `src-tauri/target/release/app.exe`. The external Microsoft Store MSIX packaging step uses the original Store V1.0 package identity and its icons, with package version bumped to `1.1.0.0`. The Store package is signed by Microsoft upon certification.

Build output byte-for-byte reproducibility is *not claimed*. For production compliance, preserve the exact release commit/version, all notices and complete corresponding source.
