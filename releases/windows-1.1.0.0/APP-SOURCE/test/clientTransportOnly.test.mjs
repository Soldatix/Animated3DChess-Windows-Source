import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OnlineMultiplayerClient} from '../src/onlineMultiplayerClient.mjs';
const TOKEN='T'.repeat(43), CODE='ABCDEFGH23';
const room={code:CODE,revision:1,status:'waiting',turn:'w',ply:0,moves:[],fen:'ignored-in-client'};
test('no forged room and no credential in URL, WS authenticates before connected',async()=>{
 let socket;
 class FakeWebSocket {
  handlers=new Map();
  constructor(url){this.url=url;socket=this;queueMicrotask(()=>this.emit('open',{}));}
  addEventListener(ev,fn){const v=this.handlers.get(ev)||[];v.push(fn);this.handlers.set(ev,v);}
  emit(ev,arg){for(const fn of this.handlers.get(ev)||[])fn(arg);}
  send(raw){const m=JSON.parse(raw);if(m.type==='auth'){
    assert.equal(m.token,TOKEN);
    queueMicrotask(()=>this.emit('message',{data:JSON.stringify({type:'authenticated',side:'w',room})}));
  }}
  close(){this.emit('close',{});}
 }
 const fetchImpl=async(url,opts)=>({ok:true,status:201,json:async()=>({ok:true,code:CODE,side:'w',token:TOKEN,room})});
 const client=new OnlineMultiplayerClient({baseUrl:'http://127.0.0.1:8787',WebSocketImpl:FakeWebSocket,fetchImpl});
 await client.create('w');
 assert.equal(socket.url.includes(TOKEN),false);
 await new Promise(r=>setTimeout(r,20));
 assert.equal(client.status,'connected');
 assert.equal(JSON.stringify(client.getPublicState()).includes(TOKEN),false);
 client.close();
 assert.equal(client.status,'disconnected');
});
