import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMultiplayerClient } from '../src/onlineMultiplayerClient.mjs';

const CODE = 'ABCDEFGH23';
const TOKEN = 'T'.repeat(43);
const room = {code:CODE,revision:1,status:'waiting',turn:'w',ply:0,moves:[],fen:'start'};
class MockSocket {
  handlers = new Map();
  constructor(url) {
    this.url = url;
    queueMicrotask(() => this.emit('open',{}));
  }
  addEventListener(type,callback) {
    this.handlers.set(type, [...(this.handlers.get(type)||[]),callback]);
  }
  emit(type,payload) {
    for (const cb of this.handlers.get(type)||[]) cb(payload);
  }
  send(data) {
    const msg=JSON.parse(data);
    if(msg.type==='auth') {
      assert.equal(msg.token,TOKEN);
      queueMicrotask(()=>this.emit('message', {
        data:JSON.stringify({type:'authenticated',side:'w',room})
      }));
    }
  }
  close() { this.emit('close',{code:1000,reason:''}); }
}

test('browser host timers keep the Window receiver during connect, auth, and close',async()=>{
  const savedSet=globalThis.setTimeout;
  const savedClear=globalThis.clearTimeout;
  let sets=0, clears=0;
  // Reproduce the Windows WebView2 context requirement without a real WebView.
  globalThis.setTimeout=function(...args){
    if(this !== globalThis) throw new TypeError('Illegal invocation — setTimeout receiver');
    sets++;
    return savedSet(...args);
  };
  globalThis.clearTimeout=function(...args){
    if(this !== globalThis) throw new TypeError('Illegal invocation — clearTimeout receiver');
    clears++;
    return savedClear(...args);
  };
  let client;
  try {
    const store={load:()=>null,save:()=>true,clear:()=>{}};
    client = new OnlineMultiplayerClient({baseUrl:'http://127.0.0.1:8787',
      fetchImpl: async (_url,opts)=>({ok:true,status:201,json:async()=>({ok:true,code:CODE,side:'w',token:TOKEN,room})}),
      WebSocketImpl:MockSocket,sessionStore:store});
    await client.create('w');
    await new Promise(resolve=>savedSet(resolve,20));
    assert.equal(client.status,'connected');
    assert.ok(sets>=1,'host timer should be called');
    assert.ok(clears>=1,'watchdog timer should be cleared');
    client.close();
  } finally {
    try { client?.close(); } catch {}
    globalThis.setTimeout=savedSet;
    globalThis.clearTimeout=savedClear;
  }
});
