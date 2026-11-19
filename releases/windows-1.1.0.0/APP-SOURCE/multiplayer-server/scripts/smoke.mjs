import assert from 'node:assert/strict';

const BASE = process.env.CHESS_TEST_URL || 'http://127.0.0.1:8788';
async function api(path, method = 'GET', body, token) {
  const response = await fetch(BASE + path, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
class WsClient {
  constructor() { this.queue = []; this.waiters = []; }
  static async connect(path, token) {
    const client = new WsClient();
    client.ws = new WebSocket(BASE.replace(/^http/, 'ws') + path);
    client.ws.addEventListener('message', evt => {
      const msg = JSON.parse(evt.data);
      const idx = client.waiters.findIndex(w => w.type === msg.type && (!w.predicate || w.predicate(msg)));
      if (idx >= 0) client.waiters.splice(idx, 1)[0].resolve(msg);
      else client.queue.push(msg);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('websocket-open-timeout')), 7000);
      client.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      client.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('websocket-connect-error')); }, { once: true });
    });
    client.ws.send(JSON.stringify({ type:'auth', token }));
    await client.next('authenticated');
    return client;
  }
  next(type, predicate) {
    const idx = this.queue.findIndex(m => m.type === type && (!predicate || predicate(m)));
    if (idx >= 0) return Promise.resolve(this.queue.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve: (value) => { clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error('websocket-message-timeout:' + type));
      }, 7000);
      this.waiters.push(waiter);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

export async function smoke() {
  const health = await api('/health');
  assert.equal(health.data.service, 'chess-multiplayer');
  const created = await api('/v1/rooms', 'POST', { preferredColor: 'w' });
  assert.equal(created.status, 201);
  const { code, token: whiteToken } = created.data;
  assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(created.data.room.status, 'waiting');
  assert.equal((await api(`/v1/rooms/${code}/state`)).status, 401);
  const beforeJoin = await api(`/v1/rooms/${code}/move`, 'POST', {
    clientMoveId: 'move_before_join', expectedPly: 0, from:'e2',to:'e4'
  }, whiteToken);
  assert.equal(beforeJoin.status, 409);
  const joined = await api(`/v1/rooms/${code}/join`, 'POST');
  assert.equal(joined.status, 200);
  assert.equal(joined.data.side, 'b');
  assert.equal((await api(`/v1/rooms/${code}/join`, 'POST')).status, 409);
  const blackToken = joined.data.token;
  assert.notEqual(blackToken, whiteToken);
  const white = await WsClient.connect(`/v1/rooms/${code}/connect`, whiteToken);
  const black = await WsClient.connect(`/v1/rooms/${code}/connect`, blackToken);
  try {
    const wrong = await api(`/v1/rooms/${code}/move`, 'POST', {
      clientMoveId: 'blackwrongturn', expectedPly: 0, from:'e7',to:'e5'
    }, blackToken);
    assert.equal(wrong.status, 409);
    const firstMove = { clientMoveId: 'move_e2e4_001', expectedPly: 0, from:'e2',to:'e4' };
    const first = await api(`/v1/rooms/${code}/move`, 'POST', firstMove, whiteToken);
    assert.equal(first.data.ok, true);
    assert.equal(first.data.room.ply, 1);
    const seenByBlack = await black.next('state', m => m.room.ply === 1);
    assert.equal(seenByBlack.room.lastMove.from, 'e2');
    const duplicate = await api(`/v1/rooms/${code}/move`, 'POST', firstMove, whiteToken);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.room.ply, 1);
    const second = await api(`/v1/rooms/${code}/move`, 'POST', {
      clientMoveId: 'move_e7e5_002', expectedPly: 1, from:'e7',to:'e5'
    }, blackToken);
    assert.equal(second.data.room.ply, 2);
    await white.next('state', m => m.room.ply === 2);
    const resigned = await api(`/v1/rooms/${code}/resign`, 'POST', {}, blackToken);
    assert.equal(resigned.data.room.status, 'finished');
    assert.equal(resigned.data.room.result.winner, 'w');
    const external = JSON.stringify(resigned.data.room);
    assert.equal(external.includes(whiteToken), false);
    assert.equal(external.includes(blackToken), false);
    console.log('CHESS_MULTIPLAYER_HTTP_WS_SMOKE=PASS');
    console.log('CREATE_JOIN_AUTH_TURNS_IDEMPOTENCY_SYNC_RESIGN_REDACTION=PASS');
  } finally {
    white.close(); black.close();
  }
}
