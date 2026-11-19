// P3-C11G R1: genuine long-history chess.js reconstruction, online admission,
// and isolated invocation of the actual 3D engine queue drain function.
// Local-only regression. No I/O except reading engine source; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { getChessRulesBoard } from '../src/chessRules.mjs';
import { rebuildChessRulesFromHistory } from '../src/chessRulesReplay.mjs';
import { inspectChessMoveAdmission } from '../src/chessMoveAdmission.mjs';

const TARGET = 826;
const TYPE = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const PROMO = {q:'queen',r:'rook',b:'bishop',n:'knight'};
const coord = uci => ({fromR:8-Number(uci[1]),fromC:uci.charCodeAt(0)-97,
  toR:8-Number(uci[3]),toC:uci.charCodeAt(2)-97});
function snapshot(game) {
  return {currentTurn:game.turn(),gameOver:false,scriptCursor:0,
    scriptedGameActive:false,scriptDeviated:false,capturedByWhite:0,capturedByBlack:0,
    cells:getChessRulesBoard(game).map(row=>row.map(p=>p?{...p,hasMoved:true}:null))};
}

// Same deterministic, legally generated long-game strategy used in the F4 test.
// Never manufacture a bogus repeated/drawn game merely to reach the boundary.
function generate(seed) {
  const chess=new Chess(), history=[], snapshots=[snapshot(chess)], fens=[chess.fen()], steps=[];
  const seen=new Map(), posKey=()=>chess.fen().split(' ').slice(0,4).join(' ');
  let rng=seed>>>0;
  const random=()=>{rng^=rng<<13; rng^=rng>>>17; rng^=rng<<5;return (rng>>>0)/4294967296;};
  seen.set(posKey(),1);
  for(let ply=0;ply<TARGET;ply++) {
    const half=Number(chess.fen().split(' ')[4]);
    const candidates=[];
    for(const m of chess.moves({verbose:true})) {
      if(m.captured||m.promotion)continue;
      chess.move(m);
      const k=posKey(), count=seen.get(k)||0;
      const nextHalf=Number(chess.fen().split(' ')[4]);
      const terminal=chess.isCheckmate()||chess.isStalemate()||chess.isInsufficientMaterial();
      const givesCheck=chess.isCheck();
      chess.undo();
      if(terminal||count>=4||nextHalf>=145)continue;
      const score=random()*65-count*38-(givesCheck?25:0)
        +(m.piece==='p'?(half>=28?280:-40):0)
        +(m.piece!=='p'&&half>=50?-100:0);
      candidates.push({m,score,k});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const best=candidates[0];
    if(!best)throw Error(`R1_LONG_FIXTURE_EXHAUSTED seed=${seed} ply=${ply}`);
    const before=snapshot(chess);
    const played=chess.move(best.m);
    seen.set(best.k,(seen.get(best.k)||0)+1);
    const uci=played.from+played.to+(played.promotion||'');
    history.push({snapshot:before,move:{
      color:played.color,pieceType:TYPE[played.piece],
      ...coord(uci),capture:Boolean(played.captured)||played.isEnPassant(),
      promotion:PROMO[played.promotion]||'queen'
    }});
    snapshots.push(snapshot(chess));
    fens.push(chess.fen());
    steps.push(uci);
  }
  return {history,snapshots,fens,steps};
}
function fixture() {
  const problems=[];
  for(const seed of [0xA17B3,0xF4C11F,0x20261116,0x1968]){
    try{return generate(seed);}catch(err){problems.push(err.message);}
  }
  throw Error('R1_NO_LEGAL_LONG_GAME: '+problems.join(' | '));
}

const engine=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
const queueStart=engine.indexOf('function drainOnlineQueue() {');
const queueEnd=engine.indexOf('async function submitOnlineMove(',queueStart);
assert.ok(queueStart>=0&&queueEnd>queueStart,'Actual 3D queue handler not found');
const queueCode=engine.slice(queueStart,queueEnd);
assert.match(queueCode,/rebuildChessRulesFromHistory\(moveHistory, captureBoardSnapshot\(\)\)/);
assert.match(queueCode,/visual-server-fen-divergence/);

// Execute the genuine engine function with controlled dependency injection.
// This is NOT a substitute for WebGL/animation/reconnect end-to-end testing.
const invoke3DDrain=new Function('history','currentSnapshot','n','fens','rebuildChessRulesFromHistory',`
  let onlineDrainTimer=null;
  const onlineClient={};
  const gameMode='multi';
  const onlineError=null;
  const onlineVerified={ply:n,fens};
  const onlineRoomSnapshot={status:'playing'};
  const isAnimatingMove=false,activeMoveTweens=[];
  const moveHistory=history;
  const captureBoardSnapshot=()=>currentSnapshot;
  const onlineAppliedPly=n;
  const errors=[];
  const freezeOnline=(reason)=>errors.push(reason);
  let broadcastCount=0;
  const broadcastOnlineState=()=>{broadcastCount++;};
  let gameOver=false;
  const executeChessMove=()=>{throw Error('UNEXPECTED_NEW_MOVE');};
  const squareToBoard=()=>{throw Error('UNEXPECTED_COORD_CONVERSION');};
  const setTimeout=()=>{throw Error('UNEXPECTED_TIMER');};
  const clearTimeout=()=>{};
  ${queueCode}
  drainOnlineQueue();
  return {errors,broadcastCount,gameOver};
`);

test('R1: valid 256/257/800/801/826-ply histories rebuild and drain through real 3D adapter',
  {timeout:300000}, async t=>{
    const f=fixture();
    assert.equal(f.history.length,TARGET);
    for(const n of [256,257,800,801,826]) {
      await t.test(`R1: ${n} plies: 3D rules replay FEN + queue stay connected`,()=>{
        const h=f.history.slice(0,n), end=f.snapshots[n];
        const replay=rebuildChessRulesFromHistory(h,end);
        assert.ok(replay,`Missing 3D rules state after ${n} plies`);
        assert.equal(replay.fen(),f.fens[n],`FEN mismatch after ${n} plies`);
        const result=invoke3DDrain(h,end,n,f.fens,rebuildChessRulesFromHistory);
        assert.deepEqual(result.errors,[],`3D queue froze at ${n} plies`);
        assert.equal(result.broadcastCount,1);
        assert.equal(result.gameOver,false);
      });
    }
    await t.test('R1: admission on move 802 remains legal after 801 plies',()=>{
      const uci=f.steps[801];
      const admission=inspectChessMoveAdmission(f.history.slice(0,801),f.snapshots[801],
        {...coord(uci),...(uci.length===5?{promotion:PROMO[uci[4]]}:{})});
      assert.equal(admission.ok,true,JSON.stringify(admission));
      assert.equal(admission.move.uci,uci);
    });
    await t.test('R1: forged final board remains rejected beyond 800 plies',()=>{
      const bad=structuredClone(f.snapshots[801]);
      bad.cells[7][4]=bad.cells[7][4]?.type==='queen'?null:{type:'queen',color:'w',hasMoved:true};
      assert.equal(rebuildChessRulesFromHistory(f.history.slice(0,801),bad),null);
      const result=invoke3DDrain(f.history.slice(0,801),bad,801,f.fens,rebuildChessRulesFromHistory);
      assert.deepEqual(result.errors,['visual-server-fen-divergence']);
    });
    await t.test('R1: forged historic move stays rejected beyond 256 plies',()=>{
      const h=structuredClone(f.history.slice(0,257));
      h[256].move.toR=9;
      assert.equal(rebuildChessRulesFromHistory(h,f.snapshots[257]),null);
    });
    await t.test('R1: offline save/load 256-ply limit stays independent',()=>{
      const save=readFileSync(new URL('../src/saveGame.mjs',import.meta.url),'utf8');
      assert.match(save,/value\.length>256/);
    });
  });
