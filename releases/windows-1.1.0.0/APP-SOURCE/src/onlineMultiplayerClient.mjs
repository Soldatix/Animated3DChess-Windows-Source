// P2-G: P1 authoritative multiplayer transport with bounded local recovery.
// Never fabricate room state or commit a move before server confirmation.
import { createOnlineSessionStore } from './onlineMultiplayerSessionStore.mjs';
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{10}$/;
const MOVE_ID = /^[A-Za-z0-9_-]{8,80}$/;
function checkBase(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !['http:', 'https:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new Error('invalid-server-url');
  }
  return url.origin;
}
export class OnlineProtocolError extends Error {
  constructor(reason, status = 0) { super(reason); this.name = 'OnlineProtocolError'; this.status = status; }
}
export class OnlineMultiplayerClient {
  constructor({baseUrl, onRoom = () => {}, onConnection = () => {},
    fetchImpl = globalThis.fetch.bind(globalThis), WebSocketImpl = globalThis.WebSocket,
    retryMs = 2200, sessionStore,
    setTimeoutImpl = globalThis.setTimeout.bind(globalThis),
    clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis)}) {
    this.baseUrl = checkBase(baseUrl);
    this.onRoom = onRoom;
    this.onConnection = onConnection;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
    this.retryMs = retryMs;
    this.store = sessionStore ?? createOnlineSessionStore({baseUrl:this.baseUrl});
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.code = null;
    this.side = null;
    this.#token = null;
    this.room = null;
    this.socket = null;
    this.status = 'disconnected';
    this.closed = false;
    this.#timer = null;
    this.#generation = 0;
    this.#busy = false;
    this.#uncertain = null;
  }
  #token;
  #timer;
  #generation;
  #busy;
  #uncertain;
  #publish(status) { this.status = status; this.onConnection(status); }
  #dropSession(reason) {
    if (this.closed) return;
    this.store.clear();
    ++this.#generation;
    this.clearTimeoutImpl(this.#timer);
    this.#timer = null;
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.#token = null;
    this.#uncertain = null;
    this.#busy = false;
    this.#publish('expired');
    // No token or other private metadata in the published reason.
  }
  async #request(path, method = 'GET', body = undefined, auth = false) {
    if (this.closed) throw new OnlineProtocolError('session-closed');
    const response = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: { ...(body !== undefined ? {'content-type':'application/json'} : {}),
        ...(auth ? {'authorization':`Bearer ${this.#token}`} : {}) },
      ...(body !== undefined ? {body:JSON.stringify(body)} : {}),
      cache:'no-store',
      signal: typeof globalThis.AbortSignal?.timeout === 'function' ? globalThis.AbortSignal.timeout(8000) : undefined,
    });
    let data;
    try { data = await response.json(); } catch { throw new OnlineProtocolError('invalid-server-response', response.status); }
    if (!response.ok || data?.ok !== true) {
      throw new OnlineProtocolError(String(data?.error || data?.reason || 'server-rejected'), response.status);
    }
    return data;
  }
  #requireSession() {
    if (!this.code || !this.#token || !this.side || this.closed) throw new OnlineProtocolError('not-in-room');
  }
  // Native vault lookup is asynchronous. Let the existing engine attempt the
  // guarded restore; restoreSaved() will return null if no credential exists.
  hasSavedSession() { return this.store.requiresAsyncLookup ? true : Boolean(this.store.load()); }
  forgetSavedSession() { this.store.clear(); }
  async create(preferredColor = 'w') {
    if (this.code || this.closed) throw new OnlineProtocolError('already-started');
    if (!['w','b'].includes(preferredColor)) throw new OnlineProtocolError('invalid-color');
    this.#publish('connecting');
    try { return await this.#enter(await this.#request('/v1/rooms','POST',{preferredColor})); }
    catch (e) { this.#publish('disconnected'); throw e; }
  }
  async join(code) {
    if (this.code || this.closed) throw new OnlineProtocolError('already-started');
    const upper = String(code || '').trim().toUpperCase();
    if (!ROOM_CODE.test(upper)) throw new OnlineProtocolError('invalid-room-code');
    this.#publish('connecting');
    try { return await this.#enter(await this.#request(`/v1/rooms/${upper}/join`, 'POST',{})); }
    catch (e) { this.#publish('disconnected'); throw e; }
  }
  async #enter(data) {
    if (!ROOM_CODE.test(data.code) || !['w','b'].includes(data.side) ||
        typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{40,80}$/.test(data.token) || data?.room?.code !== data.code) {
      throw new OnlineProtocolError('invalid-session-response');
    }
    this.code = data.code;
    this.side = data.side;
    this.#token = data.token;
    // Windows must persist the credential in the OS vault before using the seat.
    // Browser development retains its existing local checkpoint behavior.
    let stored = false;
    try {
      stored = await (typeof this.store.saveAsync === 'function'
        ? this.store.saveAsync({code:this.code,side:this.side,token:this.#token})
        : this.store.save({code:this.code,side:this.side,token:this.#token}));
    } catch {
      if (this.store.requiresAsyncLookup) {
        this.code=null; this.side=null; this.#token=null;
        throw new OnlineProtocolError('secure-session-save-failed');
      }
    }
    if (this.store.requiresAsyncLookup && !stored) {
      this.code=null; this.side=null; this.#token=null;
      throw new OnlineProtocolError('secure-session-save-failed');
    }
    this.#publish('connecting');
    this.#acceptRoom(data.room);
    this.#connect();
    return { code:this.code, side:this.side, room:this.room };
  }
  // After a full application restart: first verify the stored credential using
  // the server's authenticated state endpoint. An offline server is transient.
  async restoreSaved() {
    if (this.code || this.closed) throw new OnlineProtocolError('already-started');
    const saved = typeof this.store.loadAsync === 'function'
      ? await this.store.loadAsync() : this.store.load();
    if (!saved) return null;
    this.code = saved.code;
    this.side = saved.side;
    this.#token = saved.token;
    this.#publish('connecting');
    try {
      const data = await this.#request(`/v1/rooms/${this.code}/state`, 'GET', undefined, true);
      if (data.side !== this.side || data.room?.code !== this.code) {
        this.#dropSession('seat-mismatch');
        return null;
      }
      this.#acceptRoom(data.room);
    } catch (e) {
      if (e instanceof OnlineProtocolError && [401,404].includes(e.status)) {
        this.#dropSession('invalid-session');
        return null;
      }
      // Offline or temporary server problem: keep token, retry WebSocket later.
    }
    this.#connect();
    return {code:this.code,side:this.side,room:this.room};
  }
  #acceptRoom(room) {
    if (!room || room.code !== this.code || !Number.isInteger(room.revision)) return;
    if (this.room && (room.revision < this.room.revision ||
      (room.revision === this.room.revision && room.ply !== this.room.ply))) return;
    this.room = room;
    const waiting = this.#uncertain;
    if (waiting && room.ply > waiting.expectedPly) {
      // Server decides if the move landed. Another move may already have followed.
      this.#uncertain = null;
    }
    this.onRoom(room);
  }
  async state() {
    this.#requireSession();
    try {
      const data = await this.#request(`/v1/rooms/${this.code}/state`, 'GET', undefined, true);
      if (data.side !== this.side || data.room?.code !== this.code) {
        this.#dropSession('seat-mismatch');
        throw new OnlineProtocolError('invalid-session',401);
      }
      this.#acceptRoom(data.room);
      return this.room;
    } catch (e) {
      if (e instanceof OnlineProtocolError && [401,404].includes(e.status)) this.#dropSession('invalid-session');
      throw e;
    }
  }
  // No optimistic move. A network-ambiguous request blocks a second new move
  // until authoritative state is recovered; reuses the same id for retry.
  async move({from,to,promotion,expectedPly,clientMoveId}) {
    this.#requireSession();
    if (this.status !== 'connected') throw new OnlineProtocolError('not-connected');
    if (this.#busy || this.#uncertain) throw new OnlineProtocolError('move-pending');
    if (!MOVE_ID.test(clientMoveId) || !Number.isInteger(expectedPly)) throw new OnlineProtocolError('invalid-move-id');
    if (this.room?.status !== 'playing' || this.room.turn !== this.side || this.room.ply !== expectedPly) {
      throw new OnlineProtocolError('not-your-turn-or-stale');
    }
    this.#busy = true;
    const body = {from,to,expectedPly,clientMoveId,...(promotion ? {promotion} : {})};
    try {
      const data = await this.#request(`/v1/rooms/${this.code}/move`, 'POST', body, true);
      this.#acceptRoom(data.room);
      return this.room;
    } catch (e) {
      if (!(e instanceof OnlineProtocolError) || e.status === 0 || e.status >= 500) {
        this.#uncertain = body;
        // Trigger reconciliation through the same authenticated session.
        // Keep the persisted token and reuse the original clientMoveId.
        try { this.socket?.close(); } catch { this.#retry(this.#generation); }
      }
      throw e;
    } finally { this.#busy = false; }
  }
  async action(action, body = {}) {
    this.#requireSession();
    if (this.status !== 'connected') throw new OnlineProtocolError('not-connected');
    if (!['resign','draw-offer','draw-response','claim-draw'].includes(action)) throw new OnlineProtocolError('invalid-action');
    const data = await this.#request(`/v1/rooms/${this.code}/${action}`, 'POST', body, true);
    this.#acceptRoom(data.room);
    return this.room;
  }
  #retryPending() {
    if (this.closed || !this.#uncertain || this.status !== 'connected' || this.#busy) return;
    const pending = this.#uncertain;
    if (this.room?.ply !== pending.expectedPly) { this.#uncertain = null; return; }
    if (this.room?.turn !== this.side || this.room?.status !== 'playing') { this.#uncertain = null; return; }
    this.#busy = true;
    void this.#request(`/v1/rooms/${this.code}/move`, 'POST', pending, true)
      .then(data => { this.#uncertain = null; this.#acceptRoom(data.room); })
      .catch(e => {
        if (e instanceof OnlineProtocolError && e.status >= 400 && e.status < 500) this.#uncertain = null;
        // Transient errors preserve the pending move. Force a new sync cycle.
        if (!(e instanceof OnlineProtocolError) || e.status === 0 || e.status >= 500) {
          try { this.socket?.close(); } catch {}
        }
      })
      .finally(() => { this.#busy = false; });
  }
  #connect() {
    if (this.closed || !this.code || !this.#token || this.status === 'expired') return;
    const gen = ++this.#generation;
    this.#publish('connecting');
    const url = this.baseUrl.replace(/^http/,'ws') + `/v1/rooms/${this.code}/connect`;
    let socket;
    try { socket = new this.WebSocketImpl(url); }
    catch { this.#retry(gen); return; }
    this.socket = socket;
    let authenticated = false;
    const watchdog = this.setTimeoutImpl(() => { if (!authenticated) socket.close(); }, 6500);
    socket.addEventListener('open', () => {
      if (this.closed || gen !== this.#generation) return;
      socket.send(JSON.stringify({type:'auth',token:this.#token}));
    });
    socket.addEventListener('message', event => {
      if (this.closed || gen !== this.#generation) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'authenticated' && msg.side === this.side && msg.room?.code === this.code) {
        authenticated = true;
        this.clearTimeoutImpl(watchdog);
        this.#acceptRoom(msg.room);
        this.#publish('connected');
        socket.send(JSON.stringify({type:'sync'}));
        this.#retryPending();
      } else if (authenticated && msg.type === 'state') {
        this.#acceptRoom(msg.room);
        this.#retryPending();
      }
    });
    const disconnected = event => {
      this.clearTimeoutImpl(watchdog);
      if (this.closed || gen !== this.#generation) return;
      if (event?.code === 1008 && ['unauthorized','room-expired'].includes(event.reason)) {
        this.#dropSession('unauthorized');
        return;
      }
      this.#publish('disconnected');
      this.#retry(gen);
    };
    socket.addEventListener('close', disconnected);
    socket.addEventListener('error', () => { try { socket.close(); } catch {} });
  }
  #retry(gen) {
    if (this.closed || !this.#token || gen !== this.#generation) return;
    this.clearTimeoutImpl(this.#timer);
    this.#timer = this.setTimeoutImpl(() => {
      if (this.closed || gen !== this.#generation) return;
      void this.state().catch(() => {}).finally(() => {
        if (!this.closed && gen === this.#generation && this.status !== 'expired') this.#connect();
      });
    }, this.retryMs);
  }
  close({forget = false} = {}) {
    // Explicit Leave must clear credentials even after a prior network/freeze close.
    if (forget) this.store.clear();
    if (this.closed) return;
    this.closed = true;
    ++this.#generation;
    this.clearTimeoutImpl(this.#timer);
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.#token = null;
    this.#uncertain = null;
    this.#busy = false;
    this.#publish('disconnected');
  }
  getPublicState() { return {code:this.code, side:this.side,room:this.room,connection:this.status,pending:Boolean(this.#uncertain)}; }
}
export function createOnlineMultiplayerClient(options) { return new OnlineMultiplayerClient(options); }
