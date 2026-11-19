import { DurableObject } from 'cloudflare:workers';
import {
  ROOM_TTL_MS, newRoom, joinRoom, publicRoom, seatOf, isExpired,
  applyMove, resign, offerDraw, answerDraw, claimDraw,
} from './game.mjs';
import { RATE_LIMITS, evaluateRateWindow, socketDeadline, nextSocketAlarm, consumeSocketBudget, SOCKET_LIMITS } from './securityPolicy.mjs';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_ORIGINS = new Set([
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://tauri.localhost', 'https://tauri.localhost',
]);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
const error = (reason, status = 400) => json({ ok: false, error: reason }, status);
const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const code = () => {
  // Rejection-sampling for unbiased characters (alphabet length 32).
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map(b => ROOM_CODE_ALPHABET[b & 31]).join('');
};
const digest = async (value) => {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
};
const validToken = t => typeof t === 'string' && /^[A-Za-z0-9_-]{40,80}$/.test(t);
const validCode = c => typeof c === 'string' && /^[A-HJ-NP-Z2-9]{10}$/.test(c);

// One strict Durable Object counter per (action, Cloudflare edge identity).
// An unknown identity is SHARED, not unlimited. This is an abuse guard,
// not an alternative to Cloudflare's deployment-level WAF/bot mitigation.
async function checkRateLimit(request, env, action) {
  const candidate = request.headers.get('CF-Connecting-IP');
  // Workers receives this from Cloudflare edge in production. Never trust a
  // client-provided userId or X-Forwarded-For parameter for this decision.
  const identity = candidate && candidate.length <= 64 ? candidate : 'unknown';
  const id = `rate-v1-${action}-${await digest(identity)}`;
  try {
    const response = await env.CHESS_ROOMS.getByName(id).fetch('https://room.internal/_rate/' + action, { method: 'POST' });
    if (response.status === 204) return null;
    if (response.status === 429) return response;
  } catch { /* fail closed if the limiter binding/storage is unavailable */ }
  return error('rate-limiter-unavailable', 503);
}

async function readJson(request) {
  if ((Number(request.headers.get('content-length')) || 0) > 4096) throw new Error('body-too-large');
  if (!request.body) return {};
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new Error('body-too-large'); }
    chunks.push(value);
  }
  const full = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { full.set(chunk, offset); offset += chunk.length; }
  const parsed = size ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(full)) : {};
  // Each room endpoint expects a JSON object; null and arrays are valid JSON
  // syntax but must never reach field access or game actions.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-json-object');
  return parsed;
}

function allowOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return { ok: true, origin: null };
  const extras = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (![...DEFAULT_ORIGINS, ...extras].includes(origin)) return { ok: false, origin };
  return { ok: true, origin };
}
function cors(response, origin) {
  if (!origin || response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

// Public Worker entry point. No production domain or route in the Wrangler configuration.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowOrigin(request, env);
    if (!origin.ok) return error('origin-not-allowed', 403);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin.origin);
    if (url.pathname === '/health' && request.method === 'GET')
      return cors(json({ ok: true, service: 'chess-multiplayer', protocol: 1 }), origin.origin);
    if (request.method === 'POST' && url.pathname === '/v1/rooms') {
      const throttle = await checkRateLimit(request, env, 'create');
      if (throttle) return cors(throttle, origin.origin);
      let body;
      try { body = await readJson(request); } catch { return cors(error('invalid-json-or-size'), origin.origin); }
      if (!['w', 'b'].includes(body.preferredColor)) return cors(error('invalid-color'), origin.origin);
      for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = code();
        const joinToken = token();
        const stub = env.CHESS_ROOMS.getByName(roomCode);
        const response = await stub.fetch('https://room.internal/create', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: roomCode, token: joinToken, preferredColor: body.preferredColor }),
        });
        if (response.status === 409) continue; // Collisions do not replace existing rooms.
        return cors(response, origin.origin);
      }
      return cors(error('room-allocation-failed', 503), origin.origin);
    }
    const match = url.pathname.match(/^\/v1\/rooms\/([A-HJ-NP-Z2-9]{10})(?:\/(state|join|move|resign|draw-offer|draw-response|claim-draw|connect))?$/);
    if (!match || !validCode(match[1])) return cors(error('not-found', 404), origin.origin);
    const [_, roomCode, action] = match;
    const allowed = (action === 'state' && request.method === 'GET') ||
      (action === 'connect' && request.method === 'GET') ||
      (['join','move','resign','draw-offer','draw-response','claim-draw'].includes(action) && request.method === 'POST');
    if (!allowed) return cors(error('method-not-allowed', 405), origin.origin);
    const internal = new URL(`https://room.internal/${action}`);
    // Every public room action consumes a bounded per-IP budget BEFORE
    // the Durable Object is accessed. Join/connect retain their own caps.
    const rateAction = (action === 'join' || action === 'connect') ? action : 'room';
    const throttle = await checkRateLimit(request, env, rateAction);
    if (throttle) return cors(throttle, origin.origin);
    if (action === 'join') {
      const response = await env.CHESS_ROOMS.getByName(roomCode).fetch(internal, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token() }),
      });
      return cors(response, origin.origin);
    }
    const headers = new Headers(request.headers);
    headers.delete('cookie');
    const init = { method: request.method, headers, ...(request.body ? { body: request.body, duplex: 'half' } : {}) };
    const response = await env.CHESS_ROOMS.getByName(roomCode).fetch(new Request(internal, init));
    return cors(response, origin.origin);
  },
};

export class ChessRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = ctx.storage.sql;
    this.pendingAuthTimers = new Map();
    // Defensive after a runtime restart: recover pending unauthenticated sockets.
    for (const ws of ctx.getWebSockets()) this.armAuthTimeout(ws);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  readRoom() {
    try {
      const rows = [...this.db.exec('SELECT data FROM chess_room WHERE id = 1')];
      return rows.length ? JSON.parse(rows[0].data) : null;
    } catch (e) {
      if (String(e).includes('no such table')) return null;
      throw e;
    }
  }
  writeRoom(room) {
    this.db.exec('CREATE TABLE IF NOT EXISTS chess_room (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    this.db.exec('INSERT INTO chess_room (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(room));
  }
  // A short-lived timer is a fail-safe for an UNAUTHENTICATED connection only.
  // It is cleared immediately on successful auth, preserving hibernation for live games.
  // The persisted Durable Object alarm remains the secondary deadline mechanism.
  armAuthTimeout(ws) {
    if (this.pendingAuthTimers.has(ws)) return;
    const info = ws.deserializeAttachment() || {};
    if (info.side || !Number.isFinite(info.authDeadline) || ws.readyState >= 2) return;
    const ms = Math.max(1, info.authDeadline - Date.now());
    const timer = setTimeout(() => {
      this.pendingAuthTimers.delete(ws);
      const current = ws.deserializeAttachment() || {};
      if (current.side || ws.readyState >= 2) return;
      if (Number.isFinite(current.authDeadline) && Date.now() < current.authDeadline) {
        this.armAuthTimeout(ws); // Defensive against a slightly early timer.
        return;
      }
      ws.serializeAttachment({ side: null, authDeadline: null });
      try { ws.close(1008, 'auth-timeout'); } catch { /* already disconnected */ }
    }, ms);
    this.pendingAuthTimers.set(ws, timer);
  }
  clearAuthTimeout(ws) {
    const timer = this.pendingAuthTimers.get(ws);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingAuthTimers.delete(ws);
    }
  }
  async expiry(room, newlyAcceptedSocketDeadline = Infinity) {
    // Store the earliest alarm even if getWebSockets() does not yet expose
    // a WebSocket whose HTTP 101 upgrade is still in progress.
    const deadline = Math.min(
      nextSocketAlarm(room.updatedAt + ROOM_TTL_MS[room.status], this.ctx.getWebSockets()),
      newlyAcceptedSocketDeadline,
    );
    await this.ctx.storage.setAlarm(deadline);
  }
  async authHash(request) {
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const candidate = auth.slice(7);
    if (!validToken(candidate)) return null;
    // Hash first, then authorize against the CURRENT room after the await.
    return digest(candidate);
  }
  broadcast(room) {
    const data = JSON.stringify({ type: 'state', room: publicRoom(room) });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.side) {
        try { ws.send(data); } catch { /* closed socket */ }
      }
    }
  }
  presence() {
    const online = { w: false, b: false };
    for (const ws of this.ctx.getWebSockets()) {
      const side = ws.readyState === 1 ? ws.deserializeAttachment()?.side : null;
      if (side === 'w' || side === 'b') online[side] = true;
    }
    const data = JSON.stringify({ type: 'presence', online });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.side) {
        try { ws.send(data); } catch { /* closed socket */ }
      }
    }
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    // Internal rate-limit requests never run the room lifecycle; the room and
    // limiter keys have separate getByName namespaces.
    if (path.startsWith('/_rate/') && request.method === 'POST') {
      const action = path.slice('/_rate/'.length);
      const rule = RATE_LIMITS[action];
      if (!rule) return error('invalid-rate-action', 404);
      this.db.exec('CREATE TABLE IF NOT EXISTS request_limit (id INTEGER PRIMARY KEY, reset_at INTEGER NOT NULL, hits INTEGER NOT NULL)');
      const stored = [...this.db.exec('SELECT reset_at, hits FROM request_limit WHERE id = 1')][0] || null;
      const checked = evaluateRateWindow(stored, Date.now(), rule);
      // Once a window is exhausted, do not rewrite the identical saturated
      // counter for every denied request (429 still incurs a DO request/read).
      if (!stored || stored.reset_at !== checked.state.reset_at || stored.hits !== checked.state.hits) {
        this.db.exec('INSERT INTO request_limit (id, reset_at, hits) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET reset_at = excluded.reset_at, hits = excluded.hits', checked.state.reset_at, checked.state.hits);
      }
      if (!stored || stored.reset_at !== checked.state.reset_at) await this.ctx.storage.setAlarm(checked.state.reset_at + 1000);
      return checked.allowed ? new Response(null, { status: 204 }) : json({ ok: false, error: 'rate-limited' }, 429, { 'retry-after': String(checked.retryAfter) });
    }
    if (path === '/create' && request.method === 'POST') {
      let body;
      try { body = await readJson(request); } catch { return error('invalid-json-or-size'); }
      if (!validCode(body.code) || !validToken(body.token) || !['w', 'b'].includes(body.preferredColor)) return error('invalid-create');
      const hostHash = await digest(body.token);
      // No async boundary between this read, validation, and the SQL write.
      if (this.readRoom()) return error('room-exists', 409);
      const room = newRoom(body.code, body.preferredColor, hostHash, Date.now());
      this.writeRoom(room);
      const response = json({ ok: true, code: room.code, side: body.preferredColor, token: body.token, room: publicRoom(room) }, 201);
      await this.expiry(this.readRoom() || room);
      return response;
    }
    if (path === '/connect') {
      const room = this.readRoom();
      if (!room || isExpired(room, Date.now())) return error('room-not-found', 404);
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return error('websocket-required', 426);
      const activeSockets = this.ctx.getWebSockets().filter(ws => ws.readyState === 1);
      // Reserve active capacity for BOTH seats. Unauthenticated sockets get
      // at most two short-lived pending slots; authenticated seats each get
      // at most two sockets, with old connections replaced on reconnect.
      const pending = activeSockets.filter(ws => !ws.deserializeAttachment()?.side);
      if (activeSockets.length >= 6 || pending.length >= 2) return error('room-connection-limit', 429);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      const deadline = socketDeadline(Date.now());
      server.serializeAttachment({ side: null, authDeadline: deadline });
      this.armAuthTimeout(server);
      await this.expiry(this.readRoom() || room, deadline);
      server.send(JSON.stringify({ type: 'hello', protocol: 1 }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === '/join' && request.method === 'POST') {
      let body;
      try { body = await readJson(request); } catch { return error('invalid-json-or-size'); }
      if (!validToken(body.token)) return error('invalid-token');
      const guestHash = await digest(body.token);
      // A parallel join may have filled the seat while JSON/hash awaited.
      const current = this.readRoom();
      if (!current || isExpired(current, Date.now())) return error('room-not-found', 404);
      const joined = joinRoom(current, guestHash, Date.now());
      if (!joined.ok) return error(joined.reason, joined.status);
      const room = joined.room;
      this.writeRoom(room);
      this.broadcast(room);
      const response = json({ ok: true, code: room.code, side: joined.side, token: body.token, room: publicRoom(room) });
      await this.expiry(this.readRoom() || room);
      return response;
    }
    // Preserve the original 404 priority for rooms that do not exist.
    // This preliminary read is NEVER used for a write.
    const first = this.readRoom();
    if (!first || isExpired(first, Date.now())) return error('room-not-found', 404);
    const identityHash = await this.authHash(request);
    if (!identityHash) return error('unauthorized', 401);
    if (path === '/state' && request.method === 'GET') {
      const room = this.readRoom();
      if (!room || isExpired(room, Date.now())) return error('room-not-found', 404);
      const side = seatOf(room, identityHash);
      if (!side) return error('unauthorized', 401);
      return json({ ok: true, side, room: publicRoom(room) });
    }
    // The body may be delivered slowly or concurrently with another request.
    // It MUST be fully consumed before the authoritative room is read.
    let input;
    try { input = await readJson(request); } catch { return error('invalid-json-or-size'); }
    const room = this.readRoom();
    if (!room || isExpired(room, Date.now())) return error('room-not-found', 404);
    const side = seatOf(room, identityHash);
    if (!side) return error('unauthorized', 401);
    let result;
    if (path === '/move' && request.method === 'POST') result = applyMove(room, side, input, Date.now());
    else if (path === '/resign' && request.method === 'POST') result = resign(room, side, Date.now());
    else if (path === '/draw-offer' && request.method === 'POST') result = offerDraw(room, side, Date.now());
    else if (path === '/draw-response' && request.method === 'POST') result = answerDraw(room, side, input.accept, Date.now());
    else if (path === '/claim-draw' && request.method === 'POST') result = claimDraw(room, side, input, Date.now());
    else return error('method-not-allowed', 405);
    if (!result.ok) return error(result.reason, result.status);
    if (result.duplicate) return json({ ok: true, duplicate: true, room: publicRoom(room) });
    const next = result.room;
    this.writeRoom(next);
    // Broadcast and prepare HTTP response before the next async boundary;
    // otherwise a delayed alarm could reorder old state after newer state.
    this.broadcast(next);
    const response = json({ ok: true, duplicate: false, room: publicRoom(next) });
    await this.expiry(this.readRoom() || next);
    return response;
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4096) { ws.close(1008, 'invalid-message'); return; }
    let body;
    try { body = JSON.parse(message); } catch { ws.close(1008, 'invalid-json'); return; }
    const attachment = ws.deserializeAttachment() || {};
    if (!attachment.side) {
      if (!Number.isFinite(attachment.authDeadline) || Date.now() >= attachment.authDeadline) {
        this.clearAuthTimeout(ws);
        ws.close(1008, 'auth-timeout');
        const room = this.readRoom();
        if (room) await this.expiry(room);
        return;
      }
      if (body?.type !== 'auth' || !validToken(body.token)) { ws.close(1008, 'auth-required'); return; }
      const room = this.readRoom();
      if (!room || isExpired(room, Date.now())) { ws.close(1008, 'room-expired'); return; }
      const candidateHash = await digest(body.token);
      const current = this.readRoom();
      if (!current || isExpired(current, Date.now()) || ws.readyState !== 1) {
        ws.close(1008, 'room-expired'); return;
      }
      const side = seatOf(current, candidateHash);
      if (!side) { ws.close(1008, 'unauthorized'); return; }
      this.clearAuthTimeout(ws);
      ws.serializeAttachment({ side });
      // One player must not monopolize both seats' WebSocket capacity.
      // New/recovering connection wins; keep at most one other open socket
      // for the same seat. Closing happens after new identity is verified.
      const previous = this.ctx.getWebSockets().filter(old =>
        old !== ws && old.readyState === 1 && old.deserializeAttachment()?.side === side);
      while (previous.length >= 2) {
        const old = previous.shift();
        old.serializeAttachment({});
        try { old.close(1000, 'session-replaced'); } catch {}
      }
      await this.expiry(current);
      ws.send(JSON.stringify({ type: 'authenticated', side, room: publicRoom(room) }));
      this.presence();
      return;
    }
    // Persist small per-socket budgets in the hibernation attachment.
    // All messages are counted; expensive full-history sync has a tighter
    // independent cap. The auto-response text 'ping'/'pong' remains intact.
    const now = Date.now();
    const total = consumeSocketBudget(attachment.messageBudget, now, SOCKET_LIMITS.messages);
    if (!total.allowed) { ws.close(1008, 'message-rate-limit'); return; }
    const nextAttachment = { ...attachment, messageBudget: total.state };
    if (body?.type === 'sync') {
      const synced = consumeSocketBudget(attachment.syncBudget, now, SOCKET_LIMITS.sync);
      if (!synced.allowed) { ws.close(1008, 'sync-rate-limit'); return; }
      nextAttachment.syncBudget = synced.state;
      ws.serializeAttachment(nextAttachment);
      const room = this.readRoom();
      if (room) ws.send(JSON.stringify({ type: 'state', room: publicRoom(room) }));
    } else {
      ws.serializeAttachment(nextAttachment);
      if (body?.type !== 'ping') ws.send(JSON.stringify({ type: 'error', error: 'unsupported-message' }));
    }
  }
  async webSocketClose(ws) {
    this.clearAuthTimeout(ws);
    ws.serializeAttachment({});
    this.presence();
    const room = this.readRoom();
    if (room) await this.expiry(room);
  }
  async webSocketError(ws) {
    this.clearAuthTimeout(ws);
    ws.serializeAttachment({});
    this.presence();
    const room = this.readRoom();
    if (room) await this.expiry(room);
  }

  async alarm() {
    const room = this.readRoom();
    if (!room) {
      // Per-identity limiter objects have no chess room. Purge expired counters.
      const rows = [...this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='request_limit'")];
      if (rows.length) {
        const record = [...this.db.exec('SELECT reset_at FROM request_limit WHERE id = 1')][0];
        if (record && record.reset_at > Date.now()) {
          await this.ctx.storage.setAlarm(record.reset_at + 1000);
          return;
        }
      }
      await this.ctx.storage.deleteAll();
      return;
    }
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const session = ws.deserializeAttachment() || {};
      if (ws.readyState === 1 && !session.side && (!Number.isFinite(session.authDeadline) || session.authDeadline <= now)) {
        this.clearAuthTimeout(ws);
        ws.serializeAttachment({ side: null, authDeadline: null });
        try { ws.close(1008, 'auth-timeout'); } catch {}
      }
    }
    const remaining = room.updatedAt + ROOM_TTL_MS[room.status] - now;
    if (remaining > 0) { await this.expiry(room); return; }
    for (const ws of this.ctx.getWebSockets()) {
      this.clearAuthTimeout(ws);
      try { ws.close(1000, 'room-expired'); } catch {}
    }
    await this.ctx.storage.deleteAll();
  }
}
