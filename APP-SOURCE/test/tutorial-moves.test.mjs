import test from 'node:test';
import assert from 'node:assert/strict';
import { getTutorialSquares } from '../src/tutorialMoves.mjs';
const includes = (points, r, c) => points.some(([y,x]) => y===r && x===c);

test('pawn shows first one/two moves and diagonal capture opportunities', () => {
  const {moves,captures} = getTutorialSquares(0,6,3);
  assert.deepEqual(moves, [[4,3],[5,3]]);
  assert.deepEqual(captures, [[5,2],[5,4]]);
});
test('rook and bishop mark all reachable empty-board squares', () => {
  const rook=getTutorialSquares(1,4,3), bishop=getTutorialSquares(3,4,3);
  assert.equal(rook.moves.length,14);
  assert.equal(bishop.moves.length,13);
  assert.ok(includes(rook.moves,4,7));
  assert.ok(includes(bishop.moves,0,7));
});
test('knight, queen and king mark correct movement geometry', () => {
  const knight=getTutorialSquares(2,4,3);
  const queen=getTutorialSquares(4,4,3);
  const king=getTutorialSquares(5,4,3);
  assert.equal(knight.moves.length,8);
  assert.equal(queen.moves.length,27);
  assert.equal(king.moves.length,8);
  assert.ok(includes(knight.moves,2,4));
  assert.ok(includes(king.moves,3,4));
  assert.ok(!includes(king.moves,2,4));
});
test('invalid input cannot create off-board demonstration', () => {
  assert.throws(()=>getTutorialSquares(0,8,3),RangeError);
  assert.throws(()=>getTutorialSquares(6,4,3),RangeError);
});
