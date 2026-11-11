import test from 'node:test';
import assert from 'node:assert/strict';
import {verticalFovForAspect} from '../src/viewportFit.mjs';
import {encodeSavedGame,parseSavedGame} from '../src/saveGame.mjs';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const init=()=>{const cells=Array.from({length:8},()=>Array(8).fill(null));cells[7][4]={type:'king',color:'w',hasMoved:false};cells[0][4]={type:'king',color:'b',hasMoved:false};return cells;};
const snap=()=>({currentTurn:'w',gameOver:false,capturedByWhite:0,capturedByBlack:0,scriptCursor:0,scriptedGameActive:false,scriptDeviated:false,cells:init()});
const state=()=>({version:1,mode:'single',playerColor:'w',aiLevel:5,paused:true,snapshot:snap(),history:[]});
test('camera expands vertical field on narrow aspect and keeps baseline on wide',()=>{
 assert.equal(verticalFovForAspect(16/9),40);
 assert.ok(verticalFovForAspect(0.8)>verticalFovForAspect(1.2));
 assert.equal(verticalFovForAspect(NaN),40);
});
test('local save state round trips',()=>assert.deepEqual(parseSavedGame(encodeSavedGame(state())),state()));
test('corrupt save positions and moves are refused',()=>{
 const x=state();x.snapshot.cells[7][4]=null;assert.throws(()=>encodeSavedGame(x));
 const y=state();y.history=[{snapshot:snap(),move:{color:'w',pieceType:'pawn',fromR:8,fromC:0,toR:5,toC:0,capture:false,promotion:'queen'}}];
 assert.throws(()=>encodeSavedGame(y));assert.throws(()=>parseSavedGame('{bad'));
});
test('UI hooks and locales exist',()=>{
 assert.match(app,/TutorialPanel/);
 assert.match(app,/P1G_COPY\[language\]/);
 const locale=readFileSync(new URL('../src/P1gCopy.ts',import.meta.url),'utf8');
 for(const lang of ['en','hr','de','it','es'])assert.ok(locale.includes(lang+':{'));
 assert.match(css,/\.wc-language-slot\s*\{ position: absolute; top: 46px; left: 0; right: auto;/);
 assert.match(src,/if \(gameMode !== 'single' \|\| isAnimatingMove \|\| gameOver \|\| gamePaused \|\| aiWorker\) return false;/);
 assert.match(src,/if \(gamePaused\) \{ if \(doRender\)/);
});
