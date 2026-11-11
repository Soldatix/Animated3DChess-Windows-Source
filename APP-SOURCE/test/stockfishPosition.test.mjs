import test from 'node:test';
import assert from 'node:assert/strict';
import {boardToFen,halfmoveClockFromHistory,bestmoveToLegalMove,isUciLine}
  from '../src/stockfishPosition.mjs';

function initial(){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  const back=['rook','knight','bishop','queen','king','bishop','knight','rook'];
  for(let i=0;i<8;i++){
    b[0][i]={type:back[i],color:'b',hasMoved:false};
    b[1][i]={type:'pawn',color:'b',hasMoved:false};
    b[6][i]={type:'pawn',color:'w',hasMoved:false};
    b[7][i]={type:back[i],color:'w',hasMoved:false};
  }
  return b;
}

test('initial position yields valid FEN with castling and no en passant',()=>{
  assert.equal(boardToFen(initial(),'w'),
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});
test('castling requires unmoved king and rook on their original square',()=>{
  const b=initial();b[7][7].hasMoved=true;b[0][4].hasMoved=true;
  assert.match(boardToFen(b,'b',3,2),/ b Q - 2 2$/);
});
test('FEN rejects invalid inputs and missing kings',()=>{
  assert.throws(()=>boardToFen([],'w'));
  const b=initial();b[7][4]=null;assert.throws(()=>boardToFen(b,'w'));
});
test('halfmove counter resets after pawn or capture',()=>{
  const h=['knight','bishop','pawn','rook','rook'].map(p=>({move:{pieceType:p,capture:false}}));
  assert.equal(halfmoveClockFromHistory(h),2);
  assert.equal(halfmoveClockFromHistory([]),0);
});
test('bestmove must match a game-approved legal move',()=>{
  const b=initial(),legal=[{fromR:6,fromC:4,toR:4,toC:4}];
  assert.equal(bestmoveToLegalMove('bestmove e2e4 ponder e7e5',legal,b),legal[0]);
  assert.equal(bestmoveToLegalMove('bestmove e2e5',legal,b),null);
  assert.equal(bestmoveToLegalMove('bestmove (none)',legal,b),null);
});
test('accept queen promotion, reject unsupported underpromotions',()=>{
  const b=initial();b[1][0]={type:'pawn',color:'w',hasMoved:true};b[0][0]=null;
  const legal=[{fromR:1,fromC:0,toR:0,toC:0}];
  assert.equal(bestmoveToLegalMove('bestmove a7a8q',legal,b),legal[0]);
  assert.equal(bestmoveToLegalMove('bestmove a7a8n',legal,b),null);
  assert.equal(bestmoveToLegalMove('bestmove a7a8',legal,b),null);
});
test('UCI lifecycle line matching is exact',()=>{
  assert.equal(isUciLine('readyok','readyok'),true);
  assert.equal(isUciLine('notreadyok','readyok'),false);
});
