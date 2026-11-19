// Animated 3D Chess V1.1 P2-H: cross-layer special-move/stability regression.
// Pure in-memory tests: do not access real rooms, sockets, Windows registry, or Cloudflare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { newRoom, joinRoom, applyMove, publicRoom, offerDraw, answerDraw, resign } from '../multiplayer-server/src/game.mjs';
import { validateOnlineSnapshot, assertOnlinePrefix, squareToBoard } from '../src/onlineMultiplayerReplay.mjs';
import { inspectChessMoveAdmission } from '../src/chessMoveAdmission.mjs';
import { createChess3DVisualPlan } from '../src/chess3DVisualPlan.mjs';
import { rebuildChessRulesFromHistory } from '../src/chessRulesReplay.mjs';
import { getChessRulesBoard } from '../src/chessRules.mjs';

const CODE = 'ABCDEFGH23';
const PIECENAMES = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const PROMOTIONS = {q:'queen',r:'rook',b:'bishop',n:'knight'};
let monotonic = 100_000;
function paired() {
  const created = newRoom(CODE,'w','p2h-white-hash',++monotonic);
  const joined = joinRoom(created,'p2h-black-hash',++monotonic);
  assert.equal(joined.ok,true,'join must succeed');
  return joined.room;
}
const snapshot = chess => ({currentTurn:chess.turn(),cells:getChessRulesBoard(chess)});
const nextId = ply => `p2h_test_move_${String(ply).padStart(6,'0')}`;
function attempt(room, side, uci, {expectedPly = room.moves.length, id = nextId(room.moves.length), promotion} = {}) {
  return applyMove(room,side,{
    from:uci.slice(0,2),to:uci.slice(2,4),expectedPly,clientMoveId:id,
    ...((promotion ?? (uci.length === 5 ? uci[4] : null)) ? {promotion:promotion ?? uci[4]} : {}),
  },++monotonic);
}
function replayLine(sequence) {
  let room = paired();
  const chess = new Chess(), history = [];
  const visuals = [];
  for (const uci of sequence) {
    const side = chess.turn(), from = uci.slice(0,2),to = uci.slice(2,4), promotion = uci[4] || null;
    const boardFrom = squareToBoard(from), boardTo = squareToBoard(to);
    const proposed = {...{fromR:boardFrom.r,fromC:boardFrom.c,toR:boardTo.r,toC:boardTo.c},
      ...(promotion ? {promotion:PROMOTIONS[promotion]} : {})};
    const beforeSnapshot = snapshot(chess);
    const admission = inspectChessMoveAdmission(history,beforeSnapshot,proposed);
    assert.equal(admission.ok,true,`3D admission for ${uci}: ${admission.reason}`);
    const visual = createChess3DVisualPlan(admission.move);
    assert.ok(visual,`visual plan for ${uci}`);
    const result = attempt(room,side,uci);
    assert.equal(result.ok,true,`P1 server ${uci}: ${result.reason}`);
    room = result.room;
    const move = chess.move({from,to,...(promotion?{promotion}:{})});
    assert.ok(move,`chess.js accepted ${uci}`);
    assert.equal(visual.capture,Boolean(move.captured) || move.isEnPassant(),`capture plan ${uci}`);
    assert.equal(visual.enPassant,move.isEnPassant(),`en passant plan ${uci}`);
    history.push({snapshot:beforeSnapshot,move:{
      color:move.color,pieceType:PIECENAMES[move.piece],
      ...proposed,capture:Boolean(move.captured) || move.isEnPassant(),
      promotion:promotion?PROMOTIONS[promotion]:'queen',
    }});
    // Keep *all* checks deterministic: both server replay and local Chess share one FEN.
    const external = publicRoom(room), checked = validateOnlineSnapshot(external);
    assert.equal(checked.ply,history.length);
    assert.equal(external.fen,chess.fen(),`cross-layer FEN ${uci}`);
    assert.equal(checked.fens.at(-1),chess.fen(),`client replay FEN ${uci}`);
    assert.equal(checked.steps.at(-1).uci,uci,`client move ID ${uci}`);
    assertOnlinePrefix(sequence.slice(0,history.length),checked);
    visuals.push(visual);
  }
  const rebuilt = rebuildChessRulesFromHistory(history,snapshot(chess));
  assert.ok(rebuilt,'3D game history must replay without divergence');
  assert.equal(rebuilt.fen(),chess.fen(),'3D rules/FEN parity after animation');
  return {room,visuals,chess,history};
}
test('P2-H: white and black kingside castling keep rook moves, rights and server FEN aligned', () => {
  const run=replayLine(['g1f3','g8f6','e2e3','e7e6','f1e2','f8e7','e1g1','e8g8']);
  for (const v of run.visuals.slice(-2)) {
    assert.equal(v.castle,'k');
    assert.ok(v.rook);
    assert.equal(v.rook.fromC,7);
    assert.equal(v.rook.toC,5);
  }
  assert.equal(run.room.moves.at(-1).san,'O-O');
  assert.equal(run.chess.get('f1').type,'r');
  assert.equal(run.chess.get('f8').type,'r');
});

test('P2-H: online en passant removes the adjacent victim on either side', () => {
  const white=replayLine(['e2e4','a7a6','e4e5','d7d5','e5d6']);
  const w=white.visuals.at(-1);
  assert.equal(w.enPassant,true);
  assert.deepEqual(w.capturedAt,{r:3,c:3}); // black pawn on d5
  assert.equal(white.chess.get('d5'),undefined);
  assert.equal(white.chess.get('d6').type,'p');
  const black=replayLine(['a2a3','e7e5','a3a4','e5e4','d2d4','e4d3']);
  const b=black.visuals.at(-1);
  assert.equal(b.enPassant,true);
  assert.deepEqual(b.capturedAt,{r:4,c:3}); // white pawn on d4
  assert.equal(black.chess.get('d4'),undefined);
  assert.equal(black.chess.get('d3').color,'b');
});

test('P2-H: en passant expires after intervening moves', () => {
  let room=paired();
  for(const uci of ['e2e4','a7a6','e4e5','d7d5','g1f3','b8c6']) {
    const side=room.moves.length%2===0?'w':'b';
    const res=attempt(room,side,uci);assert.equal(res.ok,true,uci);room=res.room;
  }
  const invalid=attempt(room,'w','e5d6');
  assert.equal(invalid.ok,false);
  assert.equal(room.moves.length,6);
});

test('P2-H: queen, rook, bishop and knight promotion require explicit server choice and match 3D mesh plan', () => {
  const prefix=['a2a4','h7h6','a4a5','h6h5','a5a6','h5h4','a6b7','h4h3'];
  for(const letter of ['q','r','b','n']) {
    let room=paired();
    for(const uci of prefix){const side=room.moves.length%2===0?'w':'b';const r=attempt(room,side,uci);assert.equal(r.ok,true,uci);room=r.room;}
    const noChoice=attempt(room,'w','b7a8');
    assert.equal(noChoice.ok,false);
    assert.equal(noChoice.reason,'promotion-required');
    const run=replayLine([...prefix,`b7a8${letter}`]);
    const v=run.visuals.at(-1);
    assert.equal(v.promotion,letter);
    assert.equal(v.promotionPieceType,PROMOTIONS[letter]);
    assert.equal(run.chess.get('a8').type,letter);
    assert.equal(run.chess.get('a8').color,'w');
    assert.equal(run.room.moves.length,9);
  }
});

test('P2-H: checkmate ends a room and forbids subsequent moves', () => {
  const run=replayLine(['e2e4','e7e5','d1h5','b8c6','f1c4','g8f6','h5f7']);
  const state=publicRoom(run.room);
  assert.equal(state.status,'finished');
  assert.equal(state.gameOver,true);
  assert.equal(state.checkmate,true);
  assert.deepEqual(state.result,{type:'checkmate',winner:'w'});
  const rejected=attempt(run.room,'b','e8e7');
  assert.equal(rejected.reason,'game-not-playing');
  assert.equal(run.room.moves.length,7);
});

test('P2-H: resign and agreed draw remain consistent with verified terminal client state', () => {
  const room=paired();
  let offer=offerDraw(room,'w',++monotonic);
  assert.equal(offer.ok,true);
  assert.equal(publicRoom(offer.room).drawOfferedBy,'w');
  let decline=answerDraw(offer.room,'b',false,++monotonic);
  assert.equal(decline.ok,true);
  offer=offerDraw(decline.room,'b',++monotonic);
  const agreed=answerDraw(offer.room,'w',true,++monotonic);
  assert.equal(agreed.ok,true);
  const drawn=publicRoom(agreed.room);
  assert.equal(drawn.status,'finished');
  assert.equal(drawn.result.type,'draw-agreed');
  assert.equal(validateOnlineSnapshot(drawn).ply,0);
  assert.equal(attempt(agreed.room,'w','e2e4').reason,'game-not-playing');
  const resigned=resign(room,'b',++monotonic);
  assert.equal(resigned.ok,true);
  assert.equal(publicRoom(resigned.room).result.winner,'w');
  assert.equal(validateOnlineSnapshot(publicRoom(resigned.room)).ply,0);
});

test('P2-H: invalid server history, stale revisions and replay forks fail closed', () => {
  const run=replayLine(['e2e4','e7e5','g1f3']);
  const state=publicRoom(run.room);
  assert.throws(()=>validateOnlineSnapshot({...state,fen:new Chess().fen()}),/server-fen-history-mismatch/);
  assert.throws(()=>validateOnlineSnapshot({...state,moves:['e2e5','e7e5','g1f3']}),/illegal-server-history/);
  const verified=validateOnlineSnapshot(state);
  assert.throws(()=>assertOnlinePrefix(['d2d4'],verified),/online-history-fork/);
  assert.throws(()=>assertOnlinePrefix(['e2e4','e7e5','g1f3','b8c6'],verified),/online-state-rewound/);
  // Reject stale/duplicate HTTP submissions without mutating the room.
  const before=JSON.stringify(run.room);
  const stale=attempt(run.room,'b','b8c6',{expectedPly:1});
  assert.equal(stale.reason,'stale-ply');
  assert.equal(JSON.stringify(run.room),before);
});
