import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_LEVELS, legalSearchMoves, makeBoardMove, pickMove } from '../src/chessAiCore.mjs';

function board(...pieces) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [r, c, type, color, hasMoved = false] of pieces) grid[r][c] = { type, color, hasMoved };
  return grid;
}

const initial = () => {
  const b = board();
  const row = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: row[c], color: 'b', hasMoved: false };
    b[1][c] = { type: 'pawn', color: 'b', hasMoved: false };
    b[6][c] = { type: 'pawn', color: 'w', hasMoved: false };
    b[7][c] = { type: row[c], color: 'w', hasMoved: false };
  }
  return b;
};

test('AI strengths 1–5 have progressively different search limits', () => {
  assert.deepEqual(Object.keys(AI_LEVELS), ['1','2','3','4','5']);
  const configs = Object.values(AI_LEVELS);
  assert.ok(configs.slice(1).every((v,i) => v.depth > configs[i].depth));
  assert.ok(configs.slice(2).every((v,i) => v.timeMs > configs[i+1].timeMs));
});

test('initial chess position has exactly twenty legal root moves for both sides', () => {
  assert.equal(legalSearchMoves(initial(), 'w').length, 20);
  assert.equal(legalSearchMoves(initial(), 'b').length, 20);
});

test('move generation forbids moving own king into a rook attack', () => {
  const b = board([7,4,'king','w'],[0,4,'rook','b'],[0,0,'king','b']);
  assert.ok(!legalSearchMoves(b, 'w').some(m => m.toR === 6 && m.toC === 4));
});

test('castling moves require safe transit squares and both pieces unmoved', () => {
  const good = board([7,4,'king','w'],[7,7,'rook','w'],[0,0,'king','b']);
  assert.ok(legalSearchMoves(good, 'w').some(m => m.toR === 7 && m.toC === 6));
  const after = makeBoardMove(good, {fromR:7,fromC:4,toR:7,toC:6});
  assert.equal(after[7][5].type,'rook');
  assert.equal(after[7][7],null);
  assert.ok(!legalSearchMoves(board([7,4,'king','w'],[7,7,'rook','w'],[0,0,'king','b'],[0,5,'rook','b']), 'w').some(m => m.fromC === 4 && m.toR === 7 && m.toC === 6));
});

test('stronger AI always selects from the game-approved legal root moves', () => {
  const b = initial(), allowed = legalSearchMoves(b, 'b');
  for (let level = 1; level <= 5; level++) {
    const move = pickMove({cells:b,color:'b',legalMoves:allowed,level,random:()=>0.3,maxTimeMs:75});
    assert.ok(allowed.includes(move));
  }
  assert.equal(pickMove({cells:b,color:'w',legalMoves:[],level:5}),null);
});

test('easy and expert prefer winning an undefended queen to a quiet king move', () => {
  const b = board([7,4,'king','w'],[0,4,'king','b'],[4,4,'rook','w'],[4,1,'queen','b']);
  const legalMoves = legalSearchMoves(b,'w');
  const queenCapture = m => m.fromR===4 && m.fromC===4 && m.toR===4 && m.toC===1;
  assert.ok(legalMoves.some(queenCapture));
  for (let level of [3,4,5]) {
    const chosen=pickMove({cells:b,color:'w',legalMoves,level,maxTimeMs:500});
    assert.ok(queenCapture(chosen),`level ${level} did not find the queen capture: ${JSON.stringify(chosen)}`);
  }
});

test('pawn promotion is scored as a queen in search without mutating input', () => {
  const b = board([7,4,'king','w'],[0,4,'king','b'],[1,0,'pawn','w']);
  const move = {fromR:1,fromC:0,toR:0,toC:0};
  const b2=makeBoardMove(b,move);
  assert.equal(b2[0][0].type,'queen');
  assert.equal(b[1][0].type,'pawn');
});

test('UI exposes five distinct difficulty options and engine attaches persistence and cancellation', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../src/chessAiWorker.mjs', import.meta.url), 'utf8');
  assert.match(app,/id="ai-difficulty"/);
  for (let level=1; level<=5; level++) assert.match(app,new RegExp(`<option value="${level}"`));
  assert.match(engine,/wizard_chess_ai_level/);
  assert.match(engine,/aiSelect.addEventListener\('change'/);
  assert.match(engine,/new Worker\(new URL\('\.\/chessAiWorker\.mjs', import\.meta\.url\)/);
  assert.match(engine,/function cancelAIComputation\(\)/);
  assert.match(engine,/worker\.terminate\(\)/);
  assert.match(engine,/legalMoves\.find\(m =>/);
  assert.match(worker,/pickMove\(data\)/);
});
