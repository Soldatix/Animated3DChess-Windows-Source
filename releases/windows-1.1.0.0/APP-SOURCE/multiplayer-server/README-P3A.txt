Animated 3D Chess V1.1 — P3-A server hardening (LOCAL ONLY)

Changes:
- P1 baseline src/index.mjs is replaced after exact SHA256 verification.
- New pure module src/securityPolicy.mjs and its node tests.
- Fixed-window throttling for create (8/min), join (24/min), WS upgrade (36/min) per Cloudflare CF-Connecting-IP identity, persisted in hashed-key Durable Objects.
- Missing IP grouped into one shared conservative bucket (may block legitimate users on unsupported endpoints; production must run on Cloudflare edge).
- Unauthenticated WebSocket closes after 10 seconds via DO alarm; no JS timers, compatible with hibernation.
- Automatic alarms also clear unused rate-limit counters; room expiration alarm preserved.

Not covered yet:
- Cloudflare plan/account and WAF configuration; distributed abuse or DDoS remains possible.
- Native Windows secure token storage, Tauri CSP, least-privilege API, CORS/origin policy and privacy review.
- FIDE claim parity, bot policy, accessibility, load tests and production reliability.
- No external HTTPS/WSS deployment. Existing local game may reload if server runs during file changes; stop Wrangler before installation.

After successful install and npm ci already present:
  cd multiplayer-server
  npm run check
  npm test
  npm run smoke
  node scripts/security-smoke-runner.mjs

No git push, Cloudflare deploy, or Store upload in this package.
