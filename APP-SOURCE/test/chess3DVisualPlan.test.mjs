import test from 'node:test';
import assert from 'node:assert/strict';
import {createChessRulesGame,getChessRulesMoves} from '../src/chessRules.mjs';
import {createChess3DVisualPlan} from '../src/chess3DVisualPlan.mjs';

const lookup=(fen,uci)=>{
  const game=createChessRulesGame(fen);
  const found=getChessRulesMoves(game).find(m=>m.uci===uci);
  assert.ok(found,'legal chess.js fixture '+uci);
  return found;
};
const start=createChessRulesGame().fen();

test('ordinary pawn move lands on destination without capture',()=>{
  const p=createChess3DVisualPlan(lookup(start,'e2e4'));
  assert.deepEqual(p.from,{r:6,c:4});
  assert.deepEqual(p.landing,{r:4,c:4});
  assert.equal(p.capturedAt,null);
  assert.equal(p.specialAnimationRequired,false);
});
test('normal destination capture has strike target at landing',()=>{
  const m=lookup('7k/8/8/3p4/4P3/8/8/K7 w - - 0 1','e4d5');
  const p=createChess3DVisualPlan(m);
  assert.deepEqual(p.capturedAt,p.landing);
  assert.deepEqual(p.attackTarget,p.landing);
});
test('en passant captures different square from landing',()=>{
  const p=createChess3DVisualPlan(lookup('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1','e5d6'));
  assert.equal(p.enPassant,true);
  assert.deepEqual(p.from,{r:3,c:4});
  assert.deepEqual(p.landing,{r:2,c:3});
  assert.deepEqual(p.capturedAt,{r:3,c:3});
  assert.deepEqual(p.attackTarget,{r:3,c:3});
  assert.equal(p.specialAnimationRequired,true);
});
test('white kingside castling maps rook h1 to f1',()=>{
  const p=createChess3DVisualPlan(lookup('4k3/8/8/8/8/8/8/4K2R w K - 0 1','e1g1'));
  assert.deepEqual(p.rook,{fromR:7,fromC:7,toR:7,toC:5});
  assert.equal(p.capture,false);
});
test('black queenside castling maps rook a8 to d8',()=>{
  const p=createChess3DVisualPlan(lookup('r3k3/8/8/8/8/8/8/4K3 b q - 0 1','e8c8'));
  assert.deepEqual(p.rook,{fromR:0,fromC:0,toR:0,toC:3});
});
test('all four legal promotions retain their distinct types',()=>{
  const f='7k/P7/8/8/8/8/8/7K w - - 0 1';
  for(const q of ['q','r','b','n']) {
    const p=createChess3DVisualPlan(lookup(f,'a7a8'+q));
    assert.equal(p.promotion,q);
    assert.equal(p.specialAnimationRequired,q!=='q');
  }
});
test('nonmoving source and landing objects do not share references',()=>{
  const m=lookup(start,'e2e4');
  const before=JSON.stringify(m);
  const p=createChess3DVisualPlan(m);
  assert.ok(p);
  p.from.r=0;
  assert.equal(JSON.stringify(m),before);
});
test('invalid input is rejected with no side effects',()=>{
  assert.equal(createChess3DVisualPlan(null),null);
  assert.equal(createChess3DVisualPlan({}),null);
  assert.equal(createChess3DVisualPlan({...lookup(start,'e2e4'),fromR:9}),null);
});
test('fabricated en passant metadata cannot designate arbitrary pawn',()=>{
  const m=lookup('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1','e5d6');
  assert.equal(createChess3DVisualPlan({...m,captureR:4}),null);
  assert.equal(createChess3DVisualPlan({...m,enPassant:false}),null);
});
test('fabricated wrong castling destination is rejected',()=>{
  const m=lookup('4k3/8/8/8/8/8/8/4K2R w K - 0 1','e1g1');
  assert.equal(createChess3DVisualPlan({...m,toC:5}),null);
  assert.equal(createChess3DVisualPlan({...m,pieceType:'pawn'}),null);
});
test('promotion metadata on non-pawn cannot be accepted',()=>{
  const m=lookup(start,'g1f3');
  assert.equal(createChess3DVisualPlan({...m,promotion:'q'}),null);
});
