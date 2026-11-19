import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let id=0;
function load(mode='desktop',version='1.0.0'){
  const source=readFileSync(path.join(root,'src/updateManager.mjs'),'utf8')
    .replace("from './updateManagerCore.mjs'",`from '${pathToFileURL(path.join(root,'src/updateManagerCore.mjs')).href}'`)
    .replaceAll('import.meta.env.MODE',JSON.stringify(mode))
    .replaceAll('__CHESS_APP_VERSION__',JSON.stringify(version));
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}#${id++}`);
}
function environment({online=false,known=null,worker=null}={}){
  const values=new Map(known?[['wizard-chess-update-known-v1:microsoft-store',known]]:[]);
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const invoked=[];
  const windowListeners={};
  globalThis.window={
    setTimeout:()=>123,clearTimeout:()=>{},setInterval:()=>123,
    wizardChess:{getGameMode:()=>online?'multi':'computer'},
    matchMedia:()=>({matches:false}),
    addEventListener:(name,fn)=>{windowListeners[name]=fn;},
    location:{reload:()=>{throw Error('unexpected reload');}},
    __TAURI__:{core:{invoke:async(command,args)=>{invoked.push({command,args});}}}
  };
  const workerListeners={};
  Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{
    standalone:false,
    serviceWorker:worker?{
      controller:{},
      getRegistration:async()=>worker,
      addEventListener:(name,fn)=>{workerListeners[name]=fn;}
    }:undefined
  }});
  return {values,invoked,windowListeners,workerListeners};
}
const manifest=(version)=>JSON.stringify({schemaVersion:1,product:'animated-3d-chess',channels:{'microsoft-store':{version},web:{version},pwa:{version}}});
const respond=version=>({ok:true,headers:new Map([['content-length',String(manifest(version).length)]]),text:async()=>manifest(version)});
test('manual check finds update; Later retains badge; store button opens fixed allowlisted link',async()=>{
  const env=environment();
  globalThis.fetch=async()=>respond('1.1.0');
  const u=await load();
  assert.equal((await u.checkForUpdates({manual:true})).available,true);
  assert.equal(u.getUpdateSnapshot().latest,'1.1.0');
  u.postponeUpdate();
  assert.equal(u.getUpdateSnapshot().dismissed,true);
  assert.equal(u.getUpdateSnapshot().available,true);
  assert.equal(env.values.get('wizard-chess-update-known-v1:microsoft-store'),'1.1.0');
  assert.equal(await u.applyAvailableUpdate(),true);
  assert.deepEqual(env.invoked,[{command:'open_apps_games_url',args:{kind:'store'}}]);
});
test('offline check never falsely claims current and preserves previously known update',async()=>{
  environment({known:'1.3.0'});
  globalThis.fetch=async()=>{throw Error('offline');};
  const u=await load();
  assert.equal(u.getUpdateSnapshot().available,true);
  await u.checkForUpdates({manual:true});
  assert.equal(u.getUpdateSnapshot().status,'error');
  assert.equal(u.getUpdateSnapshot().available,true);
});
test('successful check of current release clears previously known badge',async()=>{
  const env=environment({known:'1.3.0'});
  globalThis.fetch=async()=>respond('1.0.0');
  const u=await load();
  await u.checkForUpdates({manual:true});
  assert.equal(u.getUpdateSnapshot().status,'current');
  assert.equal(u.getUpdateSnapshot().available,false);
  assert.equal(env.values.has('wizard-chess-update-known-v1:microsoft-store'),false);
});
test('active online game cannot open Store even for a real update',async()=>{
  const env=environment({online:true});
  globalThis.fetch=async()=>respond('1.2.0');
  const u=await load();await u.checkForUpdates({manual:true});
  assert.equal(await u.applyAvailableUpdate(),false);
  assert.equal(u.getUpdateSnapshot().message,'ACTIVE_GAME');
  assert.equal(env.invoked.length,0);
});
test('waiting PWA worker remains waiting until explicit apply',async()=>{
  const sent=[];
  const registration={waiting:{postMessage:obj=>sent.push(obj)},update:async()=>{},addEventListener:()=>{}};
  environment({worker:registration});
  globalThis.fetch=async()=>respond('1.1.0');
  const u=await load('production');
  await u.checkForUpdates({manual:true});
  assert.equal(u.getUpdateSnapshot().available,true);
  assert.equal(sent.length,0);
  assert.equal(await u.applyAvailableUpdate(),true);
  assert.deepEqual(sent,[{type:'CHESS_APPLY_UPDATE'}]);
});
