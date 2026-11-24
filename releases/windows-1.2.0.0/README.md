# Animated 3D Chess for Windows 1.2.0.0 — corresponding source

This directory provides the versioned corresponding-source archive for the Windows x64 1.2.0.0 distribution candidate (V8.4). Publication of source does not by itself establish that a binary has been certified or released in the Microsoft Store.

- [Download the source archive](./Animated3DChess_Windows_1.2.0.0_Corresponding_Source_V8_4_CANDIDATE.zip)
- [SHA-256 checksum](./SHA256SUMS.txt)
- Source archive SHA-256: `a780d3fdb3e77f24a929391b5c8894b15f2080dc6ef1f9dc66b3b30a0e4e4d5e`
- Matching executable SHA-256: `1f7cfe07fca7d8d55eb20ad38dd031c212875749b72422f66c64ffbf7aef5da9`
- Reviewed unsigned MSIX candidate SHA-256: `6cefcd93db365e475a30b76f1414eadf6502de15c9654b97ab6b4886d20df330` (the Store may sign and change package bytes; the MSIX is not hosted here).

Extract the ZIP and read `BUILD_WINDOWS_V120.md`, `Legal/SOURCE_AND_LICENSES.txt`, `RELEASE_SOURCE_GATES.md` and `SOURCE_SHA256SUMS.txt`. The archive includes application code, dependencies' lockfiles, test fixture, packaging inputs and third-party notices. All notices are accessible in `Legal/` inside the ZIP, including the V8.3 and V8.4 supplement indices. The V8.4 notice-only repack preserves the tested application source and executable. Prior QA: 323/323 Node tests and TypeScript PASS from the V8.2 extracted source; these tests were not repeated for notice-only changes. Independent binary rebuild reproducibility is not claimed. The server fixture is not proof of the live Worker deployment revision.

The application code is GPL-3.0-only as stated in `APP-SOURCE/LICENSE`. Third-party materials retain their applicable licenses and notices. The archive does not make new claims of ownership of art assets.

Stockfish.js 19.0.1 upstream source: https://github.com/nmrugg/stockfish.js/tree/v19.0.1 (commit `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`). NNUE reference: https://github.com/Soldatix/Animated3DChess-Windows-Source/blob/main/STOCKFISH-SOURCE/nn-61e7af4bb97d.nnue . Consult the included source and license instructions for the engine and build requirements.

Official project portal: https://appsandgames.org/
