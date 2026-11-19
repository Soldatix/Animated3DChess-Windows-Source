import assert from 'node:assert/strict';
const BASE = 'http://127.0.0.1:8793';
async function http(path, method = 'GET', body, token) {
  const response = await fetch(BASE + path, {
    method, headers: { ...(body ? { 'content-type':'application/json' } : {}),
      ...(token ? { authorization:`Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}
async function socketConnect(room, token) {
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + `/v1/rooms/${room}/connect`);
  const messages = [];
  let resolveAuth, rejectAuth;
  const authorized = new Promise((resolve,reject) => { resolveAuth=resolve; rejectAuth=reject; });
  const timeout = setTimeout(() => rejectAuth(Error('AUTHENTICATION_TIMEOUT')), 6000);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type:'auth', token })), { once:true });
  ws.addEventListener('message', evt => {
    try {
      const value = JSON.parse(String(evt.data));
      messages.push(value);
      if (value.type === 'authenticated') resolveAuth(value);
    } catch {}
  });
  ws.addEventListener('error', () => rejectAuth(Error('WS_ERROR')), { once:true });
  try {
    await authorized;
    return { ws, messages };
  } finally { clearTimeout(timeout); }
}
export async function smokeAvailability() {
  const created = await http('/v1/rooms','POST',{preferredColor:'w'});
  assert.equal(created.status, 201);
  const {code, token:host} = created.data;
  const guest = await http(`/v1/rooms/${code}/join`,'POST',{});
  assert.equal(guest.status, 200);
  const clients = [];
  try {
    for (let i = 0; i < 8; i++) clients.push(await socketConnect(code, host));
    const opponent = await socketConnect(code, guest.data.token);
    clients.push(opponent);
    assert.equal(opponent.messages.some(x => x.type==='authenticated'),true);
    console.log('P3B2_EIGHT_HOST_RECONNECTS_OPPONENT_AUTH=PASS');
  } finally {
    for (const {ws} of clients) try { ws.close(); } catch {}
  }
  const checks = [];
  for (let i = 0; i < 125; i++) checks.push(await http(`/v1/rooms/${code}/state`, 'GET', undefined, host));
  const allowed = checks.filter(x=>x.status===200).length;
  const blocked = checks.filter(x=>x.status===429).length;
  assert.equal(allowed, 120, `unexpected room HTTP 200 count ${allowed}`);
  assert.equal(blocked, 5, `unexpected room HTTP 429 count ${blocked}`);
  console.log('P3B2_SHARED_ROOM_HTTP_LIMIT_120_AND_429=PASS');
  console.log('P3B2_AVAILABILITY_SMOKE=PASS');
}
