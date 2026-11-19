// P3-C11F F3: exercise real 3D engine move generation and HUD terminal logic.
// Rules adapter responses are deterministic stubs; no WebGL/network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const enginePart = (beginMarker, endMarker) => {
  const start = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'F3 source anchors must be present');
  return source.slice(start, end);
};
const generator = enginePart('    function getPseudoMovesForPiece(r, c, board = boardState) {',
  '    // =========================================================================\n    // Square Highlights'.replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n'));
const update = enginePart('    function updateTurnUI() {',
  "    window.addEventListener('wizard-chess-language-changed'");

const TYPES = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
function boardFromFen(fen) {
  const ranks = fen.split(' ')[0].split('/');
  assert.equal(ranks.length, 8);
  return ranks.map(rank => {
    const row = [];
    for(const char of rank) {
      if(/^[1-8]$/.test(char)) row.push(...Array(Number(char)).fill(null));
      else row.push({type:TYPES[char.toLowerCase()],color:char===char.toUpperCase()?'w':'b',hasMoved:true});
    }
    assert.equal(row.length,8);
    return row;
  });
}
const afterD7D5 = '8/8/4p3/3pP3/8/1b6/2k5/K7 w - d6 0 51';
const withoutEnPassant = '8/8/4p3/3pP3/8/1b6/2k5/K7 w - - 0 51';
const whiteEp = {enPassant:true,fromR:3,fromC:4,toR:2,toC:3,captureR:3,captureC:3};

function instance({fen=afterD7D5,gameMode='multi',scripted=false,officialMoves=[whiteEp],verified=true}={}) {
  const nodes = new Map();
  const updates = [];
  const ctx = {
    boardState:boardFromFen(fen),currentTurn:'w',gameMode,
    scriptedGameActive:scripted,scriptMoves:[],moveHistory:[],
    playerColor:'w',roomCode:'F3_TEST',gameOver:false,gamePaused:false,
    isAnimatingMove:false,preMoveHighlightTask:null,activeMoveTweens:[],
    claimedDrawReason:null,capturedByWhite:0,capturedByBlack:0,
    checkmateState:{active:false},aiTimer:null,
    captureBoardSnapshot:()=>({cells:[]}),
    rebuildChessRulesFromHistory:()=>verified?{tag:'verified-official-rules'}:null,
    getChessRulesMoves:()=>officialMoves,
    document:{getElementById(id){if(!nodes.has(id)) nodes.set(id,{className:'',textContent:'',style:{}});return nodes.get(id);}},
    checkAlertController:{update:x=>updates.push(x)},
    inspectFideDrawPolicy:()=>null,t:k=>k,
    triggerCheckmateSequence(){throw Error('unexpected-checkmate-animation');},
    cancelAIComputation(){throw Error('unexpected-ai-cancel');}
  };
  runInNewContext(generator+'\n'+update,ctx,{filename:'wizardChessEngine-extracted-F3.js'});
  return {ctx,nodes,updates};
}

test('F3: after d7d5 the online engine sees e5d6 as its only legal move',()=>{
  const {ctx}=instance();
  const moves=ctx.getAllLegalMoves('w');
  assert.equal(moves.length,1,'no false stalemate when en passant is the only legal move');
  assert.deepEqual([moves[0].fromR,moves[0].fromC,moves[0].toR,moves[0].toC],[3,4,2,3]);
});

test('F3: actual online HUD terminal check does not set gameOver for legal en passant',()=>{
  const {ctx,nodes,updates}=instance();
  ctx.updateTurnUI();
  assert.equal(ctx.gameOver,false,'UI must not end an ongoing online game');
  assert.equal(nodes.get('turn-text').textContent,'whiteMove');
  assert.equal(updates.at(-1)?.gameOver,false,'check alert must not mark game over');
});

test('F3: no en passant is invented when official rules deny it',()=>{
  const {ctx}=instance({fen:withoutEnPassant,officialMoves:[]});
  assert.equal(ctx.getAllLegalMoves('w').length,0);
  ctx.updateTurnUI();
  assert.equal(ctx.gameOver,true);
});

test('F3: script mode and failed rules replay do not invent en passant',()=>{
  assert.equal(instance({scripted:true}).ctx.getAllLegalMoves('w').length,0);
  assert.equal(instance({verified:false}).ctx.getAllLegalMoves('w').length,0);
});

test('F3: existing offline local en passant remains available',()=>{
  assert.equal(instance({gameMode:'local'}).ctx.getAllLegalMoves('w').length,1);
});
