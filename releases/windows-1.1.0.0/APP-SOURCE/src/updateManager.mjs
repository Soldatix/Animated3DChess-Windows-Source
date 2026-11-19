import {compareVersions,evaluateUpdate,getLatestVersion} from './updateManagerCore.mjs';

// Static version is injected by Vite from package.json (web) or Tauri PROD overlay (Windows).
export const CURRENT_VERSION = __CHESS_APP_VERSION__;
const desktop = import.meta.env.MODE === 'desktop';
const standalone = !desktop && (window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true);
export const UPDATE_CHANNEL = desktop ? 'microsoft-store' : standalone ? 'pwa' : 'web';
const MANIFEST_URL = desktop ? 'https://chess.appsandgames.org/chess-updates.json' : '/chess-updates.json';
const STORE_URL = 'https://apps.microsoft.com/detail/9mwq5cznlsbd';
const listeners = new Set();
const lastKnownKey = 'wizard-chess-update-known-v1:' + UPDATE_CHANNEL;
function readKnownVersion(){
  try{
    const value = localStorage.getItem(lastKnownKey);
    return value && compareVersions(value,CURRENT_VERSION)>0 ? value : null;
  }catch{return null;}
}
function rememberLatest(version){
  try{
    if(compareVersions(version,CURRENT_VERSION)>0)localStorage.setItem(lastKnownKey,version);
    else localStorage.removeItem(lastKnownKey);
  }catch{/* Storage disabled: in-memory state still works. */}
}
const knownVersion=readKnownVersion();
let state = Object.freeze({status:'unknown',latest:knownVersion,available:!!knownVersion,waiting:false,dismissed:false,busy:false,message:''});
let started=false, inFlight=null, registration=null, applyRequested=false;
const update = changes => {state=Object.freeze({...state,...changes}); for(const cb of listeners)cb();};
export const subscribeUpdates = cb => {listeners.add(cb);return()=>listeners.delete(cb);};
export const getUpdateSnapshot = () => state;
export const getServerUpdateSnapshot = () => state;
export const postponeUpdate = () => update({dismissed:true});
function onlineGameActive(){
  try{return window.wizardChess?.getGameMode?.()==='multi';}catch{return true;}
}
function watchRegistration(reg){
  if(!reg || reg===registration)return;
  registration=reg;
  const track=()=>{
    if(reg.waiting && navigator.serviceWorker.controller)
      update({waiting:true,available:true,dismissed:false});
  };
  reg.addEventListener('updatefound',()=>{
    const worker=reg.installing;
    if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed')track();});
  });
  track();
}
async function inspectWorker(checkNetwork=false){
  if(desktop || !('serviceWorker' in navigator))return;
  const reg=await navigator.serviceWorker.getRegistration('/');
  if(!reg)return;
  watchRegistration(reg);
  if(checkNetwork)await reg.update();
  if(reg.waiting && navigator.serviceWorker.controller)update({waiting:true,available:true});
}
export async function checkForUpdates({manual=false}={}){
  if(inFlight)return inFlight;
  inFlight=(async()=>{
    update({busy:true,status:'checking',message:''});
    try{
      const ctl=new AbortController();
      const timer=window.setTimeout(()=>ctl.abort(),8000);
      let response;
      try{
        response=await fetch(MANIFEST_URL,{cache:'no-store',signal:ctl.signal,credentials:'omit',redirect:'error'});
        if(!response.ok)throw Error('HTTP_'+response.status);
        if(Number(response.headers.get('content-length')||0)>8192)throw Error('MANIFEST_TOO_LARGE');
        const body=await response.text();
        if(body.length>8192)throw Error('MANIFEST_TOO_LARGE');
        const latest=getLatestVersion(JSON.parse(body),UPDATE_CHANNEL);
        const newer=compareVersions(latest,CURRENT_VERSION)>0;
        rememberLatest(latest);
        update({latest,status:'current',message:'',available:newer||state.waiting,
          dismissed:state.latest && state.latest!==latest ? false : state.dismissed});
      }finally{window.clearTimeout(timer);}
      try{await inspectWorker(manual);}catch{/* Network check succeeded, but SW refresh might not. */}
      update({status:'current',available:evaluateUpdate({latest:state.latest,current:CURRENT_VERSION,waiting:state.waiting})});
    }catch(_){
      // Crucial: a failed network fetch is never "up to date". Retain known availability.
      update({status:'error',message:'CHECK_FAILED'});
      try{await inspectWorker(false);}catch{/* No SW available. */}
    }finally{update({busy:false});}
    return state;
  })();
  try{return await inFlight;}finally{inFlight=null;}
}
export function startUpdateManager(){
  if(started)return;
  started=true;
  if(!desktop && 'serviceWorker' in navigator){
    window.addEventListener('chess-pwa-registration',()=>{void inspectWorker(false);});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const confirmed = applyRequested;
      applyRequested=false;
      if(confirmed && !onlineGameActive())window.location.reload();
      else void inspectWorker(false);
    });
    void inspectWorker(false);
  }
  // Keep startup smooth; one check per launch and periodic checks, no background service.
  window.setTimeout(()=>{void checkForUpdates();},4500);
  window.setInterval(()=>{void checkForUpdates();},6*60*60*1000);
}
export async function applyAvailableUpdate(){
  if(onlineGameActive()){update({message:'ACTIVE_GAME'});return false;}
  if(!state.available)return false;
  if(desktop){
    const invoke=window.__TAURI__?.core?.invoke;
    if(typeof invoke!=='function'){update({message:'STORE_OPEN_FAILED'});return false;}
    try{await invoke('open_apps_games_url',{kind:'store'});update({message:''});return true;}
    catch{update({message:'STORE_OPEN_FAILED'});return false;}
  }
  try{
    await inspectWorker(true);
    if(registration && navigator.serviceWorker.controller){
      const waiting=registration.waiting;
      if(!waiting){update({message:'PREPARING_UPDATE'});return false;}
      if(onlineGameActive()){update({message:'ACTIVE_GAME'});return false;}
      applyRequested=true;
      waiting.postMessage({type:'CHESS_APPLY_UPDATE'});
      return true;
    }
    if(!onlineGameActive()){window.location.reload();return true;}
  }catch{update({message:'CHECK_FAILED'});}
  return false;
}
export const officialStoreUrl = STORE_URL;
