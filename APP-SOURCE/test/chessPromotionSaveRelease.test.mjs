import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeSavedGame,parseSavedGame} from '../src/saveGame.mjs';
const snapshot=(currentTurn='w',postPiece=null,color='w')=>{
  const cells=Array.from({length:8},()=>Array(8).fill(null));
  cells[7][4]={type:'king',color:'w',hasMoved:false};
  cells[0][4]={type:'king',color:'b',hasMoved:false};
  if(postPiece)cells[color==='w'?0:7][color==='w'?0:7]={type:postPiece,color,hasMoved:true};
  else cells[color==='w'?1:6][color==='w'?0:7]={type:'pawn',color,hasMoved:true};
  return {currentTurn,gameOver:false,capturedByWhite:0,capturedByBlack:0,
    scriptCursor:0,scriptedGameActive:false,scriptDeviated:false,cells};
};
const saved=(promotion='queen',mode='single',color='w')=>({
  version:1,mode,playerColor:'w',aiLevel:6,paused:false,
  ...(mode==='local'?{autoFlipLocalCamera:true}:{}),
  snapshot:snapshot(color==='w'?'b':'w',promotion,color),
  history:[{snapshot:snapshot(color,'',color),
    move:{color,pieceType:'pawn',fromR:color==='w'?1:6,fromC:color==='w'?0:7,
    toR:color==='w'?0:7,toC:color==='w'?0:7,capture:false,promotion}}]
});
const round=s=>parseSavedGame(encodeSavedGame(s));
for(const p of ['queen','rook','bishop','knight']){
  test('white promotion into '+p+' survives local Save/Load',()=>{
    const got=round(saved(p,'local'));
    assert.equal(got.history[0].move.promotion,p);
    assert.equal(got.snapshot.cells[0][0].type,p);
    assert.equal(got.mode,'local');
    assert.equal(got.autoFlipLocalCamera,true);
  });
  test('black promotion into '+p+' survives single-player Save/Load',()=>{
    const got=round(saved(p,'single','b'));
    assert.equal(got.history[0].move.promotion,p);
    assert.equal(got.snapshot.cells[7][7].type,p);
    assert.equal(got.aiLevel,6);
  });
}
test('reject counterfeit promotion types',()=>{
  for(const bad of ['king','pawn','dragon','Queen','q',null]){
    const x=saved();x.history[0].move.promotion=bad;
    assert.throws(()=>encodeSavedGame(x),String(bad));
  }
});
test('reject nonpawn and nonfinal-rank underpromotion history',()=>{
  const x=saved('rook');x.history[0].move.pieceType='knight';
  assert.throws(()=>encodeSavedGame(x));
  const y=saved('bishop');y.history[0].move.toR=3;
  assert.throws(()=>encodeSavedGame(y));
});
test('legacy queen history remains valid in unchanged schema version',()=>{
  const got=round(saved('queen','single'));
  assert.equal(got.version,1);
  assert.equal(got.history[0].move.promotion,'queen');
});
test('release npm scripts are Windows-safe and require explicit npm install',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  for(const script of ['predev','prebuild','prelint'])assert.equal(pkg.scripts[script],undefined);
  for(const script of ['dev','build','lint'])assert.equal(typeof pkg.scripts[script],'string');
});
test('release HTML metadata describes six AI levels and two human players',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/six offline AI levels including Stockfish/);
  assert.match(html,/local two-player chess/);
});
