// Local only — exercise concurrency and malformed JSON against the live Wrangler worker.
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:8792';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(path, method = 'GET', body = undefined, token = undefined, raw = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, data: await res.json() };
}
async function roomPair() {
  const created = await api('/v1/rooms', 'POST', { preferredColor: 'w' });
  assert.equal(created.status, 201, 'room creation failed');
  const joined = await api(`/v1/rooms/${created.data.code}/join`, 'POST');
  assert.equal(joined.status, 200, 'join failed');
  return { code: created.data.code, white: created.data.token, black: joined.data.token };
}
const pathFor = (room, endpoint) => `/v1/rooms/${room.code}/${endpoint}`;
async function move(room, side, from, to, ply, id) {
  return api(pathFor(room, 'move'), 'POST', { from, to, expectedPly: ply, clientMoveId: id }, room[side]);
}
async function state(room) {
  const res = await api(pathFor(room, 'state'), 'GET', undefined, room.white);
  assert.equal(res.status, 200);
  return res.data.room;
}
function pausedPost(path, token, payload = '{}') {
  // Leave JSON unfinished so a vulnerable read-before-await handler can hold a stale room.
  // Streaming is initiated using localhost only; no external networking.
  assert.ok(payload.startsWith('{') && payload.endsWith('}'));
  let resume;
  const release = new Promise(resolve => { resume = resolve; });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload.slice(0, -1)));
      release.then(() => {
        controller.enqueue(new TextEncoder().encode('}'));
        controller.close();
      });
    },
  });
  const finished = fetch(BASE + path, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: stream, duplex: 'half', signal: AbortSignal.timeout(20000),
  }).then(async res => ({ status: res.status, data: await res.json() }));
  return { finish: resume, finished };
}

export async function concurrencySmoke() {
  // F6: all JSON endpoints must handle syntactically valid but wrong-type JSON.
  for (const input of ['null', '[]']) {
    const res = await api('/v1/rooms', 'POST', input, undefined, true);
    assert.equal(res.status, 400, `create with ${input}: ${res.status}`);
    assert.equal(res.data.error, 'invalid-json-or-size');
  }
  console.log('P3B1_JSON_NULL_ARRAY_CREATE=PASS');

  // F1-A: a slow draw-offer must not erase the opponent's newly committed move.
  const a = await roomPair();
  assert.equal((await move(a, 'white', 'e2','e4',0,'race_e2e4_A_001')).status, 200);
  const offer = pausedPost(pathFor(a, 'draw-offer'), a.white);
  await delay(650);
  try {
    const black = await move(a, 'black', 'e7','e5',1,'race_e7e5_A_002');
    assert.equal(black.status, 200, `black move failed: ${JSON.stringify(black.data)}`);
  } finally { offer.finish(); }
  const offered = await offer.finished;
  assert.equal(offered.status, 200, `offer failed: ${JSON.stringify(offered.data)}`);
  const afterOffer = await state(a);
  assert.equal(afterOffer.ply, 2, 'lost move after delayed draw offer');
  assert.equal(afterOffer.drawOfferedBy, 'w');
  assert.equal(afterOffer.revision, 5, 'revision lost after delayed draw offer');
  const nullDraw = await api(pathFor(a, 'draw-response'), 'POST', 'null', a.black, true);
  assert.equal(nullDraw.status, 400);
  assert.equal((await state(a)).revision, 5);
  console.log('P3B1_DELAYED_DRAW_OFFER_MOVE_AND_JSON_NULL=PASS');

  // F1-B: a delayed resignation must retain a committed move and the final result.
  const b = await roomPair();
  assert.equal((await move(b,'white','e2','e4',0,'race_e2e4_B_001')).status, 200);
  const resignation = pausedPost(pathFor(b, 'resign'), b.white);
  await delay(650);
  try {
    const black = await move(b,'black','e7','e5',1,'race_e7e5_B_002');
    assert.equal(black.status, 200);
  } finally { resignation.finish(); }
  assert.equal((await resignation.finished).status, 200);
  const afterResign = await state(b);
  assert.equal(afterResign.ply, 2, 'lost move after delayed resignation');
  assert.equal(afterResign.status, 'finished');
  assert.equal(afterResign.result.winner, 'b');
  assert.equal(afterResign.revision, 5);
  console.log('P3B1_DELAYED_RESIGN_MOVE=PASS');

  // F1-C: two parallel joins must not both acquire the free seat.
  const created = await api('/v1/rooms', 'POST', { preferredColor: 'w' });
  assert.equal(created.status, 201);
  const roomCode = created.data.code;
  const joins = await Promise.all([
    api(`/v1/rooms/${roomCode}/join`, 'POST'),
    api(`/v1/rooms/${roomCode}/join`, 'POST'),
  ]);
  assert.deepEqual(joins.map(r => r.status).sort(), [200,409]);
  const joined = joins.find(r => r.status === 200);
  assert.equal(joined.data.room.revision, 2);
  assert.equal(joined.data.room.blackJoined, true);
  console.log('P3B1_PARALLEL_JOIN_ONE_WINNER=PASS');

  // F1-D: two concurrent moves from same side cannot both commit at ply 0.
  const c = await roomPair();
  const moves = await Promise.all([
    move(c,'white','e2','e4',0,'race_double_A_001'),
    move(c,'white','d2','d4',0,'race_double_B_001'),
  ]);
  assert.deepEqual(moves.map(r => r.status).sort(), [200,409]);
  const current = await state(c);
  assert.equal(current.ply, 1);
  assert.equal(current.revision, 3);
  console.log('P3B1_PARALLEL_MOVES_SINGLE_COMMIT=PASS');
  console.log('P3B1_CONCURRENCY_SMOKE=PASS');
}
