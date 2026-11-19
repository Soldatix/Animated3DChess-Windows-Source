import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  newRoom, joinRoom, seatOf, publicRoom, validateMove, applyMove,
  resign, offerDraw, answerDraw, isExpired,
} from '../src/game.mjs';

const now = 100_000;
const CODE = 'ABCDEFGHJK';
function paired() {
  const initial = newRoom(CODE, 'w', 'white-hash', now);
  const joined = joinRoom(initial, 'black-hash', now + 1);
  assert.equal(joined.ok, true);
  return joined.room;
}
function play(room, side, from, to, opts = {}) {
  return applyMove(room, side, {
    clientMoveId: `move_${room.moves.length.toString().padStart(8, '0')}`,
    expectedPly: room.moves.length, from, to, ...opts,
  }, now + 10 + room.moves.length);
}
test('private seat hashes never appear in public room snapshots', () => {
  const room = newRoom(CODE, 'b', 'secret-host-hash', now);
  const external = JSON.stringify(publicRoom(room));
  assert.equal(room.blackHash, 'secret-host-hash');
  assert.equal(external.includes('secret-host-hash'), false);
  assert.equal(room.status, 'waiting');
});
test('guest takes the unoccupied color and a third user cannot join', () => {
  const room = newRoom(CODE, 'b', 'host', now);
  const joined = joinRoom(room, 'guest', now + 1);
  assert.equal(joined.side, 'w');
  assert.equal(joinRoom(joined.room, 'intruder', now + 2).ok, false);
  assert.equal(seatOf(joined.room, 'guest'), 'w');
});
test('cannot move before opponent joins', () => {
  const room = newRoom(CODE, 'w', 'host', now);
  assert.equal(play(room, 'w', 'e2', 'e4').reason, 'game-not-playing');
});
test('legal move, wrong side, out-of-turn, stale ply and duplicate id', () => {
  let room = paired();
  assert.equal(play(room, 'b', 'e7', 'e5').reason, 'not-your-turn');
  const request = { clientMoveId: 'req_123456789', expectedPly: 0, from: 'e2', to: 'e4' };
  const first = applyMove(room, 'w', request, now + 2);
  assert.equal(first.ok, true);
  room = first.room;
  const replay = applyMove(room, 'w', request, now + 3);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.room.moves.length, 1);
  assert.equal(applyMove(room, 'w', { ...request, to: 'd4' }, now + 4).reason, 'move-id-conflict');
  assert.equal(play(room, 'w', 'd2', 'd4').reason, 'not-your-turn');
  assert.equal(applyMove(room, 'b', { ...request, clientMoveId:'req_234567890', from:'e7',to:'e5' }, now + 5).reason, 'stale-ply');
  const second = play(room, 'b', 'e7', 'e5');
  assert.equal(second.ok, true);
  assert.equal(publicRoom(second.room).turn, 'w');
});
test('illegal leap is rejected without mutating room', () => {
  const room = paired();
  const bad = play(room, 'w', 'e2', 'e5');
  assert.equal(bad.ok, false);
  assert.equal(room.moves.length, 0);
});
test('castling move allowed through chess.js legal geometry', () => {
  let room = paired();
  const seq = [['w','g1','f3'],['b','g8','f6'],['w','e2','e3'],['b','e7','e6'],['w','f1','e2'],['b','b8','c6'],['w','e1','g1']];
  for (const [side,from,to] of seq) {
    const result = play(room, side, from, to);
    assert.equal(result.ok, true, `${from}${to}: ${result.reason}`);
    room = result.room;
  }
  assert.equal(room.moves.at(-1).san, 'O-O');
});
test('en passant is legal and updates FEN', () => {
  let room = paired();
  const seq = [['w','e2','e4'],['b','a7','a6'],['w','e4','e5'],['b','d7','d5'],['w','e5','d6']];
  for (const [side,from,to] of seq) {
    const result = play(room, side, from, to);
    assert.equal(result.ok, true, `${from}${to}: ${result.reason}`);
    room = result.room;
  }
  assert.match(room.moves.at(-1).san, /d6/);
  assert.equal(publicRoom(room).ply, 5);
});
test('promotion requires explicit choice and supports underpromotion', () => {
  const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
  const chess = new Chess(fen);
  assert.equal(validateMove(chess, { from:'a7',to:'a8' }).reason, 'promotion-required');
  assert.equal(validateMove(chess, { from:'a7',to:'a8',promotion:'n' }).ok, true);
});
test('resignation, draw offer and acceptance require the right side', () => {
  const room = paired();
  const offered = offerDraw(room, 'w', now + 3);
  assert.equal(offered.ok, true);
  assert.equal(answerDraw(offered.room, 'w', true, now + 4).ok, false);
  const declined = answerDraw(offered.room, 'b', false, now + 5);
  assert.equal(declined.ok, true);
  const offeredAgain = offerDraw(declined.room, 'b', now + 6);
  const accepted = answerDraw(offeredAgain.room, 'w', true, now + 7);
  assert.equal(accepted.room.result.type, 'draw-agreed');
  const quit = resign(room, 'b', now + 8);
  assert.equal(quit.room.result.winner, 'w');
});
test('old waiting rooms expire, active rooms have longer lifetime', () => {
  const room = newRoom(CODE, 'w', 'hash', now);
  assert.equal(isExpired(room, now + 59 * 60_000), false);
  assert.equal(isExpired(room, now + 60 * 60_000), true);
  assert.equal(isExpired(paired(), now + 60 * 60_000), false);
});
