import test from 'node:test';
import assert from 'node:assert/strict';
import {createChessRulesGame, getChessRulesBoard, getChessRulesStatus, tryChessRulesMove} from '../src/chessRules.mjs';
import {matchesChessRulesSnapshot, rebuildChessRulesFromHistory} from '../src/chessRulesReplay.mjs';

const piece=(p)=>p?{type:p.type,color:p.color,hasMoved:true}:null;
function snapshot(game) {
  return {currentTurn:game.turn(), gameOver:false, capturedByWhite:0, capturedByBlack:0,
    scriptCursor:0, scriptedGameActive:false, scriptDeviated:false,
    cells:getChessRulesBoard(game).map(row=>row.map(piece))};
}
function coordinates(s) {
  return {fromR:8-Number(s[1]),fromC:s.charCodeAt(0)-97,toR:8-Number(s[3]),toC:s.charCodeAt(2)-97};
}
function historyOf(steps, startingFen) {
  const game=createChessRulesGame(startingFen);
  const history=[];
  for(const [uci,promotion] of steps){
    const before=snapshot(game);
    const move=tryChessRulesMove(game,{...coordinates(uci),...(promotion?{promotion}:{})});
    assert.ok(move,'setup move must be legal: '+uci);
    history.push({snapshot:before,move:{
      color:move.color,pieceType:move.pieceType,
      fromR:move.fromR,fromC:move.fromC,toR:move.toR,toC:move.toC,
      capture:move.capture,promotion:promotion||'queen'
    }});
  }
  return {history,game,snapshot:snapshot(game)};
}

test('initial empty history reconstitutes starting rules state',()=>{
  const restored=rebuildChessRulesFromHistory([]);
  assert.ok(restored);
  assert.equal(restored.fen(),createChessRulesGame().fen());
});
test('legacy v1 non-promotion queen fields are harmless',()=>{
  const sample=historyOf([['e2e4'],['e7e5'],['g1f3']]);
  const restored=rebuildChessRulesFromHistory(sample.history,sample.snapshot);
  assert.ok(restored);
  assert.equal(restored.fen(),sample.game.fen());
});
test('saved snapshots match pieces, colors and current turn',()=>{
  const game=createChessRulesGame();
  const s=snapshot(game);
  assert.equal(matchesChessRulesSnapshot(game,s),true);
  s.cells[7][4].type='queen';
  assert.equal(matchesChessRulesSnapshot(game,s),false);
});
test('corrupted before-move snapshot is rejected',()=>{
  const sample=historyOf([['e2e4']]);
  sample.history[0].snapshot.currentTurn='b';
  assert.equal(rebuildChessRulesFromHistory(sample.history,sample.snapshot),null);
});
test('illegal or tampered historic move fails closed',()=>{
  const sample=historyOf([['e2e4']]);
  sample.history[0].move.toR=3;
  assert.equal(rebuildChessRulesFromHistory(sample.history),null);
});
test('final board mismatch fails closed',()=>{
  const sample=historyOf([['e2e4']]);
  sample.snapshot.cells[4][4].type='queen';
  assert.equal(rebuildChessRulesFromHistory(sample.history,sample.snapshot),null);
});
test('ordinary capture and halfmove clock are reconstructed',()=>{
  const sample=historyOf([['e2e4'],['d7d5'],['e4d5']]);
  const restored=rebuildChessRulesFromHistory(sample.history,sample.snapshot);
  assert.ok(restored);
  assert.equal(restored.fen(),sample.game.fen());
  assert.equal(restored.get('d5').type,'p');
});
test('en passant capture replay restores legal state',()=>{
  const sample=historyOf([['e2e4'],['a7a6'],['e4e5'],['d7d5'],['e5d6']]);
  const restored=rebuildChessRulesFromHistory(sample.history,sample.snapshot);
  assert.ok(restored);
  assert.equal(restored.get('d5'),undefined);
  assert.equal(restored.get('d6').type,'p');
});
test('castling replay restores rook placement and rights',()=>{
  const sample=historyOf([['e2e4'],['e7e5'],['g1f3'],['b8c6'],['f1e2'],['g8f6'],['e1g1']]);
  const restored=rebuildChessRulesFromHistory(sample.history,sample.snapshot);
  assert.ok(restored);
  assert.equal(restored.get('f1').type,'r');
  assert.equal(restored.get('g1').type,'k');
});
test('reconstructed moves preserve threefold history',()=>{
  const sample=historyOf([['g1f3'],['g8f6'],['f3g1'],['f6g8'],['g1f3'],['g8f6'],['f3g1'],['f6g8']]);
  const restored=rebuildChessRulesFromHistory(sample.history,sample.snapshot);
  assert.ok(restored);
  assert.equal(getChessRulesStatus(restored).threefoldRepetition,true);
});
test('input data is not changed during reconstruction',()=>{
  const sample=historyOf([['e2e4'],['e7e5']]);
  const json=JSON.stringify({history:sample.history,snapshot:sample.snapshot});
  assert.ok(rebuildChessRulesFromHistory(sample.history,sample.snapshot));
  assert.equal(JSON.stringify({history:sample.history,snapshot:sample.snapshot}),json);
});
test('untrusted inputs and oversized history return null',()=>{
  assert.equal(rebuildChessRulesFromHistory(null),null);
  assert.equal(rebuildChessRulesFromHistory(Array(257).fill({})),null);
  assert.equal(rebuildChessRulesFromHistory([{snapshot:null,move:{}}]),null);
});
