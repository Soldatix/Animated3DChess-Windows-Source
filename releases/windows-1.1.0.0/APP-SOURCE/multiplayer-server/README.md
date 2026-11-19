# Animated 3D Chess V1.1 — Online Multiplayer P1 (LOCAL ONLY)

**Status:** early server prototype. NOT production-ready. **NO GitHub push, no Cloudflare deployment, no Store update.**

This folder is an isolated component; it does not modify `src/App.tsx`, `src/wizardChessEngine.js`, Stockfish, current Web/PWA or Microsoft Store v1.0.

## Architecture

- One Cloudflare Worker routes private room requests to one SQLite-backed Durable Object per room code.
- `chess.js@1.4.0` validates all proposed moves on the server against replayed history (including castling, en passant and promotion).
- Per-seat 256-bit random bearer tokens, hashed at rest, are not included in public room state.
- Clients submit moves via authenticated HTTP with `expectedPly` and unique `clientMoveId`; WebSocket Hibernation notifies both authenticated players of server-accepted snapshots.
- WebSockets authenticate with their **first message**, never via query-string token; unauthenticated clients cannot receive room state.
- No localStorage, no BroadcastChannel, no optimistic move acceptance. No third player and no spectators.
- Idle rooms expire: waiting 1 hour, playing 48 hours, finished 6 hours. An alarm erases the entire room storage.
- The server stores state. The V1.1 Windows UI and replay/animation adapter are a separate next stage.

## Requirements

Windows 11, Node.js 24, npm. The first `npm install` requires internet access to npm registry (free/open-source packages).

Run locally inside this folder:

```powershell
npm install --no-audit --no-fund
npm run check
npm test
npm run smoke
```

`npm run smoke` starts a **local** Wrangler Worker on `127.0.0.1:8788`, creates a private room, joins a second player, connects two WebSockets, verifies token isolation, turn order, deduplication, synchronization and resignation, then stops the local Worker. No Cloudflare login or deploy is required.

If port 8788 is occupied, stop the process that owns the port **only after checking what it is**; do not blindly terminate unrelated software.

## Protocol v1 (client integration later)

All HTTP endpoints are relative to the Worker base (`http://127.0.0.1:8788` for local smoke).

1. `POST /v1/rooms` JSON `{ "preferredColor": "w" }` -> `{ok,code,side,token,room}`
2. `POST /v1/rooms/{CODE}/join` -> `{ok,code,side,token,room}` (second player only; server generates token)
3. `GET /v1/rooms/{CODE}/state` with `Authorization: Bearer <token>` -> authoritative snapshot
4. `POST /v1/rooms/{CODE}/move` with bearer token + JSON `{ "clientMoveId":"secure-unique-id", "expectedPly":0, "from":"e2", "to":"e4" }`. Add `"promotion":"q"|"r"|"b"|"n"` when promoting. All move IDs are per-client unique strings at least 8 chars. Returns `{ok,duplicate,room}`; HTTP `409` on illegal, stale or wrong-turn moves.
5. `POST /v1/rooms/{CODE}/draw-offer`; `POST /v1/rooms/{CODE}/draw-response` JSON `{ "accept": true|false }`; `POST /v1/rooms/{CODE}/resign`, all bearer-authenticated.
6. `GET /v1/rooms/{CODE}/connect` with WebSocket upgrade -> `hello`, then send `{"type":"auth","token":"<token>"}` as first message. Authenticated sockets receive `{type:"authenticated",side,room}`, `{type:"state",room}` and `{type:"presence",online}`; send `{type:"sync"}` to request a fresh snapshot. HTTP GET is not a substitute for WS upgrade.

Tokens are private per player and should be stored only in protected app-local per-user storage (Windows integration stage). Do not put tokens in invitation links, URLs, logs, git, code, screenshots or analytics. The shareable invitation contains only the room code. Room codes are 10 characters from a 32-character alphabet (~50 bits).

## Release blockers (must be resolved before any remote deployment)

- Security review of unauthenticated room creation/connection abuse, edge rate limits and Cloudflare quota exhaustion; current local prototype only caps WebSockets per room.
- Integration with Windows UI through an explicit network adapter. Existing old `/api/rooms` + localStorage/BroadcastChannel fallback must be bypassed/retired in online mode. No false-connected UI or optimistic move acceptance.
- Ensure animations and strict move admission handle server-authorized castling, en passant, queen/underpromotion and board resync; reject or handle unimplemented animations explicitly.
- Match existing strict FIDE draw-claim policy: this P1 backend uses the chess.js automatic draw interpretation and is NOT yet a final policy parity implementation.
- Connection loss, durable reconnect, re-auth, multi-window behavior, stolen/lost token, malicious client, replay, race, DoS and browser-origin testing.
- Store-app WebView2 / Tauri allowed-origin and CSP configuration, Windows/Windows real-network testing, licensing, README and reproducible dependency lockfile after install.
- Finish independent review, integration tests and explicit human approval before GitHub push, any Cloudflare deploy or MSIX upload.

Official docs: https://developers.cloudflare.com/durable-objects/ and https://developers.cloudflare.com/workers/local-development/
