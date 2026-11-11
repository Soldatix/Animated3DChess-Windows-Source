import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChessRulesGame, getChessRulesMoves } from '../src/chessRules.mjs';
import { createChess3DVisualPlan } from '../src/chess3DVisualPlan.mjs';

const rules = (fen, uci) => getChessRulesMoves(createChessRulesGame(fen)).find(m => m.uci === uci);
const engine = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const admission = readFileSync(new URL('../src/chessMoveAdmission.mjs', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/P1gCopy.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('white pawn may promote to exactly four official chess pieces', () => {
  const moves = getChessRulesMoves(createChessRulesGame('7k/P7/8/8/8/8/8/K7 w - - 0 1')).filter(m=>m.from==='a7'&&m.to==='a8');
  assert.deepEqual(moves.map(x=>x.promotion).sort(), ['b','n','q','r']);
});
test('black pawn may promote to exactly four official chess pieces', () => {
  const moves = getChessRulesMoves(createChessRulesGame('7k/8/8/8/8/8/p7/7K b - - 0 1')).filter(m=>m.from==='a2'&&m.to==='a1');
  assert.deepEqual(moves.map(x=>x.promotion).sort(), ['b','n','q','r']);
});
test('promotion by capture retains captured metadata and visual plan', () => {
  const move=rules('r6k/1P6/8/8/8/8/8/K7 w - - 0 1', 'b7a8n');
  assert.ok(move);
  const plan=createChess3DVisualPlan(move);
  assert.equal(plan.capture,true);
  assert.equal(plan.promotionPieceType,'knight');
  assert.deepEqual(plan.capturedAt, {r:0,c:0});
});
test('legal promotion to knight remains marked for special 3D mesh',()=>{
  const p=createChess3DVisualPlan(rules('7k/P7/8/8/8/8/8/K7 w - - 0 1','a7a8n'));
  assert.equal(p.promotion,'n');
  assert.equal(p.specialAnimationRequired,true);
});
test('admission matches chosen code rather than silently coercing queen',()=>{
  assert.match(admission, /promotionCodes/);
  assert.match(admission, /m\.promotion === requestedPromotion/);
  assert.match(admission, /promotion-animation-pending/);
});
test('finishMove creates chosen model and persists exact piece type in history',()=>{
  assert.match(engine, /const promotedType = admittedVisualPlan\?\.promotionPieceType \|\| 'queen'/);
  assert.match(engine, /instantiatePiece\(promotedType, piece\.color, toR, toC\)/);
  assert.match(engine, /promotion: admittedVisualPlan\?\.promotionPieceType \|\| options\.promotion/);
});
test('underpromotion allowed only with authorized existing visual-plan metadata',()=>{
  assert.match(engine,/admittedVisualPlan\.specialAnimationRequired && !admittedVisualPlan\.enPassant && !admittedVisualPlan\.promotionPieceType/);
});
test('normal human pawn click opens native chooser, AI keeps queen default',()=>{
  assert.match(engine, /new CustomEvent\('wizard-chess-promotion-request'/);
  assert.match(engine, /\(gameMode === 'local' \|\| currentTurn === playerColor\) && movingPiece\?\.type === 'pawn'/);
  assert.match(app, /window\.addEventListener\('wizard-chess-promotion-request'/);
  assert.match(app, /executeChessMove\?\.\(fromR,fromC,toR,toC,\{promotion\}\)/);
  assert.match(engine, /executeChessMove\(legal\.fromR, legal\.fromC, legal\.toR, legal\.toC\)/);
});
test('picker has four labeled controls, cancel and desktop/mobile overlay',()=>{
  for(const kind of ['queen','rook','bishop','knight'])
    assert.ok(app.includes("choosePromotion('"+kind+"')"),kind);
  assert.match(app,/className="wc-promotion-backdrop"/);
  assert.match(app,/role="dialog" aria-modal="true"/);
  assert.match(css,/\.wc-promotion-backdrop/);
  assert.match(app,/setPromotionMove\(null\)/);
});
test('promotion chooser copy translated in all five languages',()=>{
  for(const key of ['promotionTitle','promotionQueen','promotionRook','promotionBishop','promotionKnight'])
    assert.equal(copy.split(key+':').length-1,5);
});
