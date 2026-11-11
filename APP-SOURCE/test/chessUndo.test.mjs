import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countUndoPlies } from '../src/chessUndo.mjs';

const h = (...colors) => colors.map(color => ({ move: { color }, snapshot: {} }));
const engine = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/P1gCopy.ts', import.meta.url), 'utf8');

test('no moves cannot be undone', () => assert.equal(countUndoPlies([], 'w'), 0));
test('undo pending AI reply removes one human move', () => assert.equal(countUndoPlies(h('w'), 'w'), 1));
test('undo completed human plus AI pair', () => assert.equal(countUndoPlies(h('w','b'), 'w'), 2));
test('black human can undo move before AI replies', () => assert.equal(countUndoPlies(h('w','b'), 'b'), 1));
test('black human undoes own move and latest AI answer, not initial AI opening', () => assert.equal(countUndoPlies(h('w','b','w'), 'b'), 2));
test('initial AI opening alone is not undoable for black human', () => assert.equal(countUndoPlies(h('w'), 'b'), 0));
test('two humans / AI off undo one ply', () => assert.equal(countUndoPlies(h('w','b','w'), 'b', false), 1));
test('invalid or malformed history fails closed', () => {
  assert.equal(countUndoPlies(null, 'w'), 0);
  assert.equal(countUndoPlies([{ move: {} }], 'w'), 0);
  assert.equal(countUndoPlies(h('w'), 'spectator'), 0);
});
test('engine wraps history rollback in existing snapshot restoration / AI cancellation', () => {
  assert.match(engine, /import \{ countUndoPlies \} from '\.\/chessUndo\.mjs';/);
  const a = engine.indexOf('function undoLastTurn()');
  const b = engine.indexOf('function stepScriptBackward()', a);
  assert.ok(a > 0 && b > a);
  const code = engine.slice(a, b);
  assert.match(code, /gameMode !== 'single'/);
  assert.match(code, /isAnimatingMove \|\| activeMoveTweens\.length/);
  assert.match(code, /countUndoPlies\(moveHistory, playerColor, aiAutoPlay\)/);
  assert.match(code, /moveHistory\.splice\(-count, count\)/);
  assert.match(code, /restoreBoardSnapshot\(snapshot\)/);
  assert.match(engine, /\n      undoLastTurn,\n/);
  assert.match(engine, /function restoreBoardSnapshot\(snap\)[\s\S]*?cancelAIComputation\(\)/);
});
test('Undo is visible in main controls and checkmate overlay with translations', () => {
  assert.match(app, /id="btn-undo"/);
  assert.match(app, /id="btn-checkmate-undo"/);
  assert.match(app, /undoLastTurn\?:/);
  assert.match(app, /onClick=\{performUndo\}/);
  for (const field of ['undo:', 'undone:', 'undoEmpty:', 'undoUnavailable:']) {
    assert.equal(copy.split(field).length - 1, 5, field + ' must be translated in all five languages');
  }
});
