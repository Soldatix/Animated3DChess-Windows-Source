import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeSavedGame, parseSavedGame } from '../src/saveGame.mjs';
import { TEXT } from '../src/i18n.js';

const engine = readFileSync(new URL('../src/wizardChessEngine.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
function snapshot() {
  const cells=Array.from({length:8},()=>Array(8).fill(null));
  cells[7][4]={type:'king',color:'w',hasMoved:false};
  cells[0][4]={type:'king',color:'b',hasMoved:false};
  return {currentTurn:'w',gameOver:false,capturedByWhite:0,capturedByBlack:0,
    scriptCursor:0,scriptedGameActive:false,scriptDeviated:false,cells};
}
const state=level=>({version:1,mode:'single',playerColor:'w',aiLevel:level,
  paused:true,snapshot:snapshot(),history:[]});

test('six selectable levels preserve the five legacy choices',()=>{
  for(let n=1;n<=6;n++)assert.match(app,new RegExp('<option value="'+n+'"'));
  assert.match(app,/6 · \{copy\.grandmaster\}/);
});
test('five locale labels for Grandmaster',()=>{
  assert.equal(TEXT.en.grandmaster,'Grandmaster');
  assert.equal(TEXT.hr.grandmaster,'Velemajstor');
  assert.equal(TEXT.de.grandmaster,'Großmeister');
  assert.equal(TEXT.it.grandmaster,'Grande maestro');
  assert.equal(TEXT.es.grandmaster,'Gran maestro');
});
test('v1 saves roundtrip for old levels and six, reject invalid difficulty',()=>{
  for(let n=1;n<=6;n++)assert.deepEqual(parseSavedGame(encodeSavedGame(state(n))),state(n));
  assert.throws(()=>encodeSavedGame(state(0)));
  assert.throws(()=>encodeSavedGame(state(7)));
});
test('level setting accepts six and uses existing localStorage key',()=>{
  assert.match(engine,/value >= 1 && value <= 6\) aiLevel = value/);
  assert.match(engine,/chosen < 1 \|\| chosen > 6/);
  assert.match(engine,/wizard_chess_ai_level/);
});
test('level six routes to separate Stockfish worker, levels 1-5 unchanged',()=>{
  assert.match(engine,/import \{ requestStockfishMove \} from '\.\/stockfishClient\.mjs'/);
  assert.match(engine,/if \(aiLevel === 6\) \{/);
  assert.match(engine,/void requestStockfishMove\(\{/);
  assert.match(engine,/new Worker\(new URL\('\.\/chessAiWorker\.mjs', import\.meta\.url\)/);
});
test('pause reset load and moves cancel Stockfish through existing cancellation',()=>{
  assert.match(engine,/let stockfishAbort = null/);
  assert.match(engine,/function cancelAIComputation\(\) \{[\s\S]{0,160}stockfishAbort\.abort\(\)/);
  assert.match(engine,/signal: controller\.signal/);
  assert.match(engine,/controller\.signal\.aborted \|\| aiRequestId !== requestId/);
});
test('bestmove is revalidated against current game root, not stale snapshot',()=>{
  assert.match(engine,/candidate && getAllLegalMoves\(color\)\.find\(m =>/);
  assert.match(engine,/executeChessMove\(legal\.fromR, legal\.fromC, legal\.toR, legal\.toC\)/);
  assert.match(engine,/halfmoveClock: halfmoveClockFromHistory\(moveHistory\)/);
});
