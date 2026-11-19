import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { validateOnlineSnapshot, assertOnlinePrefix, boardToSquare, squareToBoard } from '../src/onlineMultiplayerReplay.mjs';
import { OnlineMultiplayerClient } from '../src/onlineMultiplayerClient.mjs';

const CODE = 'ABCDEFGH23';
const TOKEN = 'S'.repeat(43);
function snapshot(moves = [], status = 'playing') {
  const chess = new Chess(); const applied = [];
  for (const uci of moves) {
    const played = chess.move({ from:uci.slice(0,2), to:uci.slice(2,4),
      ...(uci.length===5 ? {promotion:uci[4]} : {}) });
    applied.push({from:played.from,to:played.to,promotion:played.promotion||null});
  }
  return {code:CODE,status,turn:chess.turn(),fen:chess.fen(),ply:moves.length,
    revision:moves.length+2,moves,whiteJoined:true,blackJoined:true,
    lastMove:applied.at(-1)||null, drawOfferedBy:null};
}
test('verify authoritative server replay and strict FEN parity', () => {
  const room = snapshot(['e2e4','e7e5','g1f3']);
  const verified=validateOnlineSnapshot(room);
  assert.equal(verified.ply,3);
  assert.equal(verified.steps[1].from,'e7');
  assert.equal(verified.fens[3],room.fen);
  assert.equal(assertOnlinePrefix(['e2e4'],verified),true);
  assert.throws(()=>assertOnlinePrefix(['d2d4'],verified),/fork/);
  assert.throws(()=>validateOnlineSnapshot({...room,fen:snapshot([]).fen}),/mismatch/);
  assert.throws(()=>validateOnlineSnapshot({...room,moves:['e2e5'],ply:1}),/illegal-server-history/);
});
test('coordinate mapping is exact',()=>{
  assert.equal(boardToSquare(6,4),'e2');
  assert.deepEqual(squareToBoard('h8'),{r:0,c:7});
  assert.throws(()=>squareToBoard('j9'));
});
test('rejects external plaintext, credentials and invalid base URLs',()=>{
  assert.throws(()=>new OnlineMultiplayerClient({baseUrl:'http://remote.example',WebSocketImpl:class{}}),/invalid-server-url/);
  assert.throws(()=>new OnlineMultiplayerClient({baseUrl:'https://host.example/?token=abc',WebSocketImpl:class{}}),/invalid-server-url/);
});
test('tokens go only through bearer/auth handshake, moves commit only on server acceptance',async()=>{
  const sent=[];const wsUrls=[];const statuses=[];
  class FakeWS {
    constructor(url){this.handlers=new Map();wsUrls.push(url);queueMicrotask(()=>this.emit('open',{}));}
    addEventListener(name,handler){const arr=this.handlers.get(name)||[];arr.push(handler);this.handlers.set(name,arr);}
    emit(name,detail){for(const handler of this.handlers.get(name)||[])handler(detail);}
    send(json){const msg=JSON.parse(json);sent.push(msg);
      if(msg.type==='auth')queueMicrotask(()=>this.emit('message',{data:JSON.stringify({type:'authenticated',side:'w',room:snapshot([])})}));}
    close(){this.emit('close',{});}
  }
  const calls=[];
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    if(url.endsWith('/v1/rooms')) return response({ok:true,code:CODE,side:'w',token:TOKEN,room:snapshot([])},201);
    if(url.endsWith('/move')) return response({ok:true,room:snapshot(['e2e4'])});
    throw new Error('unexpected-request:'+url);
  };
  const client=new OnlineMultiplayerClient({baseUrl:'http://127.0.0.1:8787',fetchImpl,WebSocketImpl:FakeWS,
    onConnection:s=>statuses.push(s)});
  try{
    const made=await client.create('w');
    assert.equal(made.code,CODE);
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(client.status,'connected');
    const room=await client.move({from:'e2',to:'e4',clientMoveId:'move_test_uuid123',expectedPly:0});
    assert.equal(room.ply,1);
    assert.equal(calls.at(-1).opts.headers.authorization,'Bearer '+TOKEN);
    assert.equal(JSON.parse(calls.at(-1).opts.body).from,'e2');
    assert.equal(wsUrls.length,1);
    assert.equal(wsUrls[0].includes(TOKEN),false);
    assert.equal(sent[0].type,'auth');
    assert.equal(sent[0].token,TOKEN);
    assert.equal(JSON.stringify(client.getPublicState()).includes(TOKEN),false);
  }finally{client.close();}
  assert.equal(statuses.at(-1),'disconnected');
});
