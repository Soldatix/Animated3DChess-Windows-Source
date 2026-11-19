import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { securitySmoke } from './security-smoke.mjs';

const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cli=resolve(cwd,'node_modules','wrangler','bin','wrangler.js');
const storage=mkdtempSync(join(tmpdir(),'Chess-P3A-SecuritySmoke-'));
const server=spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port','8789','--persist-to',storage],{
  cwd,windowsHide:true,stdio:['ignore','pipe','pipe']
});
let logs='';let stopped=false;
server.stdout.on('data',d=>{logs=(logs+d).slice(-10000);});
server.stderr.on('data',d=>{logs=(logs+d).slice(-10000);});
server.on('exit',()=>{stopped=true;});
try {
  let ready=false;
  for(let n=0;n<100;n++) {
    if(stopped)break;
    try {
      const r=await fetch('http://127.0.0.1:8789/health',{signal:AbortSignal.timeout(750)});
      if(r.ok && (await r.json()).service==='chess-multiplayer'){ready=true;break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready||stopped)throw Error('security-worker-start-failed:'+logs);
  await securitySmoke();
}catch(error) {
  process.exitCode=1;
  console.error('P3A_SECURITY_SMOKE=FAIL',error,'\nWORKER_LOGS:',logs);
}finally {
  if(server.exitCode===null&&server.pid){
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true});
    else server.kill('SIGTERM');
  }
  // Windows taskkill is synchronous; the runner owns this temporary test storage.
  try { rmSync(storage,{recursive:true,force:true}); } catch {}
}
