# Animated 3D Chess — Windows Microsoft Store 1.1.0.0 — Corresponding Source

This is the corresponding-source publication candidate for the **Windows x64 MSIX 1.1.0.0** release with online multiplayer, including frontend, Tauri/Rust code, Worker multiplayer server, 3D assets, build scripts and license notices.

**Pre-publication review:** Zip integrity and matching source `OnlineMultiplayerPanel.tsx` hash were checked. No access keys or credential files were found in a static scan. The compiled EXE is not included, so independent binary-to-source reproducibility has **not** been demonstrated. Check exact release artifact again before certifying compliance.

**Reference hashes from Lenovo builder:**
- Production `app.exe`: `EE6FD660FD024B6B5E884973A0943F2313109D0523783B1B4EEAD4CA62AC177B`
- Legal-Only MSIX: `75904BC793DCA89EFE05038DE29C263092DF549CE9C1CD774E784BF5FF7C932A`
- Original submitted source snapshot SHA-256: `1894E1D64AB8BD5842874BD4EA1EA9E4929BF372C1D71557F8C414254AEAA476`

**Where to look:**
- `APP-SOURCE/`: frontend, Rust/Tauri, local AI/Stockfish transport, multiplayer Worker, build scripts and test sources
- `Legal/`: full GPLv3, Stockfish authors and license, third-party notices, React/Three.js/chess.js etc.
- `BUILD_WINDOWS_V11.md`: exact release-only overlay and build command
- `SOURCE_FILES_SHA256.txt`: hashes of files from the candidate source ZIP, prior to documentation-only adjustments

License: application source GPL-3.0-only, as stated in `APP-SOURCE/LICENSE`. Upstream Stockfish.js 19.0.1 source and build instructions: https://github.com/nmrugg/stockfish.js/tree/v19.0.1 . See `Legal/SOURCE_AND_LICENSES.txt` for details.

**Release cautions:** Publisher must confirm rights to bundled 3D models and other art assets. This archive preserves original model assets; their provenance is not established by this document. The source repository must remain freely accessible for recipients of the Store application. No `.env`, private credentials, `node_modules`, `target`, or built EXE is distributed in this source archive.
