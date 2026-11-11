# Animated 3D Chess — Windows V4.1 corresponding-source candidate

These files document the source and packaging inputs for the **Windows 1.0.0.0 / internal V4.1 candidate**. This is **source code**, not a signed installer or a Microsoft Store submission.

- Original local Windows app source commit: `be1c28fa26a2060c11b7b8c17618c705af4a8493`
- Reference verified private unsigned MSIX SHA256: `2F4FD5E1FA384C9F3F9159DC39FDAF4DC51953631E0B08B4B2E5987332A50A29`
- Stockfish.js source commit: `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`
- NNUE SHA256: `61E7AF4BB97D51EEEB25D322916F86513B5CD3A827CE189C98C6E31946F99E5B`

## Layout

- `APP-SOURCE/`: complete desktop frontend, Rust/Tauri application code, six inherited chess models, Stockfish runtime and npm/Cargo lockfiles.
- `STOCKFISH-SOURCE/`: pinned GPL engine source (both ZIP and expanded code) and official NNUE.
- `WINDOWS-PACKAGING-INPUTS/`: checked MSIX manifest, app icon and resource assets.
- `MSIX-NOTICES/`: notices corresponding to the reviewed private installer; its old index has been replaced here with a current source-only index.
- `SOURCE-DEPENDENCY-NOTICES/`: build-time Rust license notices and package-specific text.
- `DOCS/`: portable **draft** Windows build recipe and instructions.
- `SHA256SUMS.txt`: per-file hash manifest excluding itself.

## Build

Reference environment: Node.js 24.13.0, npm 11.6.2, Rust/Cargo 1.98.1 MSVC, Tauri CLI 2.12.4, Windows SDK 10.0.26100.0, WinApp CLI 0.8.0.

See `DOCS/PORTABLE-WINDOWS-BUILD.md`. From `APP-SOURCE`, the desktop frontend is built with `npm run build:windows`, and Tauri with `npm run tauri -- build --no-bundle`. The provided build script is a **draft** and has not been tested on a clean Windows machine. Full binary reproducibility is **not claimed**. Dependency packages are pinned by lockfiles, with retrieval subject to their registries and licenses.

## Licensing and publication caveats

The application's declared license is GPL-3.0 (see `APP-SOURCE/LICENSE`) and Stockfish.js is also GPLv3. Third-party notices are provided. **This does not automatically license inherited third-party artwork or GLB models.** Rights to commercially redistribute the six inherited chess piece models are not independently documented, and should be resolved before distributing binaries publicly.

The old Windows private MSIX contains the prepublication string `SOURCE CODE ACCESS: pending`. Even after a public source repository is made available, a **new final MSIX must be packaged** with the actual source URL and final notices before submitting to Microsoft Store. The source snapshot deliberately preserves historical Cargo metadata (`authors = ["you"]` and placeholder description) for matching; these should be corrected in a new tracked source revision with an updated artifact mapping. No public binary is attached to this source release.

This release does not claim a legal compliance certification or a successful independent source-to-binary rebuild.
