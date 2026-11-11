import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeSavedGame,parseSavedGame} from '../src/saveGame.mjs';
const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const engine=src('wizardChessEngine.js'),app=src('App.tsx'),copy=src('P1gCopy.ts'),i18n=src('i18n.js'),css=src('styles.css');
function saved(mode='single',flip=false){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  b[7][4]={type:'king',color:'w',hasMoved:false};
  b[0][4]={type:'king',color:'b',hasMoved:false};
  return {version:1,mode,playerColor:'w',aiLevel:5,paused:false,autoFlipLocalCamera:flip,
    snapshot:{currentTurn:'w',gameOver:false,capturedByWhite:0,capturedByBlack:0,scriptCursor:0,scriptedGameActive:false,scriptDeviated:false,cells:b},
    history:[]};
}
test('legacy single v1 save still roundtrips unchanged mode',()=>assert.equal(parseSavedGame(encodeSavedGame(saved())).mode,'single'));
test('local two-player v1 game saves and restores selected mode',()=>assert.equal(parseSavedGame(encodeSavedGame(saved('local'))).mode,'local'));
test('local auto-flip true persists through save codec',()=>assert.equal(parseSavedGame(encodeSavedGame(saved('local',true))).autoFlipLocalCamera,true));
test('local auto-flip false is the default on historic local saves',()=>{const state=saved('local');delete state.autoFlipLocalCamera;assert.equal(parseSavedGame(encodeSavedGame(state)).autoFlipLocalCamera,false);});
test('invalid mode cannot load/save, preserving remote-mode separation',()=>assert.throws(()=>encodeSavedGame(saved('multi'))));
test('local mode initialized without remote connection and with AI off',()=>{
 assert.match(engine,/function startLocalTwoPlayer\(\)/);
 assert.match(engine,/stopMultiplayerSync\(\);[\s\S]*?gameMode = 'local';/);
 assert.match(engine,/gameMode = 'local';[\s\S]*?resetChessBoard\(true\)/);
 assert.match(engine,/function triggerAIMoveNow\(\)[\s\S]*?if \(gameMode !== 'single'/);
});
test('switching back to computer mode retains independent single-player mode',()=>{
 assert.match(engine,/function startComputerGame\(\)/);
 assert.match(engine,/gameMode = 'single';/);
 assert.match(engine,/window\.dispatchEvent\(new CustomEvent\('wizard-chess-mode-changed'/);
});
test('local move admission uses FIDE rules and does not bypass remote limits',()=>{
 assert.match(engine,/if \(\(gameMode === 'single' \|\| gameMode === 'local'\) && !options\.fromRemote/);
 assert.match(engine,/gameMode === 'single' \|\| gameMode === 'local'\) && !scriptedGameActive/);
});
test('local promotion selection allows either player to choose q r b n',()=>{
 assert.match(engine,/gameMode === 'local' \|\| currentTurn === playerColor/);
 assert.match(engine,/wizard-chess-promotion-request/);
});
test('automatic fivefold / 75 move / insufficient rules include local mode',()=>{
 assert.match(engine,/const drawGame = \(gameMode === 'single' \|\| gameMode === 'local'\)/);
 assert.match(engine,/inspectFideDrawPolicy\(drawGame\)/);
});
test('human-turn draw claim enabled in local mode but restricted in vs AI',()=>{
 assert.match(engine,/function getClaimableFideDraw\(\)/);
 assert.match(engine,/gameMode !== 'single' && gameMode !== 'local'/);
 assert.match(engine,/gameMode === 'single' && currentTurn !== playerColor/);
});
test('undo one ply in local two-player, preserves AI undo policy',()=>{
 assert.match(engine,/const count = gameMode === 'local' \? 1 : countUndoPlies\(moveHistory, playerColor, aiAutoPlay\)/);
});
test('automatic optional camera flip performed only at completed turn and never overrides manual default',()=>{
 assert.match(engine,/let autoFlipLocalCamera = false/);
 assert.match(engine,/if \(gameMode === 'local' && autoFlipLocalCamera && !gameOver\)/);
 assert.match(engine,/setCameraForSide\(currentTurn, false\)/);
});
test('new mode APIs and changes communicated to React',()=>{
 for(const api of ['startLocalTwoPlayer','startComputerGame','getGameMode','setAutoFlipLocalCamera','getAutoFlipLocalCamera']){
   assert.ok(engine.includes(api),api);
 }
 assert.match(app,/wizard-chess-mode-changed/);
});
test('mode buttons and auto-flip controls translated across 5 languages',()=>{
 assert.match(app,/id="btn-local-two-player"/);
 assert.match(app,/id="btn-versus-computer"/);
 assert.match(app,/id="btn-local-auto-flip"/);
 for(const key of ['twoPlayers:','versusComputer:','autoCameraFlip:'])assert.equal(copy.split(key).length-1,5,key);
 assert.equal(i18n.split('"localTwoPlayers":').length-1,5);
});
test('mobile controls layout includes local two-player options',()=>assert.match(css,/#btn-local-two-player, #btn-versus-computer, #btn-local-auto-flip/));
