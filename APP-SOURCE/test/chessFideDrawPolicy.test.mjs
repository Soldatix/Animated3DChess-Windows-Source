import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChessRulesGame} from '../src/chessRules.mjs';
import {inspectFideDrawPolicy} from '../src/chessFideDrawPolicy.mjs';

const evaluate=fen=>inspectFideDrawPolicy(createChessRulesGame(fen));
const engine=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');

test('initial position has no draw and is not claimable',()=>{
  const r=evaluate('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(r.automatic,null);
  assert.deepEqual(r.claims,[]);
  assert.equal(r.repetitions,1);
});
test('threefold repetition is CLAIMABLE, not automatic',()=>{
  const g=createChessRulesGame();
  for(let n=0;n<2;n++)for(const m of ['Nf3','Nf6','Ng1','Ng8'])g.move(m);
  const r=inspectFideDrawPolicy(g);
  assert.equal(r.repetitions,3);
  assert.equal(r.automatic,null);
  assert.ok(r.claims.includes('threefold'));
});
test('fivefold repetition automatically ends an unclaimed game',()=>{
  const g=createChessRulesGame();
  for(let n=0;n<4;n++)for(const m of ['Nf3','Nf6','Ng1','Ng8'])g.move(m);
  const r=inspectFideDrawPolicy(g);
  assert.equal(r.repetitions,5);
  assert.equal(r.automatic,'fivefold');
  assert.deepEqual(r.claims,[]);
});
test('50 moves without capture or pawn movement is claimable only',()=>{
  const r=evaluate('7k/8/8/8/8/8/6R1/K7 w - - 100 1');
  assert.equal(r.halfmoves,100);
  assert.equal(r.automatic,null);
  assert.ok(r.claims.includes('fiftyMove'));
});
test('75 moves without capture or pawn movement is automatic draw',()=>{
  const r=evaluate('7k/8/8/8/8/8/6R1/K7 w - - 150 1');
  assert.equal(r.halfmoves,150);
  assert.equal(r.automatic,'seventyFive');
  assert.deepEqual(r.claims,[]);
});
test('bare kings are an automatic dead-position draw',()=>{
  const r=evaluate('7k/8/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(r.automatic,'insufficient');
});
test('king and bishop versus king has insufficient mating material',()=>{
  const r=evaluate('7k/8/8/8/8/8/8/K1B5 w - - 0 1');
  assert.equal(r.automatic,'insufficient');
});
test('stalemate is distinct from checkmate and cannot be claimed',()=>{
  const r=evaluate('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(r.automatic,'stalemate');
  assert.equal(r.checkmate,false);
  assert.deepEqual(r.claims,[]);
});
test('checkmate has priority over 75-move rule',()=>{
  const r=evaluate('7k/6Q1/6K1/8/8/8/8/8 b - - 150 1');
  assert.equal(r.checkmate,true);
  assert.equal(r.automatic,null);
});
test('rule classification never mutates game or its history',()=>{
  const g=createChessRulesGame();
  for(const m of ['Nf3','Nf6','Ng1','Ng8'])g.move(m);
  const before=g.fen(),count=g.history().length;
  inspectFideDrawPolicy(g);
  assert.equal(g.fen(),before);
  assert.equal(g.history().length,count);
});
test('engine automatic-draw gate limited to live normal offline single game',()=>{
  assert.match(engine,/const drawGame = \(gameMode === 'single' \|\| gameMode === 'local'\) && !scriptedGameActive && scriptMoves\.length === 0/);
  assert.match(engine,/inspectFideDrawPolicy\(drawGame\)/);
  assert.match(engine,/const automaticDraw = fideDraw\?\.automatic/);
  assert.match(engine,/gameOver = true;[\s\S]*?turnText\.textContent = t\(drawMessages\[automaticDraw\]\)/);
  assert.match(engine,/checkAlertController\.update\(\{ color: currentTurn, inCheck,\s*gameOver: legalMoves\.length === 0 \|\| Boolean\(automaticDraw\) \|\| Boolean\(claimedDrawReason\) \}\)/);
});
test('automatic draw notices translated in EN HR DE IT ES',()=>{
  for(const k of ['drawInsufficient','drawFivefold','draw75'])assert.equal(i18n.split('"'+k+'":').length-1,5,k);
});
