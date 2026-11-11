import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChessRulesGame, getChessRulesMoves, getChessRulesBoard,
  getChessRulesStatus, tryChessRulesMove, undoChessRulesMove
} from '../src/chessRules.mjs';

const find = (game, uci) => getChessRulesMoves(game).find(m => m.uci === uci);
const coords = (uci, promotion) => ({
  fromR: 8 - Number(uci[1]), fromC: uci.charCodeAt(0) - 97,
  toR: 8 - Number(uci[3]), toC: uci.charCodeAt(2) - 97,
  ...(promotion ? {promotion} : {})
});

test('start position has 20 legal moves and consistent 8x8 board', () => {
  const game = createChessRulesGame();
  assert.equal(getChessRulesMoves(game).length, 20);
  const cells = getChessRulesBoard(game);
  assert.equal(cells.length, 8);
  assert.deepEqual(cells[7][4], {type:'king',color:'w'});
  assert.deepEqual(cells[0][4], {type:'king',color:'b'});
  assert.equal(getChessRulesStatus(game).turn, 'w');
});
test('legal root move maps to board coordinates and advances rules position', () => {
  const game = createChessRulesGame();
  const e4 = find(game, 'e2e4');
  assert.deepEqual([e4.fromR,e4.fromC,e4.toR,e4.toC],[6,4,4,4]);
  const out = tryChessRulesMove(game, coords('e2e4'));
  assert.equal(out.uci, 'e2e4');
  assert.equal(out.status.turn, 'b');
  assert.deepEqual(getChessRulesBoard(game)[4][4], {type:'pawn',color:'w'});
});
test('en passant captures pawn on adjacent square, not destination', () => {
  const game = createChessRulesGame();
  for (const san of ['e4','a6','e5','d5']) game.move(san);
  const ep = find(game, 'e5d6');
  assert.equal(ep.enPassant, true);
  assert.equal(ep.capture, true);
  assert.deepEqual([ep.captureR,ep.captureC],[3,3]);
  assert.equal(tryChessRulesMove(game, coords('e5d6')).enPassant, true);
  const cells = getChessRulesBoard(game);
  assert.equal(cells[3][3], null);
  assert.deepEqual(cells[2][3], {type:'pawn',color:'w'});
});
test('pinned pawn cannot capture en passant exposing own king', () => {
  const game = createChessRulesGame('4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.equal(find(game, 'e5d6'), undefined);
});
test('en passant expires when the next move is different', () => {
  const game = createChessRulesGame();
  for (const san of ['e4','a6','e5','d5','Nf3','a5']) game.move(san);
  assert.equal(find(game,'e5d6'), undefined);
});
test('four promotions are distinct, and missing choice fails closed', () => {
  const initial='7k/P7/8/8/8/8/8/7K w - - 0 1';
  const base=createChessRulesGame(initial);
  const promotions=getChessRulesMoves(base).filter(m=>m.from==='a7'&&m.to==='a8');
  assert.deepEqual(promotions.map(m=>m.promotion).sort(),['b','n','q','r']);
  assert.equal(tryChessRulesMove(base, coords('a7a8')), null);
  assert.equal(base.fen(), initial);
  for(const p of ['q','r','b','n']) {
    const game=createChessRulesGame(initial);
    assert.equal(tryChessRulesMove(game,coords('a7a8',p)).promotion,p);
    assert.equal(game.get('a8').type,p);
  }
});
test('castling moves rook and cannot pass through attacked square', () => {
  const free=createChessRulesGame('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(find(free,'e1g1').castle,'k');
  assert.equal(tryChessRulesMove(free,coords('e1g1')).castle,'k');
  assert.deepEqual(getChessRulesBoard(free)[7][5],{type:'rook',color:'w'});
  const checked=createChessRulesGame('4kr2/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(find(checked,'e1g1'),undefined);
});
test('Fools mate is terminal checkmate', () => {
  const game=createChessRulesGame();
  for(const m of ['f3','e5','g4','Qh4#']) game.move(m);
  const s=getChessRulesStatus(game);
  assert.equal(s.checkmate,true);
  assert.equal(s.gameOver,true);
  assert.equal(getChessRulesMoves(game).length,0);
});
test('stalemate is draw, not checkmate', () => {
  const s=getChessRulesStatus(createChessRulesGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'));
  assert.equal(s.stalemate,true);
  assert.equal(s.checkmate,false);
  assert.equal(s.draw,true);
});
test('insufficient material is draw', () => {
  const s=getChessRulesStatus(createChessRulesGame('7k/8/8/8/8/8/8/K7 w - - 0 1'));
  assert.equal(s.insufficientMaterial,true);
  assert.equal(s.draw,true);
});
test('threefold repetition is detected with history', () => {
  const game=createChessRulesGame();
  for (const m of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8']) game.move(m);
  const s=getChessRulesStatus(game);
  assert.equal(s.threefoldRepetition,true);
  assert.equal(s.draw,true);
});
test('50-move threshold produces a draw', () => {
  const s=getChessRulesStatus(createChessRulesGame('7k/8/8/8/8/8/6R1/K7 w - - 100 1'));
  assert.equal(s.fiftyMoveRule,true);
  assert.equal(s.draw,true);
});
test('stale, malformed, or illegal moves never change game state', () => {
  const game=createChessRulesGame();
  const before=game.fen();
  assert.equal(tryChessRulesMove(game, coords('e2e5')),null);
  assert.equal(tryChessRulesMove(game, {fromR:8,fromC:0,toR:0,toC:0}),null);
  assert.equal(tryChessRulesMove(game,null),null);
  assert.equal(tryChessRulesMove(game,coords('e2e4','n')),null);
  assert.equal(game.fen(),before);
});
test('undo restores the previous legal board and turn', () => {
  const game=createChessRulesGame();
  const before=game.fen();
  assert.equal(undoChessRulesMove(game),null);
  tryChessRulesMove(game,coords('e2e4'));
  const undo=undoChessRulesMove(game);
  assert.equal(undo.uci,'e2e4');
  assert.equal(game.fen(),before);
  assert.equal(getChessRulesStatus(game).turn,'w');
});
test('invalid FEN is rejected rather than silently replaced', () => {
  assert.throws(()=>createChessRulesGame('not a legal fen'));
});
