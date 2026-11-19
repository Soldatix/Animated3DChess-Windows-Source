import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineSessionStore} from '../src/onlineMultiplayerSessionStore.mjs';
import {OnlineMultiplayerClient} from '../src/onlineMultiplayerClient.mjs';
const BASE='http://127.0.0.1:8787', CODE='ABCDEFGH23', TOKEN='S'.repeat(43);
const session={code:CODE,side:'w',token:TOKEN};
function storage() {
 const map=new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),dump:()=>[...map.entries()]};
}
function mockNative() {
 const map=new Map(); const calls=[];
 Object.defineProperty(globalThis,'__TAURI__',{configurable:true,value:{core:{invoke:async(name,args)=>{
   calls.push(name);
   if(name==='online_vault_save'){map.set(args.baseUrl,args.record);return null;}
   if(name==='online_vault_load')return map.get(args.baseUrl)??null;
   if(name==='online_vault_clear'){map.delete(args.baseUrl);return null;}
   throw Error('unknown command');
 }}}});
 return {map,calls,off:()=>delete globalThis.__TAURI__};
}

test('browser fallback retains a potentially valid seat beyond 48 hours until server rejects it',()=>{
 const s=storage(); let now=1000;
 const store=createOnlineSessionStore({baseUrl:BASE,storage:s,now:()=>now});
 assert.equal(store.save(session),true);
 now+=49*3600*1000;
 assert.deepEqual(store.load(),session);
 store.clear(); assert.deepEqual(s.dump(),[]);
});

test('native checkpoint uses Credential Manager only and restores after a new app instance',async()=>{
 const native=mockNative(); const prevStorage=globalThis.localStorage;
 const s=storage(); globalThis.localStorage=s;
 try {
  const store=createOnlineSessionStore({baseUrl:BASE});
  assert.equal(store.requiresAsyncLookup,true);
  assert.equal(store.save(session),false); // forbid plaintext fallback
  assert.equal(await store.saveAsync(session),true);
  assert.equal(native.map.size,1);
  assert.deepEqual(s.dump(),[]); // no token, not even metadata
  const store2=createOnlineSessionStore({baseUrl:BASE});
  assert.deepEqual(await store2.loadAsync(),session);
  assert.equal(JSON.stringify(store2).includes(TOKEN),false);
  await store2.clearAsync();
  assert.equal(native.map.size,0);
  assert.deepEqual(s.dump(),[]);
 } finally {native.off(); if(prevStorage===undefined) delete globalThis.localStorage;else globalThis.localStorage=prevStorage;}
});

test('legacy token migrates once, only deleted after vault save succeeds',async()=>{
 const s=storage(); const previous=globalThis.localStorage;globalThis.localStorage=s;
 const oldStore=createOnlineSessionStore({baseUrl:BASE,storage:s});
 oldStore.save(session);
 const native=mockNative();
 try {
  const fresh=createOnlineSessionStore({baseUrl:BASE});
  assert.deepEqual(await fresh.loadAsync(),session);
  assert.equal(native.map.size,1);
  assert.equal(s.dump().some(([k,v])=>v.includes(TOKEN)),false);
 } finally {native.off();if(previous===undefined) delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('explicit Leave tombstone prevents restore even when async clear fails',async()=>{
 const s=storage(); const previous=globalThis.localStorage;globalThis.localStorage=s;
 const native=mockNative();
 try {
   const store=createOnlineSessionStore({baseUrl:BASE});
   await store.saveAsync(session);
   const pending=store.clearAsync();
   assert.deepEqual(await store.loadAsync(),null);
   await pending;
   assert.equal(native.map.size,0);
 }finally{native.off();if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('native vault failure rejects create, never stores plaintext and resets transient seat',async()=>{
 const s=storage(),previous=globalThis.localStorage;globalThis.localStorage=s;
 Object.defineProperty(globalThis,'__TAURI__',{configurable:true,value:{core:{invoke:async()=>{throw Error('vault unavailable');}}}});
 try {
  const client=new OnlineMultiplayerClient({baseUrl:BASE,WebSocketImpl:class{},fetchImpl:async()=>({ok:true,status:201,json:async()=>({ok:true,code:CODE,side:'w',token:TOKEN,room:{code:CODE,revision:1}})})});
  await assert.rejects(()=>client.create('w'),/secure-session-save-failed/);
  assert.equal(client.code,null);
  assert.deepEqual(s.dump(),[]);
  client.close();
 }finally{delete globalThis.__TAURI__;if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
