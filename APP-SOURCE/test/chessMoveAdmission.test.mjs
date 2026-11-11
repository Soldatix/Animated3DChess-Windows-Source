import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChessRulesGame, getChessRulesBoard, tryChessRulesMove } from '../src/chessRules.mjs';
import { inspectChessMoveAdmission } from '../src/chessMoveAdmission.mjs';

function xy(uci, promotion) {
  return {
    fromR: 8-Number(uci[1]), fromC: uci.charCodeAt(0)-97,
    toR: 8-Number(uci[3]), toC: uci.charCodeAt(2)-97,
    ...(promotion ? {promotion} : {})
  };
}
function snap(game) {
  return {currentTurn:game.turn(),gameOver:false,scriptCursor:0,
    scriptedGameActive:false,scriptDeviated:false,capturedByWhite:0,capturedByBlack:0,
    cells:getChessRulesBoard(game).map(row=>row.map(p=>p?{...p,hasMoved:true}:null))};
}
function fixture(played=[]) {
  const game=createChessRulesGame(), history=[];
  for(const uci of played) {
    const previous=snap(game);
    const result=tryChessRulesMove(game,xy(uci));
    assert.ok(result,'fixture move should be legal: '+uci);
    history.push({snapshot:previous,move:{
      color:result.color,pieceType:result.pieceType,
      fromR:result.fromR,fromC:result.fromC,toR:result.toR,toC:result.toC,
      capture:result.capture,promotion:'queen'
    }});
  }
  return {history,snapshot:snap(game)};
}
const approve=(state,uci,promotion)=>inspectChessMoveAdmission(state.history,state.snapshot,xy(uci,promotion));

test('standard legal pawn push is accepted without changing state',()=>{
  const f=fixture(), before=JSON.stringify(f);
  const r=approve(f,'e2e4');
  assert.equal(r.ok,true);
  assert.equal(r.move.uci,'e2e4');
  assert.equal(JSON.stringify(f),before);
});
test('illegal bishop jump rejected',()=>{
  const f=fixture();
  assert.deepEqual(approve(f,'f1b5'),{ok:false,reason:'illegal'});
});
test('pawn cannot jump three ranks',()=>{
  assert.equal(approve(fixture(),'e2e5').ok,false);
});
test('wrong side-to-move is rejected',()=>{
  assert.equal(approve(fixture(),'e7e5').ok,false);
});
test('invalid coordinate inputs are rejected before any replay',()=>{
  const f=fixture();
  assert.equal(inspectChessMoveAdmission(f.history,f.snapshot,{fromR:-1,fromC:4,toR:4,toC:4}).reason,'invalid-coordinates');
  assert.equal(inspectChessMoveAdmission(f.history,f.snapshot,null).ok,false);
});
test('ordinary captures are admitted with true capture metadata',()=>{
  const f=fixture(['e2e4','d7d5']);
  const r=approve(f,'e4d5');
  assert.equal(r.ok,true);
  assert.equal(r.move.capture,true);
  assert.equal(r.move.enPassant,false);
});
test('castling is admitted only when chess.js says legal',()=>{
  assert.equal(approve(fixture(),'e1g1').ok,false);
  const f=fixture(['e2e4','e7e5','g1f3','b8c6','f1e2','g8f6']);
  const r=approve(f,'e1g1');
  assert.equal(r.ok,true);
  assert.equal(r.move.castle,'k');
});
test('en passant is admitted only immediately after legal two-square pawn move',()=>{
  const f=fixture(['e2e4','a7a6','e4e5','d7d5']);
  const result = approve(f,'e5d6');
  assert.equal(result.ok,true);
  assert.equal(result.move.enPassant,true);
  assert.equal(result.move.capture,true);
  assert.equal(result.move.captureR,3);
  assert.equal(result.move.captureC,3);
});
test('underpromotion is not silently converted into queen promotion',()=>{
  assert.equal(approve(fixture(),'e2e4','knight').reason,'promotion-animation-pending');
});
test('invalid or mismatched prior board fails closed',()=>{
  const f=fixture(['e2e4']);
  f.snapshot.cells[4][4].type='queen';
  assert.deepEqual(approve(f,'e7e5'),{ok:false,reason:'out-of-sync'});
});
test('3D engine calls admission before mutating move history or camera state',()=>{
  const code=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
  assert.match(code,/import \{ inspectChessMoveAdmission \} from '\.\/chessMoveAdmission\.mjs';/);
  const begin=code.indexOf('function executeChessMove(fromR, fromC, toR, toC, options = {}) {');
  const end=code.indexOf('function stepMove(dt) {',begin);
  assert.ok(begin>0&&end>begin);
  const execution=code.slice(begin,end);
  const idx=execution.indexOf('inspectChessMoveAdmission(moveHistory, captureBoardSnapshot()');
  const push=execution.indexOf('moveHistory.push({');
  const cancel=execution.indexOf('cancelAIComputation();');
  assert.ok(idx>0 && idx<push && idx<cancel,'admission before side effects');
  assert.match(execution,/if \(!admission\.ok\) return false;/);
});
test('3D safety gate targets unscripted single-player only',()=>{
  const code=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
  const begin=code.indexOf('function executeChessMove(fromR, fromC, toR, toC, options = {}) {');
  const guard=code.slice(begin,begin+1500);
  assert.match(guard,/gameMode === 'single'/);
  assert.match(guard,/!options\.fromRemote/);
  assert.match(guard,/!options\.fromScript/);
  assert.match(guard,/!scriptedGameActive/);
  assert.match(guard,/scriptMoves\.length === 0/);
});
