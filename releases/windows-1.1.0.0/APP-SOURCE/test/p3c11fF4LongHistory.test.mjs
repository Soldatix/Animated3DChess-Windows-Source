// P3-C11F-F4: cross-layer parity for legitimate multiplayer games beyond ply 800.
// Deterministic, in-memory. No network, remote Worker, credentials, or file writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { newRoom, joinRoom, applyMove, publicRoom } from '../multiplayer-server/src/game.mjs';
import { validateOnlineSnapshot, assertOnlinePrefix } from '../src/onlineMultiplayerReplay.mjs';

const CODE = 'ABCDEFGH23';
const TARGET = 826;

// Construct a genuine continuous legal game. Avoid 75-move and fivefold automatic
// endings while preferring non-captures and occasionally advancing a pawn.
function makeHistory(seed) {
  const chess = new Chess();
  const history = [];
  const seen = new Map();
  let rng = seed >>> 0;
  const random = () => {
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
    return (rng >>> 0) / 4294967296;
  };
  const posKey = () => chess.fen().split(' ').slice(0,4).join(' ');
  seen.set(posKey(),1);
  for (let ply=0;ply<TARGET;ply++) {
    const half = Number(chess.fen().split(' ')[4]);
    const candidates = [];
    for (const m of chess.moves({verbose:true})) {
      // Retain enough pieces for a long legal game. No promotions required.
      if (m.captured || m.promotion) continue;
      chess.move(m);
      const key = posKey();
      const count = seen.get(key) || 0;
      const afterHalf = Number(chess.fen().split(' ')[4]);
      const terminal = chess.isCheckmate() || chess.isStalemate() || chess.isInsufficientMaterial();
      const givesCheck = chess.isCheck();
      chess.undo();
      if (terminal || count >= 4 || afterHalf >= 145) continue;
      const score = random()*65 - count*38 - (givesCheck ? 25 : 0)
        + (m.piece === 'p' ? (half >= 28 ? 280 : -40) : 0)
        + (m.piece !== 'p' && half >= 50 ? -100 : 0);
      candidates.push({m,score,key});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const best = candidates[0];
    if (!best) throw new Error(`long-game-generator-exhausted seed=${seed} ply=${ply} fen=${chess.fen()}`);
    const played = chess.move(best.m);
    seen.set(best.key,(seen.get(best.key) || 0)+1);
    history.push({from:played.from,to:played.to,promotion:played.promotion||null,
      color:played.color,san:played.san,uci:played.from+played.to+(played.promotion||'')});
  }
  return history;
}

function preparedHistory() {
  const errors=[];
  for (const seed of [0xA17B3,0xF4C11F,0x20261116,0x1968]) {
    try { return makeHistory(seed); }
    catch(e) { errors.push(e.message); }
  }
  throw new Error('long-game-generator-failed: '+errors.join(' | '));
}

function makeServerRoom(history,n) {
  const joined = joinRoom(newRoom(CODE,'w','f4-white-hash',1000),'f4-black-hash',1001);
  assert.equal(joined.ok,true);
  return {...joined.room, moves:history.slice(0,n).map(({uci,...entry})=>entry),
    revision:n+2, status:'playing', updatedAt:1100};
}

test('F4: legal 800/801/826-ply server histories remain replayable and fail closed on tampering', { timeout:180000 }, async t => {
  const history=preparedHistory();
  assert.equal(history.length,TARGET);
  const room800=makeServerRoom(history,800);
  const server800=publicRoom(room800);
  const verified800=validateOnlineSnapshot(server800);
  await t.test('800-ply boundary: server/client FEN parity',()=>{
    assert.equal(verified800.ply,800);
    assert.equal(verified800.fens.at(-1),server800.fen);
  });
  const move=history[800];
  const step801=applyMove(room800,move.color,{
    from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{}),
    expectedPly:800,clientMoveId:'f4_longgame_move_0801',
  },1200);
  await t.test('801st legal move accepted by real server',()=>{
    assert.equal(step801.ok,true,step801.reason);
    assert.equal(step801.room?.moves.length,801);
    assert.equal(step801.room?.status,'playing');
  });
  const server801=publicRoom(step801.room);
  const verified801=validateOnlineSnapshot(server801);
  await t.test('801-ply server state validates, keeps prefix and FEN',()=>{
    assert.equal(verified801.ply,801);
    assert.equal(verified801.fens.at(-1),server801.fen);
    assert.equal(assertOnlinePrefix(verified800.steps.map(m=>m.uci),verified801),true);
  });
  const server826=publicRoom(makeServerRoom(history,826));
  const verified826=validateOnlineSnapshot(server826);
  await t.test('826-ply legal history survives full reconnect-style replay',()=>{
    assert.equal(verified826.ply,826);
    assert.equal(verified826.fens.at(-1),server826.fen);
    assert.equal(assertOnlinePrefix(verified801.steps.map(m=>m.uci),verified826),true);
  });
  await t.test('invalid FEN after 800 plies still fails closed',()=>{
    assert.throws(()=>validateOnlineSnapshot({...server826,fen:server800.fen}),/server-fen-history-mismatch/);
  });
  await t.test('corrupt long-game move still fails closed',()=>{
    const bad=server826.moves.slice(); bad[805]='e2e9';
    assert.throws(()=>validateOnlineSnapshot({...server826,moves:bad}),/invalid-server-move/);
  });
  await t.test('history-prefix fork protection still applies beyond 800',()=>{
    const forged=verified801.steps.map(x=>x.uci);
    forged[800]=verified801.steps[800].uci==='a2a3' ? 'h7h6' : 'a2a3';
    assert.throws(()=>assertOnlinePrefix(forged,verified826),/online-history-fork/);
  });
});
