// Targeted Astrа regression: engine-wide entry gate and safe Leave while animating.
// No production network, browser, Credential Manager, Tauri, or Git operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {OnlineMultiplayerClient} from '../src/onlineMultiplayerClient.mjs';
const engine=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/OnlineMultiplayerPanel.tsx',import.meta.url),'utf8');
const CODE='ABCDEFGH23';
const seat=(token='new-seat')=>({side:'w',code:CODE,room:{code:CODE,revision:1,ply:0},token});
function deferred() {let resolve;let reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(){
 const vault={token:'',deleted:0};
 const pendingClients=[];
 let factory;
 const ctx={
   TEST_URL:'https://pilot.example.test',
   window:{dispatchEvent(){}},CustomEvent:class {constructor(n,p){this.type=n;this.detail=p?.detail;}},
   isAnimatingMove:false,activeMoveTweens:[],preMoveHighlightTask:null,
   scriptedGameActive:false,scriptMoves:[],scriptCursor:0,scriptDeviated:false,
   gameMode:'single',playerColor:'w',roomCode:null,
   setGamePaused(){}, resetChessBoard(){ctx.resets++;}, resets:0,
   queueOnlineRoomState(){},clearTimeout(){},
   createOnlineMultiplayerClient:()=>factory(),
 };
 const head=engine.slice(engine.indexOf('    let onlineClient = null;'),engine.indexOf('    function freezeOnline('));
 const start=engine.slice(engine.indexOf('    async function startOnlineSession(mode, input) {'),engine.indexOf('    async function createMultiplayerRoom('));
 assert.ok(head.startsWith('    let onlineClient = null;')&&start.startsWith('    async function startOnlineSession'));
 const compiled=head+'\n'+start.replaceAll('import.meta.env.VITE_CHESS_MP_URL','TEST_URL')+`\n`+
   `globalThis.TEST={startOnlineSession,stopMultiplayerSync,getOnlineState,`+
   `setMode(m){gameMode=m;},getMode(){return gameMode;},`+
   `setClient(c){onlineClient=c;},getClient(){return onlineClient;}};`;
 runInNewContext(compiled,ctx,{filename:'extracted-wizardChessEngine.js'});
 function createClient(){
   const response=deferred(),saved=deferred();
   const client={code:null,closed:false,closeCalls:[],store:{async clearAsync(){vault.token='';vault.deleted++;}},
     async create(){const data=await response.promise;client.code=data.code;await saved.promise;vault.token=data.token;return data;},
     async join(){return this.create();},
     close(options={}){client.closeCalls.push(options);client.closed=true;if(options.forget){vault.token='';vault.deleted++;}},
   };
   pendingClients.push({client,response,saved});return client;
 }
 factory=createClient;
 return {h:ctx.TEST,ctx,vault,pendingClients,createClient,setFactory(fn){factory=fn;}};
}
async function complete(harness,idx=0,token='seat-A'){
 const c=harness.pendingClients[idx];c.response.resolve(seat(token));c.saved.resolve();
}
test('engine-wide lock blocks overlapping Create / Join even across panel remount',async()=>{
 const h=harness();
 const one=h.h.startOnlineSession('host','w');
 assert.equal(h.h.getOnlineState().entryPending,true);
 await assert.rejects(()=>h.h.startOnlineSession('join',CODE),/online-entry-pending/);
 assert.equal(h.pendingClients.length,1);
 await complete(h);
 const result=await one;
 assert.equal(result.code,CODE);assert.equal(h.h.getMode(),'multi');
 assert.equal(h.vault.token,'seat-A');assert.equal(h.ctx.resets,1);
 assert.equal(h.h.getOnlineState().entryPending,false);
});
test('old client closing after new seat save never deletes the new credential',async()=>{
 const h=harness();
 const former={closeCalls:[],close(opts){this.closeCalls.push(opts);}};
 h.h.setClient(former);h.h.setMode('multi');h.vault.token='prior-seat';
 const task=h.h.startOnlineSession('host','w');await complete(h,0,'replacement-seat');
 await task;
 assert.equal(h.vault.token,'replacement-seat');
 assert.equal(former.closeCalls.length,1);
 assert.equal(former.closeCalls[0].forget,false);
});
test('switching to computer mode during HTTP flight cancels stale response and clears late vault seat',async()=>{
 const h=harness();const task=h.h.startOnlineSession('host','w');
 h.h.stopMultiplayerSync();h.h.setMode('single');
 await complete(h);
 await assert.rejects(task,/online-entry-cancelled/);
 assert.equal(h.h.getMode(),'single');assert.equal(h.ctx.resets,0);
 assert.equal(h.vault.token,'');assert.equal(h.vault.deleted,1);
 assert.equal(h.h.getOnlineState().entryPending,false);
 const retry=h.h.startOnlineSession('host','w');await complete(h,1,'retry-seat');
 await retry;assert.equal(h.vault.token,'retry-seat');
});
test('mode switch during delayed native vault save cannot re-enter online or keep stale credential',async()=>{
 const h=harness();const task=h.h.startOnlineSession('join',CODE);
 const pending=h.pendingClients[0];pending.response.resolve(seat('late-seat'));
 await Promise.resolve();await Promise.resolve();
 assert.equal(h.vault.token,''); // save still blocked
 h.h.stopMultiplayerSync();h.h.setMode('local');
 pending.saved.resolve();
 await assert.rejects(task,/online-entry-cancelled/);
 assert.equal(h.h.getMode(),'local');assert.equal(h.ctx.resets,0);
 assert.equal(h.vault.token,'');
});
test('Leave UI only clears view and closes when game engine returns true',()=>{
 assert.match(panel,/if \(api\(\)\?\.leaveOnlineRoom\?\.\(\) === true\) \{ setView\(\{\}\); onClose\(\); \}/);
 assert.match(panel,/else setError\(w\.waitAnimation\);/);
 assert.match(panel,/disabled=\{pending \|\| view\.entryPending\}/);
 assert.match(engine,/if \(isAnimatingMove \|\| activeMoveTweens\.length \|\| preMoveHighlightTask\) return false;[\s\S]{0,100}stopMultiplayerSync\(\);/);
});
test('local game load invalidates delayed room entry before board mutation',()=>{
 assert.match(engine,/if \(onlineEntryPending\) stopMultiplayerSync\(\);[\s\S]*?setGamePaused\(true\);/);
});

test('real client + native vault: cancellation during Credential Manager save clears stale seat',async()=>{
  const h=harness(),saveStarted=deferred(),releaseSave=deferred(),native=new Map();
  const originalStorage=globalThis.localStorage;
  const storage=new Map();
  globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  Object.defineProperty(globalThis,'__TAURI__',{configurable:true,value:{core:{invoke:async(name,args)=>{
    if(name==='online_vault_save'){saveStarted.resolve();await releaseSave.promise;native.set(args.baseUrl,args.record);return null;}
    if(name==='online_vault_load')return native.get(args.baseUrl)??null;
    if(name==='online_vault_clear'){native.delete(args.baseUrl);return null;}
    throw new Error('unexpected native command');
  }}}});
  const noSocket=class {addEventListener(){}close(){}};
  h.setFactory(()=>new OnlineMultiplayerClient({baseUrl:h.ctx.TEST_URL,WebSocketImpl:noSocket,
    fetchImpl:async()=>({ok:true,status:201,json:async()=>({ok:true,code:CODE,side:'w',token:'S'.repeat(43),room:{code:CODE,revision:1,ply:0}})}),
    setTimeoutImpl:()=>0,clearTimeoutImpl:()=>{}}));
  try {
    const request=h.h.startOnlineSession('host','w');
    await saveStarted.promise; // HTTP succeeded, native save is still in flight
    h.h.stopMultiplayerSync();h.h.setMode('local');
    releaseSave.resolve();
    await assert.rejects(request,/online-entry-cancelled/);
    assert.equal(h.h.getMode(),'local');
    assert.equal(h.ctx.resets,0);
    assert.equal(native.size,0);
    assert.ok(![...storage.values()].some(x=>String(x).includes('S'.repeat(43))));
  }finally {
    releaseSave.resolve();
    delete globalThis.__TAURI__;
    if(originalStorage===undefined) delete globalThis.localStorage;
    else globalThis.localStorage=originalStorage;
  }
});
