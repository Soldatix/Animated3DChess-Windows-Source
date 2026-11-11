import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChessRulesGame, getChessRulesMoves } from '../src/chessRules.mjs';
import { createChess3DVisualPlan } from '../src/chess3DVisualPlan.mjs';

const engine = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const admission = readFileSync(new URL('../src/chessMoveAdmission.mjs', import.meta.url), 'utf8');
const allowed = fen => getChessRulesMoves(createChessRulesGame(fen));

test('white en passant targets adjacent pawn and empty diagonal landing', () => {
  const move = allowed('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1').find(x => x.uci === 'e5d6');
  assert.ok(move);
  const plan = createChess3DVisualPlan(move);
  assert.deepEqual(plan.capturedAt, {r:3,c:3});
  assert.deepEqual(plan.landing, {r:2,c:3});
  assert.equal(plan.capture, true);
});

test('black en passant uses mirrored side-square capture', () => {
  const move = allowed('7k/8/8/8/3Pp3/8/8/K7 b - d3 0 1').find(x => x.uci === 'e4d3');
  assert.ok(move);
  const plan = createChess3DVisualPlan(move);
  assert.deepEqual(plan.capturedAt, {r:4,c:3});
  assert.deepEqual(plan.landing, {r:5,c:3});
});

test('en passant expires immediately when no en-passant square is available', () => {
  assert.ok(!allowed('7k/8/8/3pP3/8/8/8/K7 w - - 0 1').some(x => x.uci === 'e5d6'));
});

test('pinned pawn cannot en passant because chess.js prevents exposing king', () => {
  assert.ok(!allowed('4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 1').some(x => x.uci === 'e5d6'));
});

test('engine derives legal highlight move and verifies live side-square victim', () => {
  assert.match(engine, /special\.enPassant && special\.fromR === r && special\.fromC === c/);
  assert.match(engine, /victimSquare\.r !== fromR \|\| victimSquare\.c !== toC/);
  assert.match(engine, /victim\.type !== 'pawn'/);
  assert.match(admission, /return \{ ok: true, reason: null, move \};/);
  assert.doesNotMatch(admission, /en-passant-animation-pending/);
});

test('capture combat strikes at victim, destroys correct pawn, and lands diagonally', () => {
  assert.match(engine, /const attackPos = admittedVisualPlan\?\.enPassant/);
  assert.match(engine, /const dx = attackPos\.x - startPos\.x/);
  assert.match(engine, /captured\.mesh\.position\.copy\(attackPos\)/);
  assert.match(engine, /boardState\[admittedVisualPlan\.capturedAt\.r\]\[admittedVisualPlan\.capturedAt\.c\] = null/);
  assert.match(engine, /boardState\[toR\]\[toC\] = piece/);
  assert.match(engine, /capture: Boolean\(admittedVisualPlan \? admittedVisualPlan\.capture : targetOnDest\)/);
});
