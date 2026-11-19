// P3-A: fixed-window pre-authentication abuse guard. Pure functions: deterministic tests.
export const RATE_LIMITS = Object.freeze({
  create: Object.freeze({ max: 8, windowMs: 60_000 }),
  join: Object.freeze({ max: 24, windowMs: 60_000 }),
  connect: Object.freeze({ max: 36, windowMs: 60_000 }),
  room: Object.freeze({ max: 120, windowMs: 60_000 }),
});
export const AUTH_WINDOW_MS = 10_000;

export function evaluateRateWindow(old, now, rule) {
  if (!Number.isFinite(now) || !rule || !Number.isInteger(rule.max) || rule.max < 1 ||
      !Number.isInteger(rule.windowMs) || rule.windowMs < 1000) throw new Error('invalid-rate-window');
  const reset = Number(old?.reset_at);
  const previousHits = Number(old?.hits);
  const fresh = !Number.isFinite(reset) || reset <= now || !Number.isInteger(previousHits) || previousHits < 0;
  const state = fresh
    ? { reset_at: now + rule.windowMs, hits: 1 }
    : { reset_at: reset, hits: Math.min(rule.max + 1, previousHits + 1) };
  return {
    allowed: fresh || state.hits <= rule.max,
    state,
    retryAfter: Math.max(1, Math.ceil((state.reset_at - now) / 1000)),
  };
}

export function socketDeadline(now) { return now + AUTH_WINDOW_MS; }
export function nextSocketAlarm(roomExpiry, websockets) {
  let earliest = roomExpiry;
  for (const ws of websockets) {
    if (ws.readyState === 2 || ws.readyState === 3) continue;
    const info = ws.deserializeAttachment() || {};
    if (!info.side && Number.isFinite(info.authDeadline)) earliest = Math.min(earliest, info.authDeadline);
  }
  return earliest;
}

// WS per-connection work limits. Small enough to protect room reconstruction,
// generous for normal 2-player moves, reconnect, sync and heartbeat.
export const SOCKET_LIMITS = Object.freeze({
  messages: Object.freeze({ max: 40, windowMs: 10_000 }),
  sync: Object.freeze({ max: 6, windowMs: 10_000 }),
});

export function consumeSocketBudget(old, now, rule) {
  if (!Number.isFinite(now) || !rule || !Number.isInteger(rule.max) || rule.max < 1 ||
      !Number.isInteger(rule.windowMs) || rule.windowMs < 1000) throw new Error('invalid-socket-budget');
  const reset = Number(old?.resetAt);
  const hits = Number(old?.hits);
  const fresh = !old || !Number.isFinite(reset) || reset <= now || !Number.isInteger(hits) || hits < 0;
  const state = fresh ? { resetAt: now + rule.windowMs, hits: 1 }
    : { resetAt: reset, hits: Math.min(rule.max + 1, hits + 1) };
  return { allowed: fresh || state.hits <= rule.max, state };
}
