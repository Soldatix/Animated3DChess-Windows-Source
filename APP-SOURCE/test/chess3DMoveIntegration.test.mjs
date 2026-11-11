// P1J-B2b3 contract tests: official 3D move geometry must gate all normal offline chess moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChessRulesGame, getChessRulesMoves } from '../src/chessRules.mjs';
import { createChess3DVisualPlan } from '../src/chess3DVisualPlan.mjs';

const source = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const moveFrom = (fen, uci) => {
  const move = getChessRulesMoves(createChessRulesGame(fen)).find(m => m.uci === uci);
  assert.ok(move, 'Expected legal chess.js move: ' + uci);
  return move;
};

test('engine imports official 3D visual plan beside admission', () => {
  assert.match(source, /import \{ createChess3DVisualPlan \} from '\.\/chess3DVisualPlan\.mjs';/);
});

test('offline admission converts authorized move to visual plan before scene effects', () => {
  const first = source.indexOf('function executeChessMove(fromR, fromC, toR, toC, options = {})');
  const last = source.indexOf('function stepMove(dt)', first);
  assert.ok(first > 0 && last > first);
  const code = source.slice(first, last);
  const admission = code.indexOf('inspectChessMoveAdmission(moveHistory, captureBoardSnapshot()');
  const plan = code.indexOf('admittedVisualPlan = createChess3DVisualPlan(admission.move)');
  const history = code.indexOf('moveHistory.push({');
  const cancel = code.indexOf('cancelAIComputation();');
  assert.ok(admission >= 0 && plan > admission && plan < cancel && cancel < history,
    'Official plan must be checked before worker cancel and history mutation');
  assert.match(code, /admittedVisualPlan\.specialAnimationRequired && !admittedVisualPlan\.enPassant && !admittedVisualPlan\.promotionPieceType/);
});

test('offline path guards non-destination captures before scene mutation', () => {
  assert.match(source, /admittedVisualPlan\.capturedAt\?\.r !== toR/);
  assert.match(source, /admittedVisualPlan\.capturedAt\?\.c !== toC/);
  assert.match(source, /admittedVisualPlan\.capture !== Boolean\(targetOnDest\)/);
});

test('castling animation uses official rook squares when present', () => {
  assert.match(source, /const plannedRook = admittedVisualPlan\?\.rook \|\| null;/);
  assert.match(source, /plannedRook \? plannedRook\.fromC/);
  assert.match(source, /plannedRook \? plannedRook\.toC/);
  assert.match(source, /boardState\[rookFrom\.toR\]\?\.\[rookFrom\.toC\]/);
});

test('castling rook mapping stays accurate for either side', () => {
  const w = createChess3DVisualPlan(moveFrom('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1'));
  const b = createChess3DVisualPlan(moveFrom('r3k3/8/8/8/8/8/8/4K3 b q - 0 1', 'e8c8'));
  assert.deepEqual(w.rook, { fromR: 7, fromC: 7, toR: 7, toC: 5 });
  assert.deepEqual(b.rook, { fromR: 0, fromC: 0, toR: 0, toC: 3 });
});

test('en passant stays specially tagged and requires side-square capture renderer', () => {
  const m = moveFrom('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', 'e5d6');
  const plan = createChess3DVisualPlan(m);
  assert.ok(plan);
  assert.equal(plan.specialAnimationRequired, true);
  assert.notDeepEqual(plan.capturedAt, plan.landing);
  assert.match(source, /admittedVisualPlan\.specialAnimationRequired/);
  assert.match(source, /if \(admittedVisualPlan\.enPassant\)/);
  assert.match(source, /const attackPos = admittedVisualPlan\?\.enPassant/);
});
