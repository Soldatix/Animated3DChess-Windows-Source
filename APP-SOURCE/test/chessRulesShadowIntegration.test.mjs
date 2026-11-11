import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const from = source.indexOf('function inspectChessRulesParity() {');
const to = source.indexOf('    window.wizardChess = {', from);
const diagnostic = from >= 0 && to > from ? source.slice(from, to) : '';

test('3D engine imports authoritative chess.js history and legal/status facade', () => {
  assert.match(source, /import \{ rebuildChessRulesFromHistory \} from '\.\/chessRulesReplay\.mjs';/);
  assert.match(source, /import \{ getChessRulesMoves, getChessRulesStatus \} from '\.\/chessRules\.mjs';/);
});
test('diagnostics exposed only through an opt-in read-only API', () => {
  assert.ok(diagnostic.length > 100);
  assert.match(source, /window\.wizardChess = \{\s*togglePause:[^\n]*,\s*inspectChessRulesParity,/);
  assert.match(diagnostic, /rebuildChessRulesFromHistory\(moveHistory, captureBoardSnapshot\(\)\)/);
});
test('diagnostics do not mutate turn, board, move history or UI state', () => {
  assert.match(diagnostic, /reason: 'busy'/);
  assert.match(diagnostic, /reason: 'out-of-sync'/);
  assert.doesNotMatch(diagnostic, /\b(?:executeChessMove|resetChessBoard|restoreBoardSnapshot|tryChessRulesMove|undoChessRulesMove|localStorage|postMessage)\s*\(/);
  assert.doesNotMatch(diagnostic, /(?:boardState\s*\[|moveHistory\s*\[|currentTurn\s*=|gameOver\s*=)/);
});
test('parity result compares unique coordinate roots and includes FEN, status', () => {
  assert.match(diagnostic, /new Set\(getChessRulesMoves\(chess\)\.map\(keyOf\)\)/);
  assert.match(diagnostic, /new Set\(getAllLegalMoves\(currentTurn\)\.map\(keyOf\)\)/);
  for (const field of ['fen:', 'status:', 'missingFrom3D:', 'extraIn3D:']) {
    assert.ok(diagnostic.includes(field), field);
  }
});
