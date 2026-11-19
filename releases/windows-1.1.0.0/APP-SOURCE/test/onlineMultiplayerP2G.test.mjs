import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMultiplayerClient } from '../src/onlineMultiplayerClient.mjs';
import { createOnlineSessionStore } from '../src/onlineMultiplayerSessionStore.mjs';
const URL = 'http://127.0.0.1:8787', CODE = 'ABCDEFGH23', TOKEN = 'T'.repeat(43);
const initial = {code:CODE,revision:1,status:'waiting',turn:'w',ply:0,moves:[],fen:'init'};
const playing = {...initial,revision:2,status:'playing',whiteJoined:true,blackJoined:true};
const next = {...playing,revision:3,turn:'b',ply:1,moves:['e2e4']};
const storage = () => {
 const map = new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),dump:()=>[...map.values()].join('')};
};
class FakeWS {
 static all=[];
 handlers=new Map();
 constructor(url) { this.url=url; FakeWS.all.push(this); queueMicrotask(()=>this.emit('open',{})); }
 addEventListener(type, fn) { this.handlers.set(type,[...(this.handlers.get(type)||[]),fn]); }
 emit(type,event){ for (const fn of this.handlers.get(type)||[]) fn(event); }
 send(raw) {
  const obj=JSON.parse(raw);
  if(obj.type==='auth'){
   assert.equal(obj.token,TOKEN);
   queueMicrotask(()=>this.emit('message',{data:JSON.stringify({type:'authenticated',side:'w',room:playing})}));
  }
 }
 close() { this.emit('close',{code:1000,reason:''}); }
}
const sleep = () => new Promise(resolve=>setTimeout(resolve,40));
function makeFetch(status='normal'){
 let room=playing, failOnce=false;
 const history=[];
 const fetchImpl=async(url,opts)=>{
  history.push({url, method:opts.method, auth:opts.headers.authorization,body:opts.body});
  if(url.endsWith('/v1/rooms')&&opts.method==='POST') return {ok:true,status:201,json:async()=>({ok:true,code:CODE,side:'w',token:TOKEN,room:initial})};
  if(url.endsWith('/state')) {
   if(status==='revoked')return {ok:false,status:401,json:async()=>({ok:false,error:'unauthorized'})};
   if(status==='offline') throw new TypeError('Failed to fetch');
   return {ok:true,status:200,json:async()=>({ok:true,side:'w',room})};
  }
  if(url.endsWith('/move')) {
   if(status==='ambiguous' && !failOnce){failOnce=true;room=next; throw new TypeError('Network interrupted');}
   if(room.ply===0){room=next;return {ok:true,status:200,json:async()=>({ok:true,room})};}
   return {ok:true,status:200,json:async()=>({ok:true,duplicate:true,room})};
  }
  throw Error('unhandled endpoint');
 };
 return {fetchImpl,history,setRoom:v=>room=v};
}
test('store is bounded, validated, origin-scoped and never publicly serialized', async()=>{
 let tick=1000; const s=storage(), store=createOnlineSessionStore({baseUrl:URL,storage:s,now:()=>tick});
 assert.equal(store.load(),null);
 assert.equal(store.save({code:CODE,side:'w',token:TOKEN}),true);
 assert.deepEqual(store.load(),{code:CODE,side:'w',token:TOKEN});
 assert.equal(createOnlineSessionStore({baseUrl:'https://example.com',storage:s,now:()=>1000}).load(),null);
 assert.equal(JSON.stringify(store.load()).includes(TOKEN),true); // private storage is sensitive
 tick+=48*60*60*1000+1;
 assert.deepEqual(store.load(),{code:CODE,side:'w',token:TOKEN}); // server verifies room expiry
 assert.notEqual(s.dump(), '');
 store.clear();assert.equal(store.load(),null);
});
test('a saved seat resumes after restart with state validation and WS authentication', async()=>{
 FakeWS.all.length=0;
 const s=storage(), store=createOnlineSessionStore({baseUrl:URL,storage:s});
 const api=makeFetch();
 const first=new OnlineMultiplayerClient({baseUrl:URL,sessionStore:store,WebSocketImpl:FakeWS,fetchImpl:api.fetchImpl});
 await first.create('w'); await sleep();
 assert.equal(first.status,'connected');
 assert.equal(JSON.stringify(first.getPublicState()).includes(TOKEN),false);
 first.close(); // closing application keeps the checkpoint
 assert.ok(store.load());
 const observed=[];
 const resumed=new OnlineMultiplayerClient({baseUrl:URL,sessionStore:store,WebSocketImpl:FakeWS,fetchImpl:api.fetchImpl,onRoom:r=>observed.push(r)});
 const data=await resumed.restoreSaved();await sleep();
 assert.equal(data.code,CODE);assert.equal(data.side,'w');assert.equal(resumed.status,'connected');
 assert.equal(observed.at(-1).revision,2);
 assert.equal(api.history.filter(x=>x.url.endsWith('/state')).length,1);
 assert.equal(FakeWS.all.at(-1).url.includes(TOKEN),false);
 resumed.close({forget:true});assert.equal(store.load(),null);
});
test('invalid credentials purge the checkpoint and cannot steal another seat',async()=>{
 const s=storage(), store=createOnlineSessionStore({baseUrl:URL,storage:s});
 store.save({code:CODE,side:'w',token:TOKEN});
 const client=new OnlineMultiplayerClient({baseUrl:URL,sessionStore:store,WebSocketImpl:FakeWS,fetchImpl:makeFetch('revoked').fetchImpl});
 assert.equal(await client.restoreSaved(),null);
 assert.equal(store.load(),null);assert.equal(client.status,'expired');client.close();
});
test('offline start preserves saved seat for later retries, without fabricated moves',async()=>{
 const s=storage(), store=createOnlineSessionStore({baseUrl:URL,storage:s});
 store.save({code:CODE,side:'w',token:TOKEN});
 const client=new OnlineMultiplayerClient({baseUrl:URL,sessionStore:store,WebSocketImpl:FakeWS,fetchImpl:makeFetch('offline').fetchImpl});
 const resumed=await client.restoreSaved();await sleep();
 assert.equal(resumed.code,CODE);assert.equal(resumed.room,null);
 assert.equal(client.status,'connected'); // fake authenticated WS simulates restored connectivity
 assert.ok(store.load());client.close({forget:true});
});
test('uncertain move blocks second move and does not post twice with a fresh id',async()=>{
 FakeWS.all.length=0;
 const s=storage(), store=createOnlineSessionStore({baseUrl:URL,storage:s});
 const api=makeFetch('ambiguous');
 const client=new OnlineMultiplayerClient({baseUrl:URL,sessionStore:store,WebSocketImpl:FakeWS,fetchImpl:api.fetchImpl,retryMs:20});
 await client.create('w');await sleep();
 // server switched to playing when the other seat joins
 FakeWS.all.at(-1).emit('message',{data:JSON.stringify({type:'state',room:playing})});
 await assert.rejects(()=>client.move({from:'e2',to:'e4',expectedPly:0,clientMoveId:'moveID0000123'}));
 assert.equal(client.getPublicState().pending,true);
 await assert.rejects(()=>client.move({from:'d2',to:'d4',expectedPly:0,clientMoveId:'DIFFERENT1234'}));
 await sleep();await sleep();
 assert.equal(client.room.ply,1); assert.equal(client.getPublicState().pending,false);
 assert.equal(api.history.filter(x=>x.url.endsWith('/move')).length,1);
 assert.ok(store.load()); client.close({forget:true});
});
