import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { newRoom, joinRoom, applyMove, claimDraw, publicRoom,
  evaluateFideDraw, fidePositionKey } from '../src/game.mjs';
const CODE = 'ABCDEFGHJK';
const seq = ['g1f3','g8f6','f3g1','f6g8'];
function paired(){return joinRoom(newRoom(CODE,'w','host',1000),'guest',1001).room;}
function play(room, uci){
  const side=room.moves.length%2===0?'w':'b';
  const res=applyMove(room,side,{clientMoveId:'p3b4_'+room.moves.length.toString().padStart(8,'0'),
    expectedPly:room.moves.length,from:uci.slice(0,2),to:uci.slice(2,4)},2000+room.moves.length);
  assert.equal(res.ok,true, `${uci}: ${res.reason}`);
  return res.room;
}
test('FIDE thresholds distinguish claimable 3/50 from automatic 5/75',()=>{
  assert.equal(evaluateFideDraw({repetitions:3,halfMoves:99}).automatic,null);
  assert.deepEqual(evaluateFideDraw({repetitions:3,halfMoves:100}).claimable,{threefold:true,fiftyMove:true});
  assert.equal(evaluateFideDraw({repetitions:4,halfMoves:149}).automatic,null);
  assert.equal(evaluateFideDraw({repetitions:5,halfMoves:110}).automatic,'fivefold');
  assert.equal(evaluateFideDraw({repetitions:1,halfMoves:150}).automatic,'seventy-five-move');
  assert.equal(evaluateFideDraw({repetitions:5,halfMoves:150,checkmate:true}).automatic,null);
});
test('fide position key discards a non-capturable ep target',()=>{
  const a=new Chess();a.move('e4');
  const b=new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert.equal(fidePositionKey(a),fidePositionKey(b));
});
test('third repetition is claimable, not automatic; only side to move may claim',()=>{
  let room=paired();for(let i=0;i<2;i++)for(const move of seq) room=play(room,move);
  const publicState=publicRoom(room);
  assert.equal(room.status,'playing');
  assert.deepEqual(publicState.claimableDraw,{threefold:true,fiftyMove:false});
  assert.equal(publicState.draw,false);
  assert.equal(claimDraw(room,'b',{},3000).reason,'not-your-turn');
  const claimed=claimDraw(room,'w',{},3000);
  assert.equal(claimed.ok,true);
  assert.equal(claimed.room.result.type,'draw-claimed');
  assert.equal(claimed.room.result.reason,'threefold');
  assert.equal(publicRoom(claimed.room).gameOver,true);
  assert.equal(claimDraw(claimed.room,'w',{},3000).ok,false);
});
test('intended-move draw claim is checked without committing the candidate move',()=>{
  let room=paired();for(let i=0;i<7;i++)room=play(room,seq[i%4]);
  const none=claimDraw(room,'b',{},3000);
  assert.equal(none.reason,'draw-not-claimable');
  const claimed=claimDraw(room,'b',{intendedMove:{from:'f6',to:'g8'}},3000);
  assert.equal(claimed.ok,true);
  assert.equal(claimed.room.moves.length,7);
  assert.equal(claimed.room.result.reason,'threefold');
  assert.equal(claimDraw(room,'b',{intendedMove:{from:'f6',to:'f3'}},3000).ok,false);
});
test('fivefold repetition is automatic and has no claim requirement',()=>{
  let room=paired();for(let i=0;i<4;i++)for(const move of seq)room=play(room,move);
  assert.equal(room.status,'finished');
  assert.equal(room.result.type,'draw-automatic');
  assert.equal(room.result.reason,'fivefold');
  assert.equal(room.moves.length,16);
  assert.equal(publicRoom(room).draw,true);
});
