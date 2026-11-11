import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeSavedGame,parseSavedGame} from '../src/saveGame.mjs';
const file=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const engine=file('wizardChessEngine.js'),app=file('App.tsx'),css=file('styles.css'),copy=file('P1gCopy.ts'),i18n=file('i18n.js');
function data(reason) {
  const cells=Array.from({length:8},()=>Array(8).fill(null));
  cells[0][4]={type:'king',color:'b',hasMoved:true};
  cells[7][4]={type:'king',color:'w',hasMoved:true};
  cells[7][0]={type:'rook',color:'w',hasMoved:true};
  return {version:1,mode:'single',playerColor:'w',aiLevel:5,paused:false,
    ...(reason===undefined?{}:{claimedDrawReason:reason}),
    snapshot:{currentTurn:'w',gameOver:Boolean(reason),capturedByWhite:0,capturedByBlack:0,
      scriptCursor:0,scriptedGameActive:false,scriptDeviated:false,cells},history:[]};
}
test('old version-1 saves still load without a claim',()=>assert.equal(parseSavedGame(encodeSavedGame(data())).claimedDrawReason,undefined));
test('threefold result survives save roundtrip',()=>assert.equal(parseSavedGame(encodeSavedGame(data('threefold'))).claimedDrawReason,'threefold'));
test('fifty move result survives save roundtrip',()=>assert.equal(parseSavedGame(encodeSavedGame(data('fiftyMove'))).claimedDrawReason,'fiftyMove'));
test('rejects invalid claim reason',()=>assert.throws(()=>encodeSavedGame(data('bogus'))));
test('rejects claim if snapshot not terminal',()=>{const x=data('threefold');x.snapshot.gameOver=false;assert.throws(()=>encodeSavedGame(x));});
test('claim API requires normal offline human turn and authoritative replay',()=>{
  assert.match(engine,/function getClaimableFideDraw\(\)/);
  assert.match(engine,/\(gameMode !== 'single' && gameMode !== 'local'\) \|\| scriptedGameActive \|\| scriptMoves\.length > 0/);
  assert.match(engine,/currentTurn !== playerColor/);
  assert.match(engine,/const chess = rebuildChessRulesFromHistory\(moveHistory, captureBoardSnapshot\(\)\)/);
  assert.match(engine,/const draw = inspectFideDrawPolicy\(chess\)/);
});
test('claim API stops game and cancels AI, no claim by default',()=>{
  assert.match(engine,/function claimFideDraw\(\)/);
  assert.match(engine,/const reason = getClaimableFideDraw\(\)/);
  assert.match(engine,/if \(!reason\) return \{ ok: false/);
  assert.match(engine,/claimedDrawReason = reason;\s*gameOver = true;\s*cancelAIComputation\(\)/);
});
test('claim button visibility and claimed result use same policy',()=>{
  assert.match(engine,/const btnClaimDraw = document\.getElementById\('btn-claim-draw'\)/);
  assert.match(engine,/btnClaimDraw\.style\.display = claimableDraw \? 'inline-flex' : 'none'/);
  assert.match(engine,/else if \(claimedDrawReason\)/);
  assert.match(engine,/if \(didFinishMoveTween && activeMoveTweens\.length === 0 && !isAnimatingMove\) updateTurnUI\(\)/);
});
test('undo and new game clear claim',()=>{
  assert.match(engine,/function restoreBoardSnapshot\(snap\)[\s\S]*?claimedDrawReason = null/);
  assert.match(engine,/function resetChessBoard\([\s\S]*?claimedDrawReason = null/);
  assert.match(engine,/function undoLastTurn\([\s\S]*?restoreBoardSnapshot\(snapshot\)/);
});
test('save/load verifies claim eligibility before mutation and restores result',()=>{
  assert.match(engine,/history:moveHistory,claimedDrawReason/);
  assert.match(engine,/if \(state\.claimedDrawReason\)/);
  assert.match(engine,/claimState\.claims\.includes\(state\.claimedDrawReason\)/);
  assert.match(engine,/moveHistory=state\.history;\s*claimedDrawReason = state\.claimedDrawReason \|\| null;\s*updateTurnUI\(\)/);
});
test('button wired to public API, hidden on initial load',()=>{
  assert.match(engine,/^\s+claimFideDraw,\s*$/m);
  assert.match(app,/id="btn-claim-draw"[^>]+style=\{\{display:'none'\}\}/);
  assert.match(app,/chessApi\(\)\?\.claimFideDraw\?\.\(\)/);
});
test('five locale labels, feedback and statuses exist',()=>{
  for(const key of ['claimDraw:','claimDone:','claimUnavailable:'])assert.equal(copy.split(key).length-1,5,key);
  for(const key of ['"drawClaimedThreefold":','"drawClaimedFifty":'])assert.equal(i18n.split(key).length-1,5,key);
});
test('mobile controls support claim draw',()=>assert.match(css,/#btn-undo, #btn-claim-draw, #btn-coordinates/));
