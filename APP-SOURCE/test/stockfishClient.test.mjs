import test from 'node:test';
import assert from 'node:assert/strict';
import { requestStockfishMove, STOCKFISH_WORKER_URL } from '../src/stockfishClient.mjs';

const cells=Array.from({length:8},()=>Array(8).fill(null));
cells[7][4]={type:'king',color:'w',hasMoved:false};
cells[0][4]={type:'king',color:'b',hasMoved:false};
cells[6][4]={type:'pawn',color:'w',hasMoved:false};
const legal=[{fromR:6,fromC:4,toR:4,toC:4}];

function fakeWorker(){
  const info={messages:[],ended:false,url:null,worker:null};
  const factory=url=>{
    info.url=url;
    info.worker={
      onmessage:null,onerror:null,onmessageerror:null,
      postMessage(s){info.messages.push(s);},
      terminate(){info.ended=true;},
      emit(s){this.onmessage?.({data:s});},
      error(){this.onerror?.(new Error('worker error'));}
    };
    return info.worker;
  };
  return {info,factory};
}
function ready(info){info.worker.emit('uciok');info.worker.emit('readyok');}

test('ordered offline UCI handshake and legal bestmove',async()=>{
  const {info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,workerFactory:factory,moveTimeMs:250});
  assert.equal(info.url,STOCKFISH_WORKER_URL);
  assert.deepEqual(info.messages,['uci']);
  info.worker.emit('bestmove e2e4');
  assert.deepEqual(info.messages,['uci']);
  info.worker.emit('uciok');
  assert.deepEqual(info.messages,['uci','isready']);
  info.worker.emit('readyok');
  assert.match(info.messages[2],/^position fen /);
  assert.equal(info.messages[3],'go movetime 250');
  info.worker.emit('bestmove e2e4 ponder e7e5');
  assert.equal(await p,legal[0]);
  assert.equal(info.ended,true);
});
test('handles multiline lines but ignores premature bestmove',async()=>{
  const {info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,workerFactory:factory});
  info.worker.emit('bestmove e2e4\nuciok\nreadyok');
  assert.equal(info.messages.length,4);
  info.worker.emit('info depth 2\nbestmove e2e4');
  assert.equal(await p,legal[0]);
});
test('unapproved bestmove fails closed',async()=>{
  const {info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,workerFactory:factory});
  ready(info);info.worker.emit('bestmove e2e3');
  assert.equal(await p,null);assert.equal(info.ended,true);
});
test('aborted signal before startup prevents worker allocation',async()=>{
  const c=new AbortController();c.abort();
  assert.equal(await requestStockfishMove({cells,color:'w',legalMoves:legal,signal:c.signal,
    workerFactory:()=>{throw Error('unreachable');}}),null);
});
test('cancellation during search terminates worker and clears callbacks',async()=>{
  const c=new AbortController(),{info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,signal:c.signal,workerFactory:factory});
  ready(info);c.abort();
  assert.equal(await p,null);assert.equal(info.ended,true);assert.equal(info.worker.onmessage,null);
});
test('onerror safely terminates worker',async()=>{
  const {info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,workerFactory:factory});
  info.worker.error();assert.equal(await p,null);assert.equal(info.ended,true);
});
test('worker construction failure returns null',async()=>{
  assert.equal(await requestStockfishMove({cells,color:'w',legalMoves:legal,
    workerFactory:()=>{throw Error('error');}}),null);
});
test('unresponsive worker obeys deadline',async()=>{
  const {info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,
    moveTimeMs:200,timeoutMs:1,workerFactory:factory});
  assert.equal(await p,null);assert.equal(info.ended,true);
});
test('no legal root moves skips worker',async()=>{
  assert.equal(await requestStockfishMove({cells,color:'w',legalMoves:[],
    workerFactory:()=>{throw Error('unreachable');}}),null);
});
test('move time has bounded maximum',async()=>{
  const {info,factory}=fakeWorker();
  const p=requestStockfishMove({cells,color:'w',legalMoves:legal,
    moveTimeMs:1e7,timeoutMs:1e7,workerFactory:factory});
  ready(info);assert.equal(info.messages[3],'go movetime 5000');
  info.worker.emit('bestmove e2e4');assert.equal(await p,legal[0]);
});
