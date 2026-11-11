import test from 'node:test';
import assert from 'node:assert/strict';
import { quiescence, legalSearchMoves, pickMove } from '../src/chessAiCore.mjs';

const blank = () => Array.from({ length: 8 }, () => Array(8).fill(null));
const place = (board, r, c, type, color) => {
  board[r][c] = { type, color, hasMoved: true };
};
const context = () => ({ deadline: Date.now() + 3000, nodes: 0, maxNodes: 50000 });

test('quiescence recognizes mate and stalemate at tactical depth zero', () => {
  const mate = blank();
  place(mate, 7, 7, 'king', 'w');
  place(mate, 7, 0, 'rook', 'b');
  place(mate, 6, 6, 'queen', 'b');
  place(mate, 5, 5, 'king', 'b');
  assert.equal(legalSearchMoves(mate, 'w').length, 0);
  assert.equal(quiescence(mate, 'w', -Infinity, Infinity, 0, 0, context()), -100000);

  const stalemate = blank();
  place(stalemate, 7, 7, 'king', 'w');
  place(stalemate, 6, 5, 'queen', 'b');
  place(stalemate, 5, 6, 'king', 'b');
  assert.equal(legalSearchMoves(stalemate, 'w').length, 0);
  assert.equal(quiescence(stalemate, 'w', -Infinity, Infinity, 0, 0, context()), 0);
});

test('quiescence expands quiet king escapes from check, including at the ply cap', () => {
  const board = blank();
  place(board, 7, 4, 'king', 'w');
  place(board, 7, 0, 'rook', 'b');
  place(board, 0, 4, 'king', 'b');
  const ctx = context();
  const score = quiescence(board, 'w', -Infinity, Infinity, 0, 0, ctx);
  assert.ok(Number.isFinite(score));
  assert.ok(ctx.nodes > 1, 'A checked leaf must expand legal non-capture escapes');
  assert.ok(Number.isFinite(quiescence(board, 'w', -Infinity, Infinity, 0, 8, context())));
});

test('quiescence spots a free queen capture beyond the static leaf', () => {
  const board = blank();
  place(board, 7, 4, 'king', 'w');
  place(board, 7, 0, 'rook', 'w');
  place(board, 6, 0, 'queen', 'b');
  place(board, 0, 4, 'king', 'b');
  assert.ok(quiescence(board, 'w', -Infinity, Infinity, 0, 0, context()) > 0);
});

test('Expert move stays in approved root list and search does not mutate input', () => {
  const board = blank();
  place(board, 7, 4, 'king', 'w');
  place(board, 7, 0, 'rook', 'w');
  place(board, 6, 0, 'queen', 'b');
  place(board, 0, 4, 'king', 'b');
  const legalMoves = legalSearchMoves(board, 'w');
  const snapshot = JSON.stringify(board);
  const result = pickMove({ cells: board, color: 'w', legalMoves, level: 5, maxTimeMs: 250 });
  assert.ok(legalMoves.some(m => JSON.stringify(m) === JSON.stringify(result)));
  assert.equal(JSON.stringify(board), snapshot);
});
