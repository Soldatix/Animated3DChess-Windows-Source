# Animated 3D Chess — Web/PWA v1 release playbook (staging only)

Status: LOCAL SOURCE STAGING. Publishing, DNS and remote pushes require explicit HUMAN GATE.

## Source of truth
- Repository: `Soldatix/Wizard-Chess-3D-Table-Edition`.
- Local worktree: `E:\GitHub\Wizard-Chess-3D-Table-P1I-Stockfish`.
- Branch: `factory/wizard-chess-table-p1i-stockfish`.
- Last fully human-verified PWA source HEAD before this packet: `a7d35427ebe436d17131b43e9c9358643529f6b9`.
- Tests as of P1Q #415: 227/227 Node PASS, TypeScript PASS, PWA build PASS, installed Windows PWA PASS, full Chrome/Edge production-preview offline AI/local-two-player PASS.
- On every future build, generated service worker version hashes actual entrypoint/asset file bytes rather than file-name list alone, making changed un-hashed 3D models and shell updates trigger SW refresh.
- Vendor license/attribution must remain intact: `LICENSE`, `public/vendor/stockfish-19.0.1/AUTHORS`, `public/vendor/stockfish-19.0.1/Copying.txt`. Do not strip required GPL notices or author information.

## Cloudflare Pages release settings (manual only after explicit approval)
- Framework: React/Vite.
- Root directory: repository root.
- Install: `npm ci` only if a tracked compatible lockfile is present; otherwise `npm install` with reviewed lockfile process.
- Build command: `npm run build`.
- Output directory: `dist`.
- Runtime: HTTPS and root origin, with `/sw.js`, `/manifest.webmanifest`, `/assets/*`, `/vendor/*` reachable.
- `public/_headers` copied into `dist/_headers` by Vite; verify Cloudflare serves fresh HTML/SW and bounded GLB/Stockfish caching.
- Proposed custom domain: `chess.appsandgames.org` (**candidate, not verified, not configured**).
- Do NOT set an automatic production deployment branch or connect any Cloudflare project without release owner approval. A remote branch push may also generate an automatic Pages preview and therefore requires approval.

## Browser acceptance
1. Local production preview `npm run preview -- --host 127.0.0.1 --port 4173`.
2. Load once fully online, confirm seven core GLB payloads and active `sw.js`.
3. Switch DevTools Application > Service Workers to Offline, reload `http://127.0.0.1:4173/`.
4. Confirm all 3D pieces render, local two-player game and AI levels 1–5 work, captures/checkmate and Save/Load work.
5. Stockfish level 6 is optional offline **only after** its JS/WASM files were fetched successfully online; inspect on-demand runtime cache.
6. Install using `?install=web`, confirm standalone mode and app icon, language panel fallback and close on supported browsers.
7. Check no cross-origin/API response is accidentally cached and no stale SW/HTML after changing an unchanged URL asset.
8. Repeat on actual HTTPS Pages candidate *before* changing live portal links.

## Portal integration — separate repository
- Repository: `Soldatix/apps-and-games`; local main checkout previously known at `E:\GitHub\apps-and-games`, but re-verify its CURRENT branch/clean HEAD before writing; use a **new isolated feature worktree** from verified current `origin/main` to avoid modifying production `main`.
- Update both pre-rendered fallback `index.html` game card and JavaScript-driven catalog `script.js` entry, or no-JS and JS will disagree.
- Add an informative `wizard-chess-3d.html` game detail page following the portal's `tetris.html` style; include SEO meta/JSON-LD, description for six AI levels including Stockfish, local pass-and-play, optional auto camera flip, FIDE rules, Save/Load, five UI languages, PWA installation and offline behavior.
- Reuse **existing actual game screenshots** (`docs/images/gameplay-overhead.png`, `docs/images/gameplay-side.png` from chess source) as portal imagery; use a safe local copy, no fabricated external image URL. Avoid missing assets.
- Buttons: `Play Game` targets verified live HTTPS destination; `Info and Download` targets new detail page; `Open / Install Web App` uses verified HTTPS game URL with `?install=web`. Never publish a link to an unverified or placeholder domain.
- Keep consistency with `Web / PWA` tag, existing analytics, portal translation convention EN/HR/DE/IT/ES, SEO structured list and `detail-i18n.js` if needed.
- Check JS enabled/disabled portal card, mobile layout, broken asset scans, existing GA/CMP unaffected, and portal no-JS controls.
- Portal commit is LOCAL ONLY after test/HUMAN GATE, with no pushes/releases or merges unless separately approved.

## Final public release HUMAN GATE
Require signed PASS with exact HEADs, clean worktrees, deployment URL verified HTTPS live, offline + installation smoke tests, navigation/portal proof, correct licensing, rollback strategy. Only then request explicit operator approval for push, Cloudflare Pages activation, DNS and portal publication. No auto-publication from this document.
