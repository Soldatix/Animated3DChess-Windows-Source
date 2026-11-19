// P3-C11F F2: actual client + extracted 3D queue regression (no real network).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {OnlineMultiplayerClient} from '../src/onlineMultiplayerClient.mjs';

const CODE = 'ABCDEFGH23';
const TOKEN = 'T'.repeat(43);
const makeRoom = (revision, moves) => ({
  code:CODE,revision,ply:moves.length,moves,status:'playing',
  turn:moves.length%2===0?'w':'b',fen:'engine-test-stub',
  whiteJoined:true,blackJoined:true
});
const r2=makeRoom(2,[]),r3=makeRoom(3,['e2e4']),r4=makeRoom(4,['e2e4','e7e5']);
const acceptedResponse = data => ({ok:true,status:200,json:async()=>({ok:true,...data})});
const tick = () => new Promise(resolve=>setImmediate(resolve));

class FakeWS {
  static last;
  handlers=new Map();
  constructor(url){this.url=url;FakeWS.last=this;queueMicrotask(()=>this.emit('open',{}));}
  addEventListener(k,f){this.handlers.set(k,[...(this.handlers.get(k)||[]),f]);}
  emit(k,p){for(const fn of this.handlers.get(k)||[])fn(p);}
  send(raw){
    const body=JSON.parse(raw);
    if(body.type==='auth') {
      assert.equal(body.token,TOKEN);
      queueMicrotask(()=>this.emit('message',{data:JSON.stringify({
        type:'authenticated',side:'w',room:r2
      })}));
    }
  }
  close(){this.emit('close',{code:1000,reason:''});}
  state(room){this.emit('message',{data:JSON.stringify({type:'state',room})});}
}

function engineQueue() {
  // Exercise the actual in-repository queueOnlineRoomState implementation.
  // Leave dependencies as deterministic stubs so the test is independent of WebGL.
  const source=readFileSync(new URL('../src/wizardChessEngine.js',import.meta.url),'utf8');
  const begin=source.indexOf('    function queueOnlineRoomState(room) {');
  const end=source.indexOf('    function drainOnlineQueue() {',begin);
  assert.ok(begin!==-1&&end>begin,'engine queue anchors');
  const ctx={
    gameMode:'multi',onlineClient:null,onlineRoomSnapshot:null,onlineError:null,
    onlineAppliedMoves:[],onlineVerified:null,freezeReasons:[],onAccepted:[],
    validateOnlineSnapshot:room=>({
      revision:room.revision,ply:room.ply,steps:room.moves.map(uci=>({uci}))
    }),
    assertOnlinePrefix:(applied,verified)=>{
      if(applied.length>verified.ply)throw Error('online-state-rewound');
      if(applied.some((uci,i)=>uci!==verified.steps[i]?.uci))throw Error('online-history-fork');
    },
    broadcastOnlineState(){},drainOnlineQueue(){},
    freezeOnline(reason){ctx.onlineError=reason;ctx.freezeReasons.push(reason);}
  };
  runInNewContext(source.slice(begin,end),ctx,{filename:'queueOnlineRoomState-engine-source.js'});
  return {ctx,queue:ctx.queueOnlineRoomState};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function connectedClient(fetchImpl) {
  const engine=engineQueue();
  let client;
  client=new OnlineMultiplayerClient({
    baseUrl:'http://127.0.0.1:8787',fetchImpl,WebSocketImpl:FakeWS,
    sessionStore:{save:()=>true,clear(){},load:()=>null},
    onRoom:room=>{if(engine.ctx.onlineClient)engine.queue(room);}
  });
  await client.create('w');
  engine.ctx.onlineClient=client;
  await tick();
  assert.equal(client.status,'connected');
  engine.queue(r2);
  return {client,engine};
}

test('delayed move HTTP response returns current WS revision and does not freeze 3D engine',async()=>{
  const pending=deferred(),started=deferred();
  const fetchImpl=async (url)=>{
    if(url.endsWith('/v1/rooms'))return acceptedResponse({code:CODE,side:'w',token:TOKEN,room:r2});
    if(url.endsWith('/move')){
      started.resolve();await pending.promise;
      return acceptedResponse({room:r3});
    }
    throw Error('Unexpected request: '+url);
  };
  const {client,engine}=await connectedClient(fetchImpl);
  try {
    const movePromise=client.move({from:'e2',to:'e4',expectedPly:0,clientMoveId:'F2_TEST_MOVE_0001'});
    await started.promise;
    FakeWS.last.state(r3);FakeWS.last.state(r4);
    engine.ctx.onlineAppliedMoves=['e2e4','e7e5'];
    assert.equal(client.room.revision,4);
    pending.resolve();
    const confirmed=await movePromise;
    assert.equal(confirmed.revision,4,'move() must return accepted/current state, not stale HTTP response');
    engine.queue(confirmed);
    assert.equal(engine.ctx.onlineRoomSnapshot.revision,4);
    assert.deepEqual(engine.ctx.freezeReasons,[]);
    assert.equal(engine.ctx.onlineError,null);
  } finally {pending.resolve();client.close({forget:true});}
});

test('delayed action HTTP response returns current WS revision',async()=>{
  const pending=deferred(),started=deferred();
  const fetchImpl=async url=>{
    if(url.endsWith('/v1/rooms'))return acceptedResponse({code:CODE,side:'w',token:TOKEN,room:r2});
    if(url.endsWith('/draw-offer')){
      started.resolve();await pending.promise;
      return acceptedResponse({room:r3});
    }
    throw Error('Unexpected request: '+url);
  };
  const {client,engine}=await connectedClient(fetchImpl);
  try {
    const actionPromise=client.action('draw-offer');
    await started.promise;
    FakeWS.last.state(r3);FakeWS.last.state(r4);
    engine.ctx.onlineAppliedMoves=['e2e4','e7e5'];
    pending.resolve();
    const confirmed=await actionPromise;
    assert.equal(confirmed.revision,4,'action() must return accepted/current state');
    engine.queue(confirmed);
    assert.deepEqual(engine.ctx.freezeReasons,[]);
  } finally {pending.resolve();client.close({forget:true});}
});

test('3D engine drops obsolete snapshots before prefix validation but still blocks a real fork',()=>{
  const {ctx,queue}=engineQueue();
  ctx.onlineClient={code:CODE};
  ctx.onlineAppliedMoves=['e2e4','e7e5'];
  queue(r4);
  assert.equal(ctx.onlineRoomSnapshot.revision,4);
  queue(r3); // Earlier HTTP or WS response; must not inspect truncated history.
  assert.equal(ctx.onlineRoomSnapshot.revision,4);
  assert.deepEqual(ctx.freezeReasons,[]);
  queue(makeRoom(5,['e2e4','d7d5'])); // Non-stale but incompatible.
  assert.deepEqual(ctx.freezeReasons,['online-history-fork']);
  assert.equal(ctx.onlineRoomSnapshot.revision,4);
});
